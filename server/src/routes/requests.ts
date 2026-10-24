import { Router, Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { query, pool } from '../db';
import webpush from 'web-push';

const router = Router();
const FEE_KOBO = 50000;
let schemaPromise: Promise<void> | null = null;

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS property_requests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          seeker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          property_type TEXT NOT NULL,
          area TEXT NOT NULL,
          budget NUMERIC(14,2) NOT NULL CHECK (budget > 0),
          requirements TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'pending_payment',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          published_at TIMESTAMPTZ,
          expires_at TIMESTAMPTZ
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS payments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          request_id UUID NOT NULL REFERENCES property_requests(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          reference TEXT NOT NULL UNIQUE,
          amount_kobo INTEGER NOT NULL,
          currency TEXT NOT NULL DEFAULT 'NGN',
          status TEXT NOT NULL DEFAULT 'pending',
          paystack_access_code TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          paid_at TIMESTAMPTZ,
          raw_response JSONB
        )
      `);

      await query(`CREATE INDEX IF NOT EXISTS idx_property_requests_seeker ON property_requests(seeker_id, created_at DESC)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_property_requests_expiry ON property_requests(status, expires_at)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_payments_request ON payments(request_id)`);
      await query(`
        CREATE TABLE IF NOT EXISTS agent_areas (
          agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          area TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (agent_id, area)
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS area_catalog (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          area TEXT NOT NULL,
          normalized_area TEXT NOT NULL UNIQUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await query(`
        INSERT INTO area_catalog (area, normalized_area)
        SELECT area, LOWER(REGEXP_REPLACE(TRIM(area), '\\s+', ' ', 'g'))
        FROM UNNEST(ARRAY[
          'Barnawa', 'GRA', 'Kawo', 'Malali', 'Ungwan Rimi',
          'Ungwan Sarki', 'Narayi', 'Nasarawa', 'Rigasa',
          'Sabon Tasha', 'Tudun Wada', 'Television', 'Badarawa',
          'Kabala', 'Kakuri', 'Kurmin Mashi', 'Makera', 'Mando',
          'Gonin Gora', 'Kudenda', 'Romi', 'Hayin Banki',
          'Ungwan Dosa', 'Birnin Gwari', 'Chikun', 'Giwa', 'Igabi',
          'Ikara', 'Jaba', 'Jema''a', 'Kachia', 'Kaduna North',
          'Kaduna South', 'Kagarko', 'Kajuru', 'Kaura', 'Kauru',
          'Kubau', 'Kudan', 'Lere', 'Makarfi', 'Sabon Gari',
          'Sanga', 'Soba', 'Zangon Kataf', 'Zaria'
        ]::TEXT[]) AS seed(area)
        ON CONFLICT (normalized_area) DO NOTHING
      `);

      await query(`
        ALTER TABLE property_requests
        ADD COLUMN IF NOT EXISTS claimed_by UUID REFERENCES users(id) ON DELETE SET NULL
      `);
      await query(`
        ALTER TABLE property_requests
        ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ
      `);

      await query(`
        ALTER TABLE property_requests
        ADD COLUMN IF NOT EXISTS progress_status TEXT NOT NULL DEFAULT 'claimed'
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_agent_areas_agent ON agent_areas(agent_id, area)
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS released_request_agents (
          request_id UUID NOT NULL REFERENCES property_requests(id) ON DELETE CASCADE,
          agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          released_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (request_id, agent_id)
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          endpoint TEXT PRIMARY KEY,
          agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          subscription JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS agent_notifications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          request_id UUID NOT NULL REFERENCES property_requests(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          read_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (agent_id, request_id)
        )
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_agent_notifications_agent_created
        ON agent_notifications (agent_id, created_at DESC)
      `);

    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

type AuthenticatedRequest = Request & {
  nestoraUser?: {
    id: string;
    role: string;
    email: string;
    email_verified: boolean;
    agent_status: string;
  };
};

async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
    const secret = process.env.JWT_SECRET;

    if (!token || !secret) {
      res.status(401).json({ error: 'Please sign in to continue.' });
      return;
    }

    const payload = jwt.verify(token, secret) as JwtPayload;
    const identity = String(payload.id || payload.userId || payload.sub || '');
    const email = String(payload.email || '');

    if (!identity && !email) {
      res.status(401).json({ error: 'Invalid login session. Please sign in again.' });
      return;
    }

    const result = await query(
      `SELECT id, role, email, email_verified, agent_status, deleted_at FROM users
       WHERE (($1 <> '' AND id::text = $1) OR ($2 <> '' AND email = $2))
       LIMIT 1`,
      [identity, email]
    );

    if (!result.rows.length) {
      res.status(401).json({ error: 'Account not found. Please sign in again.' });
      return;
    }

    const user = result.rows[0];

    if (user.deleted_at) {
      res.status(401).json({ error: 'This account has been deleted.' });
      return;
    }
    req.nestoraUser = {
      id: String(user.id),
      role: String(user.role),
      email: String(user.email),
      email_verified: Boolean(user.email_verified),
      agent_status: String(user.agent_status)
    };

    next();
  } catch {
    res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
}


router.use(authenticate);

router.use(async (_req, res, next) => {
  try {
    await ensureSchema();
    next();
  } catch (error) {
    console.error('Nestora request schema error:', error);
    res.status(500).json({ error: 'Request service is temporarily unavailable.' });
  }
});


router.get('/push-public-key', (req: AuthenticatedRequest, res: Response) => {
  if (req.nestoraUser?.role !== 'agent') {
    res.status(403).json({ error: 'Agents only' });
    return;
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    res.status(503).json({ error: 'Push notifications are not configured' });
    return;
  }

  res.json({ publicKey });
});

router.post('/push-subscription', async (req: AuthenticatedRequest, res: Response) => {
  const user = req.nestoraUser;
  if (user?.role !== 'agent') {
    res.status(403).json({ error: 'Agents only' });
    return;
  }

  const subscription = req.body?.subscription;
  const endpoint = subscription?.endpoint;

  if (
    typeof endpoint !== 'string' ||
    !endpoint.startsWith('https://') ||
    !subscription?.keys?.p256dh ||
    !subscription?.keys?.auth
  ) {
    res.status(400).json({ error: 'Invalid push subscription' });
    return;
  }

  try {
    await query(
      `INSERT INTO push_subscriptions (endpoint, agent_id, subscription)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (endpoint) DO UPDATE
       SET agent_id = EXCLUDED.agent_id,
           subscription = EXCLUDED.subscription,
           created_at = NOW()`,
      [endpoint, user.id, JSON.stringify(subscription)]
    );
    res.json({ saved: true });
  } catch (error) {
    console.error('Saving push subscription failed:', error);
    res.status(500).json({ error: 'Could not save push subscription' });
  }
});

router.delete('/push-subscription', async (req: AuthenticatedRequest, res: Response) => {
  const user = req.nestoraUser;
  const endpoint = req.body?.endpoint;

  if (user?.role !== 'agent') {
    res.status(403).json({ error: 'Agents only' });
    return;
  }
  if (typeof endpoint !== 'string') {
    res.status(400).json({ error: 'Subscription endpoint is required' });
    return;
  }

  try {
    await query(
      'DELETE FROM push_subscriptions WHERE endpoint = $1 AND agent_id = $2',
      [endpoint, user.id]
    );
    res.json({ removed: true });
  } catch (error) {
    console.error('Removing push subscription failed:', error);
    res.status(500).json({ error: 'Could not remove push subscription' });
  }
});




router.get('/area-catalog', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureSchema();
    const result = await query('SELECT area FROM area_catalog ORDER BY area');
    res.json({ areas: result.rows.map((row) => row.area) });
  } catch (error) {
    console.error('Load shared area catalogue error:', error);
    res.status(500).json({ error: 'Could not load Kaduna areas.' });
  }
});

router.post('/area-catalog', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureSchema();
    const rawArea = req.body?.area;

    if (typeof rawArea !== 'string') {
      res.status(400).json({ error: 'Enter a Kaduna area name.' });
      return;
    }

    const area = rawArea.trim().replace(/\s+/g, ' ');
    const normalized = area.toLowerCase();

    if (!area || area.length > 100 || normalized === 'other kaduna area') {
      res.status(400).json({ error: 'Enter a specific Kaduna area (maximum 100 characters).' });
      return;
    }

    const result = await query(
      `INSERT INTO area_catalog (area, normalized_area)
       VALUES ($1, $2)
       ON CONFLICT (normalized_area)
       DO UPDATE SET normalized_area = EXCLUDED.normalized_area
       RETURNING area`,
      [area, normalized]
    );

    res.json({ area: result.rows[0].area });
  } catch (error) {
    console.error('Save shared area error:', error);
    res.status(500).json({ error: 'Could not save this Kaduna area.' });
  }
});

router.get('/areas', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const agent = req.nestoraUser!;
    if (agent.role !== 'agent') {
      res.status(403).json({ error: 'Agent accounts only.' });
      return;
    }

    const result = await query(
      'SELECT area FROM agent_areas WHERE agent_id = $1 ORDER BY area',
      [agent.id]
    );
    res.json({ areas: result.rows.map((row) => row.area) });
  } catch (error) {
    console.error('Load agent areas error:', error);
    res.status(500).json({ error: 'Could not load service areas.' });
  }
});

router.put('/areas', async (req: AuthenticatedRequest, res: Response) => {
  const agent = req.nestoraUser!;
  const allowedAreas = [
  'Barnawa',
  'GRA',
  'Kawo',
  'Malali',
  'Ungwan Rimi',
  'Ungwan Sarki',
  'Narayi',
  'Nasarawa',
  'Rigasa',
  'Sabon Tasha',
  'Tudun Wada',
  'Television',
  'Badarawa',
  'Kabala',
  'Kakuri',
  'Kurmin Mashi',
  'Makera',
  'Mando',
  'Gonin Gora',
  'Kudenda',
  'Romi',
  'Hayin Banki',
  'Ungwan Dosa',
  'Birnin Gwari',
  'Chikun',
  'Giwa',
  'Igabi',
  'Ikara',
  'Jaba',
  "Jema'a",
  'Kachia',
  'Kaduna North',
  'Kaduna South',
  'Kagarko',
  'Kajuru',
  'Kaura',
  'Kauru',
  'Kubau',
  'Kudan',
  'Lere',
  'Makarfi',
  'Sabon Gari',
  'Sanga',
  'Soba',
  'Zangon Kataf',
  'Zaria',
  'Other Kaduna area'
];

  if (agent.role !== 'agent') {
    res.status(403).json({ error: 'Agent accounts only.' });
    return;
  }

  await ensureSchema();
  const areas = req.body?.areas;
  if (!Array.isArray(areas) ||
      areas.length > 100 ||
      areas.some((area: unknown) => typeof area !== 'string')) {
    res.status(400).json({ error: 'Select valid Kaduna service areas.' });
    return;
  }

  const uniqueAreas = [...new Set(areas as string[])];
  const validAreas = await query(
    'SELECT area FROM area_catalog WHERE area = ANY($1::text[])',
    [uniqueAreas]
  );

  if (validAreas.rows.length !== uniqueAreas.length) {
    res.status(400).json({ error: 'Refresh the area list and select valid Kaduna service areas.' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM agent_areas WHERE agent_id = $1', [agent.id]);

    if (uniqueAreas.length) {
      await client.query(
        `INSERT INTO agent_areas (agent_id, area)
         SELECT $1, unnest($2::text[])`,
        [agent.id, uniqueAreas]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Service areas saved.', areas: uniqueAreas });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Save agent areas error:', error);
    res.status(500).json({ error: 'Could not save service areas.' });
  } finally {
    client.release();
  }
});

router.get('/admin/pool', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const admin = req.nestoraUser!;

    if (admin.role !== 'admin') {
      res.status(403).json({ error: 'Administrator access required.' });
      return;
    }

    const result = await query(
      `SELECT r.id, r.property_type, r.area, r.budget, r.requirements,
              r.status, r.created_at, r.published_at, r.expires_at,
              r.claimed_by, r.claimed_at, r.progress_status,
              agent.full_name AS assigned_agent_name,
              p.status AS payment_status,
              COALESCE(a.agent_count, 0)::int AS eligible_agent_count,
              CASE
                WHEN COALESCE(a.agent_count, 0) = 0 THEN TRUE
                ELSE FALSE
              END AS no_eligible_agents,
              CASE
                WHEN r.expires_at <= NOW() THEN TRUE
                ELSE FALSE
              END AS expired
       FROM property_requests r
       LEFT JOIN users agent ON agent.id = r.claimed_by
       LEFT JOIN LATERAL (
         SELECT COUNT(DISTINCT aa.agent_id) AS agent_count
         FROM agent_areas aa
         JOIN users u ON u.id = aa.agent_id
         WHERE aa.area = r.area
           AND u.role = 'agent'
           AND u.agent_status = 'approved'
       ) a ON TRUE
       LEFT JOIN LATERAL (
         SELECT status
         FROM payments
         WHERE request_id = r.id
         ORDER BY created_at DESC
         LIMIT 1
       ) p ON TRUE
       WHERE r.status = 'published'
       ORDER BY
         (COALESCE(a.agent_count, 0) = 0) DESC,
         r.published_at DESC
       LIMIT 200`
    );

    res.json({ requests: result.rows });
  } catch (error) {
    console.error('Admin request pool error:', error);
    res.status(500).json({ error: 'Could not load the admin request pool.' });
  }
});

router.patch('/admin/:id/release', async (req: AuthenticatedRequest, res: Response) => {
  const admin = req.nestoraUser!;
  const requestId = req.params.id;

  if (admin.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required.' });
  }

  if (
    typeof requestId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)
  ) {
    return res.status(400).json({ error: 'Invalid request ID.' });
  }

  try {
    const result = await query(
      `WITH released AS (
         UPDATE property_requests
         SET claimed_by = NULL,
             claimed_at = NULL,
             progress_status = 'claimed'
         WHERE id = $1
           AND status = 'published'
           AND expires_at > NOW()
           AND claimed_by IS NOT NULL
           AND COALESCE(progress_status, 'claimed') <> 'completed'
         RETURNING id, claimed_by
       ),
       recorded AS (
         INSERT INTO released_request_agents (request_id, agent_id)
         SELECT id, claimed_by FROM released
         ON CONFLICT (request_id, agent_id) DO NOTHING
         RETURNING request_id
       )
       SELECT id FROM released`,
      [requestId]
    );

    if (result.rowCount !== 1) {
      return res.status(409).json({
        error: 'Request cannot be released. It may be unassigned, expired, or completed.'
      });
    }

    res.json({
      success: true,
      request_id: result.rows[0].id,
      message: 'Request released and made available to eligible agents.'
    });
  } catch (error) {
    console.error('Admin release request error:', error);
    res.status(500).json({ error: 'Could not release this request.' });
  }
});

router.get('/notifications', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const agentId = req.nestoraUser?.id;
    if (!agentId || req.nestoraUser?.role !== 'agent') {
      return res.status(403).json({ error: 'Agent access required.' });
    }

    const [history, unread] = await Promise.all([
      query(
        `SELECT id, request_id, title, message, read_at, created_at
         FROM agent_notifications
         WHERE agent_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [agentId]
      ),
      query(
        `SELECT COUNT(*)::int AS count
         FROM agent_notifications
         WHERE agent_id = $1 AND read_at IS NULL`,
        [agentId]
      )
    ]);

    return res.json({
      notifications: history.rows,
      unreadCount: Number(unread.rows[0]?.count || 0)
    });
  } catch (error) {
    console.error('Could not load notifications:', error);
    return res.status(500).json({ error: 'Could not load notifications.' });
  }
});

router.patch('/notifications/read-all', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const agentId = req.nestoraUser?.id;
    if (!agentId || req.nestoraUser?.role !== 'agent') {
      return res.status(403).json({ error: 'Agent access required.' });
    }

    const result = await query(
      `UPDATE agent_notifications
       SET read_at = NOW()
       WHERE agent_id = $1 AND read_at IS NULL`,
      [agentId]
    );

    return res.json({ updated: result.rowCount || 0 });
  } catch (error) {
    console.error('Could not mark notifications as read:', error);
    return res.status(500).json({ error: 'Could not update notifications.' });
  }
});

router.patch('/notifications/:id/read', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const agentId = req.nestoraUser?.id;
    if (!agentId || req.nestoraUser?.role !== 'agent') {
      return res.status(403).json({ error: 'Agent access required.' });
    }

    const id = String(req.params.id || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({ error: 'Invalid notification ID.' });
    }

    const result = await query(
      `UPDATE agent_notifications
       SET read_at = COALESCE(read_at, NOW())
       WHERE id = $1 AND agent_id = $2
       RETURNING id, request_id, title, message, read_at, created_at`,
      [id, agentId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    return res.json({ notification: result.rows[0] });
  } catch (error) {
    console.error('Could not mark notification as read:', error);
    return res.status(500).json({ error: 'Could not update notification.' });
  }
});

router.get('/feed', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const agent = req.nestoraUser!;

    if (agent.role !== 'agent') {
      res.status(403).json({ error: 'This feed is only available to agent accounts.' });
      return;
    }

    if (agent.agent_status !== 'approved') {
      res.status(403).json({
        error: 'Your agent account must be approved before you can access requests.',
        code: 'AGENT_NOT_VERIFIED'
      });
      return;
    }

    const result = await query(
      `SELECT r.id, r.property_type, r.area, r.budget, r.requirements,
              r.published_at, r.expires_at
       FROM property_requests r
       JOIN agent_areas aa
         ON aa.agent_id = $1 AND aa.area = r.area
       WHERE r.status = 'published'
         AND r.expires_at > NOW()
         AND r.claimed_by IS NULL
         AND r.seeker_id <> $1
         AND NOT EXISTS (
           SELECT 1
           FROM released_request_agents rra
           WHERE rra.request_id = r.id
             AND rra.agent_id = $1
         )
       ORDER BY r.published_at DESC
       LIMIT 100`,
      [agent.id]
    );

    res.json({ requests: result.rows });
  } catch (error) {
    console.error('Agent feed error:', error);
    res.status(500).json({ error: 'Could not load the agent feed.' });
  }
});

router.get('/mine', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.nestoraUser!;
    const result = await query(
      `SELECT r.id, r.property_type, r.area, r.budget, r.requirements,
              r.status, r.progress_status, r.created_at, r.published_at, r.expires_at,
              r.claimed_at,
              agent.full_name AS assigned_agent_name,
              agent.phone AS assigned_agent_phone,
              agent.email AS assigned_agent_email,
              p.status AS payment_status, p.reference
       FROM property_requests r
       LEFT JOIN LATERAL (
         SELECT status, reference
         FROM payments
         WHERE request_id = r.id
         ORDER BY created_at DESC, id DESC
         LIMIT 1
       ) p ON TRUE
       LEFT JOIN users agent ON agent.id = r.claimed_by
       WHERE r.seeker_id = $1
       ORDER BY r.created_at DESC`,
      [user.id]
    );
    res.json({ requests: result.rows });
  } catch (error) {
    console.error('List requests error:', error);
    res.status(500).json({ error: 'Could not load your requests.' });
  }
});

router.post('/initialize', async (req: AuthenticatedRequest, res: Response) => {
  let requestId: string | undefined;

  try {
    const user = req.nestoraUser!;

    if (user.role !== 'seeker') {
      res.status(403).json({ error: 'Only property seekers can create requests.' });
      return;
    }

    const paystackKey = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackKey) {
      res.status(503).json({
        error: 'Payments are not configured yet. No payment has been taken.',
        code: 'PAYSTACK_NOT_CONFIGURED'
      });
      return;
    }

    const { property_type, area, budget, requirements = '' } = req.body ?? {};
    const allowedTypes = [
      'Apartment', 'Self-contained', 'Duplex', 'House', 'Shop', 'Office', 'Land'
    ];
    const allowedAreas = [
  'Barnawa',
  'GRA',
  'Kawo',
  'Malali',
  'Ungwan Rimi',
  'Ungwan Sarki',
  'Narayi',
  'Nasarawa',
  'Rigasa',
  'Sabon Tasha',
  'Tudun Wada',
  'Television',
  'Badarawa',
  'Kabala',
  'Kakuri',
  'Kurmin Mashi',
  'Makera',
  'Mando',
  'Gonin Gora',
  'Kudenda',
  'Romi',
  'Hayin Banki',
  'Ungwan Dosa',
  'Birnin Gwari',
  'Chikun',
  'Giwa',
  'Igabi',
  'Ikara',
  'Jaba',
  "Jema'a",
  'Kachia',
  'Kaduna North',
  'Kaduna South',
  'Kagarko',
  'Kajuru',
  'Kaura',
  'Kauru',
  'Kubau',
  'Kudan',
  'Lere',
  'Makarfi',
  'Sabon Gari',
  'Sanga',
  'Soba',
  'Zangon Kataf',
  'Zaria',
  'Other Kaduna area'
];
    await ensureSchema();
    const requestedArea = typeof area === 'string' ? area.trim().replace(/\s+/g, ' ') : '';
    const canonicalArea = requestedArea && requestedArea.toLowerCase() !== 'other kaduna area'
      ? await query(
          'SELECT area FROM area_catalog WHERE normalized_area = $1',
          [requestedArea.toLowerCase()]
        )
      : { rows: [] as Array<{ area: string }> };

    const numericBudget = Number(budget);

    if (!allowedTypes.includes(property_type) ||
        !canonicalArea.rows.length ||
        !Number.isFinite(numericBudget) ||
        numericBudget <= 0 ||
        String(requirements).length > 1000) {
      res.status(400).json({ error: 'Check the property type, Kaduna area, budget and requirements.' });
      return;
    }

    requestId = randomUUID();
    const reference = `NESTORA-${randomUUID().replace(/-/g, '')}`;

    await query(
      `INSERT INTO property_requests
        (id, seeker_id, property_type, area, budget, requirements, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending_payment')`,
      [requestId, user.id, property_type, canonicalArea.rows[0].area, numericBudget, String(requirements)]
    );

    await query(
      `INSERT INTO payments (request_id, user_id, reference, amount_kobo, currency, status)
       VALUES ($1, $2, $3, $4, 'NGN', 'pending')`,
      [requestId, user.id, reference, FEE_KOBO]
    );

    const frontendUrl = (process.env.FRONTEND_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
    const callbackUrl = `${frontendUrl}/payment/callback`;

    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: user.email,
        amount: FEE_KOBO,
        currency: 'NGN',
        reference,
        callback_url: callbackUrl,
        metadata: {
          request_id: requestId,
          user_id: user.id,
          purpose: 'nestora_property_request'
        }
      })
    });

    const data = await paystackResponse.json() as {
      status?: boolean;
      message?: string;
      data?: { authorization_url?: string; access_code?: string; reference?: string };
    };

    if (!paystackResponse.ok || !data.status || !data.data?.authorization_url) {
      console.error('Paystack initialization failed:', data.message || paystackResponse.status);
      await query(
        `UPDATE payments SET status = 'initialization_failed' WHERE reference = $1`,
        [reference]
      );
      res.status(502).json({
        error: 'Could not initialize payment. Please try again.',
        code: 'PAYMENT_INITIALIZATION_FAILED'
      });
      return;
    }

    res.json({
      authorization_url: data.data.authorization_url,
      access_code: data.data.access_code,
      reference: data.data.reference || reference,
      request_id: requestId
    });
  } catch (error) {
    console.error('Payment initialization error:', error);
    res.status(500).json({
      error: 'Could not initialize payment. Please try again.'
    });
  }
});

async function notifyMatchingAgents(request: {
  id: string;
  area: string;
  property_type: string;
  budget: number | string;
}) {
  try {
    const title = 'New property request in your area';
    const message = request.property_type + ' request in ' + request.area +
      '. Budget: ₦' + Number(request.budget).toLocaleString('en-NG') + '.';

    await query(
      `INSERT INTO agent_notifications (agent_id, request_id, title, message)
       SELECT DISTINCT u.id, $2, $3, $4
       FROM users u
       JOIN agent_areas aa ON aa.agent_id = u.id
       WHERE aa.area = $1
         AND u.role = 'agent'
         AND u.agent_status = 'approved'
       ON CONFLICT (agent_id, request_id) DO NOTHING`,
      [request.area, request.id, title, message]
    );

    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) {
      console.error('Push delivery skipped: VAPID keys are not configured. Database notifications were saved.');
      return;
    }

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@nestora.app',
      publicKey,
      privateKey
    );

    const result = await query(
      `SELECT ps.endpoint, ps.subscription
       FROM push_subscriptions ps
       JOIN users u ON u.id = ps.agent_id
       JOIN agent_areas aa ON aa.agent_id = u.id
       WHERE aa.area = $1
         AND u.role = 'agent'
         AND u.agent_status = 'approved'`,
      [request.area]
    );

    const payload = JSON.stringify({
      title,
      body: message,
      url: '/agent'
    });

    await Promise.allSettled(result.rows.map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription, payload, { TTL: 60 });
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [row.endpoint]);
        } else {
          console.error('Push delivery failed:', error?.statusCode || error?.message || error);
        }
      }
    }));
  } catch (error) {
    console.error('Notification processing failed:', error);
  }
}


router.post('/:id/retry-payment', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.nestoraUser!;
    if (user.role !== 'seeker') {
      res.status(403).json({ error: 'Only seekers can retry request payments.' });
      return;
    }

    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) {
      res.status(503).json({ error: 'Payments are not configured yet.' });
      return;
    }

    const requestResult = await query(
      `SELECT id, status, area, property_type, budget
       FROM property_requests
       WHERE id = $1 AND seeker_id = $2`,
      [req.params.id, user.id]
    );

    if (!requestResult.rows.length) {
      res.status(404).json({ error: 'Request not found. Refresh your requests.' });
      return;
    }

    const request = requestResult.rows[0];
    const requestId = String(request.id);

    if (request.status === 'published') {
      res.status(409).json({ error: 'This request is already published. No new payment is needed.' });
      return;
    }

    if (request.status !== 'pending_payment') {
      res.status(409).json({ error: 'This request is no longer awaiting payment.' });
      return;
    }

    const previousPayments = await query(
      `SELECT reference, status, amount_kobo, currency
       FROM payments
       WHERE request_id = $1 AND user_id = $2
       ORDER BY created_at DESC`,
      [requestId, user.id]
    );

    for (const payment of previousPayments.rows) {
      if (payment.status === 'success') {
        res.status(409).json({
          error: 'A previous payment is marked successful. Refresh your requests or contact support before paying again.'
        });
        return;
      }

      if (payment.status !== 'pending') continue;

      let verificationResponse: globalThis.Response;
      let verification: {
        status?: boolean;
        data?: {
          status?: string;
          reference?: string;
          amount?: number;
          currency?: string;
          metadata?: { request_id?: string; user_id?: string };
          paid_at?: string;
        };
      };

      try {
        verificationResponse = await fetch(
          `https://api.paystack.co/transaction/verify/${encodeURIComponent(String(payment.reference))}`,
          { headers: { Authorization: `Bearer ${key}` } }
        );
        verification = await verificationResponse.json();
      } catch {
        res.status(503).json({
          error: 'Could not check your previous payment safely. No new checkout was created. Please try again shortly.'
        });
        return;
      }

      if (!verificationResponse.ok || verification.status !== true || !verification.data) {
        res.status(503).json({
          error: 'Your previous payment could not be checked safely. No new checkout was created. Please try again shortly.'
        });
        return;
      }

      const transaction = verification.data;
      const paid = transaction.status === 'success' &&
        transaction.reference === payment.reference &&
        transaction.amount === Number(payment.amount_kobo) &&
        transaction.amount === FEE_KOBO &&
        (payment.currency || 'NGN') === 'NGN' &&
        transaction.currency === 'NGN' &&
        transaction.metadata?.request_id === requestId &&
        transaction.metadata?.user_id === user.id;

      if (paid) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          const paymentUpdate = await client.query(
            `UPDATE payments
             SET status = 'success',
                 paid_at = COALESCE($1::timestamptz, NOW()),
                 raw_response = $2::jsonb
             WHERE reference = $3 AND user_id = $4`,
            [transaction.paid_at || null, JSON.stringify(transaction), payment.reference, user.id]
          );

          if (paymentUpdate.rowCount !== 1) {
            throw new Error('Could not reconcile the previous payment.');
          }

          const requestUpdate = await client.query(
            `UPDATE property_requests
             SET status = 'published',
                 published_at = COALESCE(published_at, NOW()),
                 expires_at = COALESCE(expires_at, NOW() + INTERVAL '24 hours')
             WHERE id = $1 AND seeker_id = $2 AND status = 'pending_payment'`,
            [requestId, user.id]
          );

          if (requestUpdate.rowCount !== 1) {
            throw new Error('Could not publish the request after payment.');
          }

          await client.query('COMMIT');
        } catch (error) {
          try { await client.query('ROLLBACK'); } catch {}
          throw error;
        } finally {
          client.release();
        }

        await notifyMatchingAgents({
          id: requestId,
          area: String(request.area),
          property_type: String(request.property_type),
          budget: request.budget
        });

        res.status(409).json({
          error: 'Your previous payment was successful and your request has now been published. Refresh your requests; do not pay again.'
        });
        return;
      }

      if (transaction.status !== 'abandoned' && transaction.status !== 'failed') {
        res.status(409).json({
          error: 'Your previous Paystack transaction is not confirmed as failed or abandoned. No new checkout was created to prevent a duplicate charge.'
        });
        return;
      }

      await query(
        `UPDATE payments SET status = 'failed', raw_response = $1::jsonb
         WHERE reference = $2 AND user_id = $3 AND status = 'pending'`,
        [JSON.stringify(transaction), payment.reference, user.id]
      );
    }

    const reference = `NESTORA-${randomUUID().replace(/-/g, '')}`;
    const creationClient = await pool.connect();

    try {
      await creationClient.query('BEGIN');

      const lockedRequest = await creationClient.query(
        `SELECT status FROM property_requests
         WHERE id = $1 AND seeker_id = $2
         FOR UPDATE`,
        [requestId, user.id]
      );

      if (!lockedRequest.rows.length ||
          lockedRequest.rows[0].status !== 'pending_payment') {
        await creationClient.query('ROLLBACK');
        res.status(409).json({
          error: 'This request is no longer awaiting payment. Refresh your requests.'
        });
        return;
      }

      const existingPending = await creationClient.query(
        `SELECT reference FROM payments
         WHERE request_id = $1 AND user_id = $2 AND status = 'pending'
         LIMIT 1`,
        [requestId, user.id]
      );

      if (existingPending.rowCount) {
        await creationClient.query('ROLLBACK');
        res.status(409).json({
          error: 'A payment attempt is already pending. Refresh your requests and check its status before trying again.'
        });
        return;
      }

      await creationClient.query(
        `INSERT INTO payments (request_id, user_id, reference, amount_kobo, currency, status)
         VALUES ($1, $2, $3, $4, 'NGN', 'pending')`,
        [requestId, user.id, reference, FEE_KOBO]
      );

      await creationClient.query('COMMIT');
    } catch (error) {
      try { await creationClient.query('ROLLBACK'); } catch {}
      throw error;
    } finally {
      creationClient.release();
    }

    const frontendUrl = (process.env.FRONTEND_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        amount: FEE_KOBO,
        currency: 'NGN',
        reference,
        callback_url: `${frontendUrl}/payment/callback`,
        metadata: {
          request_id: requestId,
          user_id: user.id,
          purpose: 'nestora_property_request'
        }
      })
    });

    const result = await response.json() as {
      status?: boolean;
      message?: string;
      data?: { authorization_url?: string; access_code?: string; reference?: string };
    };

    if (!response.ok || !result.status || !result.data?.authorization_url) {
      await query(
        `UPDATE payments SET status = 'initialization_failed' WHERE reference = $1`,
        [reference]
      );
      res.status(502).json({ error: 'Could not initialize payment. Please try again.' });
      return;
    }

    res.json({
      authorization_url: result.data.authorization_url,
      reference: result.data.reference || reference,
      request_id: requestId
    });
  } catch (error) {
    console.error('Retry payment error:', error);
    res.status(500).json({ error: 'Could not retry payment. Please try again.' });
  }
});

router.delete('/account', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.nestoraUser!;

    if (user.role !== 'seeker') {
      res.status(403).json({ error: 'Only seeker accounts can use this endpoint.' });
      return;
    }

    const result = await query(
      `UPDATE users
       SET full_name = 'Deleted seeker',
           email = 'deleted+' || id::text || '@deleted.invalid',
           phone = NULL,
           password_hash = encode(gen_random_bytes(32), 'hex'),
           deleted_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND role = 'seeker' AND deleted_at IS NULL
       RETURNING id`,
      [user.id]
    );

    if (!result.rowCount) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }

    res.json({ message: 'Your account has been deleted.' });
  } catch (error) {
    console.error('Delete seeker account error:', error);
    res.status(500).json({
      error: 'Unable to delete your account right now. Please contact support.'
    });
  }
});

router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.nestoraUser!;
    if (user.role !== 'seeker') {
      res.status(403).json({ error: 'Only seekers can cancel their requests.' });
      return;
    }

    const result = await query(
      `DELETE FROM property_requests
       WHERE id = $1 AND seeker_id = $2 AND status = 'pending_payment'
       RETURNING id`,
      [req.params.id, user.id]
    );
    if (!result.rows.length) {
      res.status(404).json({ error: 'Only your unpaid requests can be cancelled.' });
      return;
    }
    res.json({ cancelled: true });
  } catch (error) {
    console.error('Cancel request error:', error);
    res.status(500).json({ error: 'Could not cancel request. Please try again.' });
  }
});

router.post('/verify', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.nestoraUser!;
    const reference = String(req.body?.reference || '').trim();

    if (!/^NESTORA-[a-f0-9]{32}$/i.test(reference)) {
      res.status(400).json({ error: 'Invalid payment reference.' });
      return;
    }

    const local = await query(
      `SELECT p.id, p.request_id, p.amount_kobo, p.status,
              r.seeker_id, r.area, r.property_type, r.budget,
              r.status AS request_status
       FROM payments p
       JOIN property_requests r ON r.id = p.request_id
       WHERE p.reference = $1 AND p.user_id = $2
       LIMIT 1`,
      [reference, user.id]
    );

    if (!local.rows.length) {
      res.status(404).json({ error: 'Payment reference not found for your account.' });
      return;
    }

    if (local.rows[0].status === 'success') {
      const requestId = String(local.rows[0].request_id);

      if (local.rows[0].request_status !== 'published') {
        const client = await pool.connect();

        try {
          await client.query('BEGIN');
          const recovered = await client.query(
            `UPDATE property_requests
             SET status = 'published',
                 published_at = COALESCE(published_at, NOW()),
                 expires_at = COALESCE(expires_at, NOW() + INTERVAL '24 hours')
             WHERE id = $1 AND seeker_id = $2 AND status = 'pending_payment'`,
            [requestId, user.id]
          );

          if (recovered.rowCount !== 1) {
            const current = await client.query(
              `SELECT status FROM property_requests
               WHERE id = $1 AND seeker_id = $2 FOR UPDATE`,
              [requestId, user.id]
            );
            if (current.rows[0]?.status !== 'published') {
              throw new Error('Paid request could not be recovered safely.');
            }
          }
          await client.query('COMMIT');
        } catch (error) {
          try { await client.query('ROLLBACK'); }
          catch (rollbackError) {
            console.error('Recovery rollback error:', rollbackError);
          }
          throw error;
        } finally {
          client.release();
        }

        await notifyMatchingAgents({
          id: requestId,
          area: String(local.rows[0].area),
          property_type: String(local.rows[0].property_type),
          budget: local.rows[0].budget
        });
      }

      res.json({
        verified: true,
        status: 'published',
        request_id: requestId,
        expires_in_hours: 24
      });
      return;
    }

    const paystackKey = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackKey) {
      res.status(503).json({ error: 'Payment verification is not configured.' });
      return;
    }

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${paystackKey}` } }
    );

    const result = await response.json() as {
      status?: boolean;
      message?: string;
      data?: {
        status?: string;
        reference?: string;
        amount?: number;
        currency?: string;
        metadata?: { request_id?: string; user_id?: string };
        paid_at?: string;
      };
    };

    const paid = response.ok &&
      result.status === true &&
      result.data?.status === 'success' &&
      result.data.reference === reference &&
      result.data.amount === FEE_KOBO &&
      result.data.currency === 'NGN' &&
      result.data.metadata?.request_id === String(local.rows[0].request_id) &&
      result.data.metadata?.user_id === user.id;

    if (!paid) {
      res.status(402).json({
        verified: false,
        error: 'Payment is not confirmed. Your request has not been published.'
      });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const paymentUpdate = await client.query(
        `UPDATE payments
         SET status = 'success',
             paid_at = COALESCE(paid_at, $1::timestamptz, NOW()),
             raw_response = COALESCE(raw_response, $2::jsonb)
         WHERE reference = $3 AND user_id = $4
         RETURNING request_id`,
        [result.data?.paid_at || null, JSON.stringify(result.data), reference, user.id]
      );

      if (paymentUpdate.rowCount !== 1) {
        throw new Error('Payment record could not be reconciled.');
      }

      const requestUpdate = await client.query(
        `UPDATE property_requests
         SET status = 'published',
             published_at = COALESCE(published_at, NOW()),
             expires_at = COALESCE(expires_at, NOW() + INTERVAL '24 hours')
         WHERE id = $1 AND seeker_id = $2 AND status = 'pending_payment'`,
        [local.rows[0].request_id, user.id]
      );

      if (requestUpdate.rowCount !== 1) {
        const current = await client.query(
          `SELECT status FROM property_requests
           WHERE id = $1 AND seeker_id = $2 FOR UPDATE`,
          [local.rows[0].request_id, user.id]
        );

        if (current.rows[0]?.status !== 'published') {
          throw new Error('Property request could not be published safely.');
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Payment verification rollback error:', rollbackError);
      }
      throw error;
    } finally {
      client.release();
    }

    await notifyMatchingAgents({
      id: String(local.rows[0].request_id),
      area: String(local.rows[0].area),
      property_type: String(local.rows[0].property_type),
      budget: local.rows[0].budget
    });

    res.json({
      verified: true,
      status: 'published',
      request_id: local.rows[0].request_id,
      expires_in_hours: 24
    });
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ error: 'Could not verify payment. Please try again.' });
  }
});


router.get('/my-claims', async (req: AuthenticatedRequest, res: Response) => {
  const user = req.nestoraUser!;

  if (user.role !== 'agent') {
    return res.status(403).json({ error: 'Only agents can view claimed requests.' });
  }

  try {
    const result = await query(
      `SELECT r.id, r.property_type, r.area, r.budget, r.requirements,
              r.status, r.progress_status, r.claimed_at, r.expires_at,
              seeker.full_name AS seeker_name,
              seeker.phone AS seeker_phone,
              seeker.email AS seeker_email
       FROM property_requests r
       JOIN users seeker ON seeker.id = r.seeker_id
       WHERE r.claimed_by = $1
       ORDER BY r.claimed_at DESC NULLS LAST`,
      [user.id]
    );

    res.json({ requests: result.rows });
  } catch (error) {
    console.error('Load agent claims error:', error);
    res.status(500).json({ error: 'Could not load your claimed requests.' });
  }
});

router.patch('/:id/progress', async (req: AuthenticatedRequest, res: Response) => {
  const user = req.nestoraUser!;
  const requestId = req.params.id;
  const progressStatus = req.body?.progress_status;

  if (user.role !== 'agent') {
    return res.status(403).json({ error: 'Only agents can update request progress.' });
  }

  if (typeof requestId !== 'string') {
    return res.status(400).json({ error: 'Invalid request ID.' });
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    return res.status(400).json({ error: 'Invalid request ID.' });
  }

  if (!['in_progress', 'completed'].includes(progressStatus)) {
    return res.status(400).json({ error: 'Choose In progress or Completed.' });
  }

  try {
    const result = await query(
      `UPDATE property_requests
       SET progress_status = $1
       WHERE id = $2 AND claimed_by = $3
       RETURNING id, progress_status`,
      [progressStatus, requestId, user.id]
    );

    if (result.rowCount !== 1) {
      return res.status(404).json({ error: 'This request is not assigned to your account.' });
    }

    res.json({
      success: true,
      request: result.rows[0],
      message: 'Request progress updated.'
    });
  } catch (error) {
    console.error('Update request progress error:', error);
    res.status(500).json({ error: 'Could not update request progress.' });
  }
});

router.post('/:id/claim', async (req: AuthenticatedRequest, res: Response) => {
  const user = req.nestoraUser;
  const requestId = req.params.id;

  if (!user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  if (typeof requestId !== 'string') {
    return res.status(400).json({ error: 'Invalid request ID.' });
  }

  if (user.role !== 'agent') {
    return res.status(403).json({ error: 'Only agents can respond to requests.' });
  }

  if (user.agent_status !== 'approved') {
    return res.status(403).json({
      error: 'Your agent account must be approved first.'
    });
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    return res.status(400).json({ error: 'Invalid request ID.' });
  }

  try {
    const result = await query(
      `UPDATE property_requests AS pr
       SET claimed_by = $1, claimed_at = NOW()
       WHERE pr.id = $2
         AND pr.status = 'published'
         AND pr.expires_at > NOW()
         AND pr.claimed_by IS NULL
         AND NOT EXISTS (
           SELECT 1
           FROM released_request_agents rra
           WHERE rra.request_id = pr.id
             AND rra.agent_id = $1
         )
         AND EXISTS (
           SELECT 1 FROM agent_areas aa
           WHERE aa.agent_id = $1 AND aa.area = pr.area
         )
       RETURNING pr.id`,
      [user.id, requestId]
    );

    if (result.rowCount !== 1) {
      return res.status(409).json({
        error: 'This request is no longer available or does not match your service areas.'
      });
    }

    res.json({
      success: true,
      request_id: result.rows[0].id,
      message: 'Request claimed. You can now view the seeker’s contact details under My Requests.'
    });
  } catch (error) {
    console.error('Claim request error:', error);
    res.status(500).json({ error: 'Could not respond to this request. Please try again.' });
  }
});


router.get('/admin/agents', async (req: AuthenticatedRequest, res: Response) => {
  if (req.nestoraUser?.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required.' });
  }

  try {
    const result = await query(
      `SELECT u.id, u.full_name, u.email, u.phone,
              u.email_verified, u.agent_status, u.created_at,
              COALESCE(
                array_agg(DISTINCT aa.area)
                  FILTER (WHERE aa.area IS NOT NULL),
                ARRAY[]::text[]
              ) AS service_areas
       FROM users u
       LEFT JOIN agent_areas aa ON aa.agent_id = u.id
       WHERE u.role = 'agent'
       GROUP BY u.id
       ORDER BY
         CASE u.agent_status
           WHEN 'pending' THEN 0
           ELSE 1
         END,
         u.created_at DESC
       LIMIT 500`
    );

    res.json({ agents: result.rows });
  } catch (error) {
    console.error('Admin agent list error:', error);
    res.status(500).json({ error: 'Could not load registered agents.' });
  }
});

router.patch('/admin/agents/:id/status', async (req: AuthenticatedRequest, res: Response) => {
  if (req.nestoraUser?.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required.' });
  }

  const agentId = req.params.id;
  const status = req.body?.status;

  if (
    typeof agentId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentId)
  ) {
    return res.status(400).json({ error: 'Invalid agent ID.' });
  }

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be approved or rejected.' });
  }

  try {
    const result = await query(
      `UPDATE users
       SET agent_status = $1
       WHERE id = $2 AND role = 'agent'
       RETURNING id, full_name, email, agent_status`,
      [status, agentId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Agent account not found.' });
    }

    res.json({
      message: status === 'approved' ? 'Agent approved.' : 'Agent rejected.',
      agent: result.rows[0]
    });
  } catch (error) {
    console.error('Admin agent status update error:', error);
    res.status(500).json({ error: 'Could not update agent status.' });
  }
});


router.get('/admin/payments', async (req: AuthenticatedRequest, res: Response) => {
  if (req.nestoraUser?.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required.' });
  }

  try {
    const [summary, transactions] = await Promise.all([
      query(
        `SELECT
           COALESCE(SUM(amount_kobo) FILTER (WHERE status = 'success'), 0)::bigint AS revenue_kobo,
           COUNT(*) FILTER (WHERE status = 'success')::int AS successful_count,
           COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
           COUNT(*) FILTER (
             WHERE status NOT IN ('success', 'pending')
           )::int AS unsuccessful_count,
           COALESCE(SUM(amount_kobo) FILTER (WHERE status = 'pending'), 0)::bigint AS pending_kobo
         FROM payments`
      ),
      query(
        `SELECT p.id, p.request_id, p.user_id, u.full_name AS seeker_name,
                u.email AS seeker_email, p.reference, p.amount_kobo,
                p.currency, p.status, p.created_at, p.paid_at,
                r.property_type, r.area
         FROM payments p
         JOIN users u ON u.id = p.user_id
         JOIN property_requests r ON r.id = p.request_id
         ORDER BY p.created_at DESC
         LIMIT 100`
      )
    ]);

    res.json({
      summary: summary.rows[0],
      transactions: transactions.rows
    });
  } catch (error) {
    console.error('Admin payment records error:', error);
    res.status(500).json({ error: 'Could not load payment records.' });
  }
});

export default router;
