import mysql from "mysql2/promise";

/**
 * MariaDB / MySQL connection pool. Every connection is pinned to UTC so
 * `DEFAULT CURRENT_TIMESTAMP` and `now()` agree with the UTC datetimes the
 * app reads and writes (`timezone: "Z"` covers Dates passed as parameters).
 * Keep the pool small — shared hosting caps connections per DB user.
 */
export function createPool(uri: string) {
  const pool = mysql.createPool({
    uri,
    connectionLimit: Number(process.env.DATABASE_POOL_SIZE ?? 5),
    maxIdle: 2,
    idleTimeout: 60_000,
    enableKeepAlive: true,
    timezone: "Z",
    decimalNumbers: true,
  });
  pool.on("connection", (conn) => {
    conn.query("SET time_zone = '+00:00'");
  });
  return pool;
}

export type Pool = mysql.Pool;
