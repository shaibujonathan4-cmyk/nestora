import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase } from './db';
import authRouter from './routes/auth';
import requestsRouter from './routes/requests';
import supportRouter from './routes/support';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]
}));
app.use(express.json({ limit: '20kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Nestora API' });
});

app.use('/api/auth', authRouter);
app.use('/api/requests', requestsRouter);
app.use('/api/support', supportRouter);

async function start() {
  try {
    await initializeDatabase();
    app.listen(port, '0.0.0.0', () => {
      console.log(`Nestora API listening on 0.0.0.0:${port}`);
    });
  } catch (error) {
    console.error('Could not connect to PostgreSQL. Check DATABASE_URL and network access.', error);
    process.exit(1);
  }
}

start();
