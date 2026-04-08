import pg from "pg";

let _pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL must be set");
    _pool = new pg.Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 3,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      allowExitOnIdle: false,
    });
    _pool.on("error", (err) => {
      console.warn("[db] pool error, resetting:", err.message);
      try { _pool?.end().catch(() => {}); } catch {}
      _pool = null;
    });
    // Keepalive: pinga o banco a cada 60s pra detectar conexoes mortas
    const keepalive = setInterval(() => {
      if (!_pool) { clearInterval(keepalive); return; }
      _pool.query("SELECT 1").catch(() => {
        console.warn("[db] keepalive failed, resetting pool");
        try { _pool?.end().catch(() => {}); } catch {}
        _pool = null;
        clearInterval(keepalive);
      });
    }, 60_000);
  }
  return _pool;
}

export const pool = new Proxy({} as pg.Pool, {
  get(_target, prop) {
    return (getPool() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
