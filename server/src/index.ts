import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env from project root when running locally (not in Docker).
// In Docker, env vars are set by compose/entrypoint.
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}
import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { healthRouter } from './routes/health';
import { counterRouter } from './routes/counter';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

app.use(cors());
app.use(express.json());
app.use(pinoHttp({ level: process.env.LOG_LEVEL || 'info' }));

app.use('/api', healthRouter);
app.use('/api', counterRouter);

app.use(errorHandler);

app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on http://localhost:${port}`);
});

export default app;
