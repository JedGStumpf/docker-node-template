import { Router } from 'express';
import { createIntrospector } from '../../services/db-introspector';
import { isSqlite } from '../../services/prisma';

export const adminDbRouter = Router();

/** Redact password from a connection URL. */
function redactUrl(raw: string): string {
  if (raw.startsWith('file:')) return raw;
  try {
    const u = new URL(raw);
    if (u.password) u.password = '****';
    return u.toString();
  } catch {
    return raw.replace(/:([^@/:]+)@/, ':****@');
  }
}

adminDbRouter.get('/db/info', (_req, res) => {
  const dbUrl = process.env.DATABASE_URL || '';
  res.json({
    provider: isSqlite() ? 'sqlite' : 'postgresql',
    connectionString: redactUrl(dbUrl),
  });
});

adminDbRouter.get('/db/tables', async (req, res, next) => {
  try {
    const introspector = createIntrospector(req.services.prisma);
    const tables = await introspector.listTables();
    res.json(tables);
  } catch (err) {
    next(err);
  }
});

adminDbRouter.get('/db/tables/:name', async (req, res, next) => {
  try {
    const { name } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));

    const introspector = createIntrospector(req.services.prisma);
    const detail = await introspector.getTableDetail(name, page, limit);

    if (!detail) {
      return res.status(404).json({ error: `Table '${name}' not found` });
    }

    res.json(detail);
  } catch (err) {
    next(err);
  }
});
