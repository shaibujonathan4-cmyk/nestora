import { Router, Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { query } from '../db';

const router = Router();
let schemaReady: Promise<void> | null = null;

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(120) NOT NULL,
        email VARCHAR(255) NOT NULL,
        category VARCHAR(50) NOT NULL,
        subject VARCHAR(180) NOT NULL,
        message TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).then(() => undefined).catch(error => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}


type AuthenticatedRequest = Request & {
  nestoraUser?: { id: string; role: string };
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
      res.status(401).json({ error: 'Invalid login session.' });
      return;
    }

    const result = await query(
      `SELECT id, role FROM users
       WHERE ($1 <> '' AND id::text = $1) OR ($2 <> '' AND email = $2)
       LIMIT 1`,
      [identity, email]
    );

    if (!result.rows.length) {
      res.status(401).json({ error: 'Account not found.' });
      return;
    }

    req.nestoraUser = {
      id: String(result.rows[0].id),
      role: String(result.rows[0].role),
    };

    next();
  } catch {
    res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
}

router.get('/admin', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  if (req.nestoraUser?.role !== 'admin') {
    res.status(403).json({ error: 'Administrator access required.' });
    return;
  }

  try {
    await ensureSchema();
    const result = await query(
      `SELECT id, name, email, category, subject, message, status, created_at
       FROM support_tickets
       ORDER BY CASE WHEN status = 'open' THEN 0 ELSE 1 END, created_at DESC`
    );
    res.json({ tickets: result.rows });
  } catch (error) {
    console.error('Could not load support tickets:', error);
    res.status(500).json({ error: 'Could not load support tickets.' });
  }
});

router.patch('/admin/:id/status', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  if (req.nestoraUser?.role !== 'admin') {
    res.status(403).json({ error: 'Administrator access required.' });
    return;
  }

  const { status } = req.body;
  if (!['open', 'resolved'].includes(status)) {
    res.status(400).json({ error: 'Status must be open or resolved.' });
    return;
  }

  try {
    await ensureSchema();
    const result = await query(
      `UPDATE support_tickets SET status = $1
       WHERE id = $2
       RETURNING id, status`,
      [status, req.params.id]
    );

    if (!result.rows.length) {
      res.status(404).json({ error: 'Support ticket not found.' });
      return;
    }

    res.json({ ticket: result.rows[0] });
  } catch (error) {
    console.error('Could not update support ticket:', error);
    res.status(500).json({ error: 'Could not update support ticket.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const category = typeof req.body.category === 'string' ? req.body.category.trim() : '';
    const subject = typeof req.body.subject === 'string' ? req.body.subject.trim() : '';
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';

    if (!name || !email || !category || !subject || !message) {
      res.status(400).json({ message: 'Please complete every field.' });
      return;
    }

    if (name.length > 120 || email.length > 255 || category.length > 50 ||
        subject.length > 180 || message.length > 5000) {
      res.status(400).json({ message: 'One or more fields exceed the allowed length.' });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ message: 'Enter a valid email address.' });
      return;
    }

    const allowedCategories = ['Account', 'Property request', 'Agent', 'Payment', 'Technical issue', 'Other'];
    if (!allowedCategories.includes(category)) {
      res.status(400).json({ message: 'Select a valid support category.' });
      return;
    }

    await ensureSchema();
    await query(
      `INSERT INTO support_tickets (name, email, category, subject, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [name, email, category, subject, message]
    );

    res.status(201).json({ message: 'Your support request has been submitted.' });
  } catch (error) {
    console.error('Support ticket submission failed:', error);
    res.status(500).json({ message: 'Could not submit your request right now. Please try again.' });
  }
});

export default router;
