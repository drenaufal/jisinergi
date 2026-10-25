import { drizzle } from "drizzle-orm/mysql2";
import { createPool, type Pool } from "./pool";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Add it to .env.local");
}

// Only the pool is reused across dev hot reloads. The drizzle instance is
// rebuilt per module evaluation so it always carries the current schema —
// caching it kept stale relations after schema edits ("not enough
// information to infer relation …").
const globalForDb = globalThis as unknown as {
  mysqlPool?: Pool;
};

const pool = globalForDb.mysqlPool ?? createPool(connectionString);
if (process.env.NODE_ENV !== "production") globalForDb.mysqlPool = pool;

// "planetscale" mode builds relational queries without LATERAL joins, which
// MariaDB (Hostinger) does not support. Even so, `db.query.*` with `with:`
// still nests correlated derived tables that MariaDB rejects — load related
// rows with joins instead.
export const db = drizzle(pool, { schema, mode: "planetscale" });

export * as schema from "./schema";
