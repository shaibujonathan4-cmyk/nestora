import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { pool, query } from '../src/db';

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function askPassword(): Promise<string> {
  if (!stdin.isTTY || !stdin.setRawMode) {
    throw new Error('Run this script directly in an interactive terminal.');
  }

  stdout.write('Admin password (minimum 12 characters): ');
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  return new Promise((resolve, reject) => {
    let password = '';

    const cleanup = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    };

    const onData = (key: string) => {
      if (key === '\u0003') {
        cleanup();
        reject(new Error('Cancelled.'));
      } else if (key === '\r' || key === '\n') {
        cleanup();
        resolve(password);
      } else if (key === '\u007f' || key === '\b') {
        password = password.slice(0, -1);
      } else if (key >= ' ') {
        password += key;
      }
    };

    stdin.on('data', onData);
  });
}

async function main() {
  try {
    const fullName = await ask('Admin full name: ');
    const email = (await ask('Admin email: ')).toLowerCase();
    const password = await askPassword();

    if (!fullName || !email.includes('@') || password.length < 12) {
      throw new Error('Enter a name, valid email, and password of at least 12 characters.');
    }

    const existing = await query(
      'SELECT id FROM users WHERE email = $1 LIMIT 1',
      [email]
    );

    if (existing.rows.length) {
      throw new Error('That email already belongs to an account. Use a different email; no account was changed.');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await query(
      `INSERT INTO users
        (full_name, email, password_hash, role, email_verified, agent_status)
       VALUES ($1, $2, $3, 'admin', TRUE, 'not_applicable')`,
      [fullName, email, passwordHash]
    );

    console.log(`Admin account created for ${email}. You can now sign in.`);
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Admin account creation failed.');
  process.exitCode = 1;
});
