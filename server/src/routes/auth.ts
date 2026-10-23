import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../db';

const router = Router();

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(25).optional(),
  password: z.string().min(8).max(72),
  role: z.enum(['seeker', 'agent'])
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(72)
});

function createToken(user: {
  id: string;
  role: string;
  agent_status: string;
  email_verified: boolean;
}) {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters.');
  }

  return jwt.sign(
    {
      role: user.role,
      agentStatus: user.agent_status,
      emailVerified: user.email_verified
    },
    secret,
    { subject: user.id, expiresIn: '1d' }
  );
}

router.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Please check your registration details.',
      details: parsed.error.flatten().fieldErrors
    });
  }

  try {
    const { fullName, email, phone, password, role } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const existing = await query(
      'SELECT id FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (existing.rowCount) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const agentStatus = role === 'agent' ? 'pending' : 'not_applicable';

    const result = await query(
      `INSERT INTO users
        (full_name, email, phone, password_hash, role, agent_status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, full_name, email, phone, role, email_verified, agent_status, created_at`,
      [fullName, normalizedEmail, phone || null, passwordHash, role, agentStatus]
    );

    const user = result.rows[0] as { id: string; full_name: string; email: string; phone: string | null; password_hash: string; role: string; email_verified: boolean; agent_status: string } | undefined;

    return res.status(201).json({
      message: role === 'agent'
        ? 'Account created. Your agent profile is awaiting administrator approval.'
        : 'Account created successfully.',
      user
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Unable to create your account right now.' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: 'Enter a valid email and password.' });
  }

  try {
    const { email, password } = parsed.data;

    const result = await query(
      `SELECT id, full_name, email, phone, password_hash, role,
              email_verified, agent_status
       FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [email.toLowerCase()]
    );

    const user = result.rows[0] as { id: string; full_name: string; email: string; phone: string | null; password_hash: string; role: string; email_verified: boolean; agent_status: string } | undefined;

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = createToken(user);

    return res.json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        emailVerified: user.email_verified,
        agentStatus: user.agent_status
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Unable to log in right now.' });
  }
});

export default router;
