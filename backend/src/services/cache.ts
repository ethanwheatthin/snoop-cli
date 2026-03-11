import { Pool } from "pg";
import type { AnalyzeResponse } from "../types.js";

const memoryCache = new Map<string, AnalyzeResponse>();

let pool: Pool | null = null;

function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }

  return pool;
}

async function ensureTable(): Promise<void> {
  const db = getPool();
  if (!db) {
    return;
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS package_cache (
      cache_key TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function getCachedAnalysis(cacheKey: string): Promise<AnalyzeResponse | null> {
  const db = getPool();

  if (!db) {
    return memoryCache.get(cacheKey) ?? null;
  }

  await ensureTable();
  const result = await db.query<{ payload: AnalyzeResponse }>(
    "SELECT payload FROM package_cache WHERE cache_key = $1",
    [cacheKey],
  );

  return result.rows[0]?.payload ?? null;
}

export async function setCachedAnalysis(cacheKey: string, payload: AnalyzeResponse): Promise<void> {
  const db = getPool();

  if (!db) {
    memoryCache.set(cacheKey, payload);
    return;
  }

  await ensureTable();
  await db.query(
    `
      INSERT INTO package_cache (cache_key, payload, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (cache_key)
      DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
    `,
    [cacheKey, JSON.stringify(payload)],
  );
}
