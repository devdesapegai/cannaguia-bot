import pg from "pg";

let _pool: pg.Pool | null = null;
let _keepaliveFailures = 0;

function getPool(): pg.Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL must be set");
    _pool = new pg.Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 3,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 60000,
      allowExitOnIdle: false,
    });
    _pool.on("error", (err) => {
      console.warn("[db] pool error:", err.message);
      // So reseta se nao conseguir recuperar
      resetPool();
    });
    _keepaliveFailures = 0;
    // Keepalive: pinga o banco a cada 2min — tolera 3 falhas consecutivas antes de resetar
    const keepalive = setInterval(() => {
      if (!_pool) { clearInterval(keepalive); return; }
      _pool.query("SELECT 1").then(() => {
        _keepaliveFailures = 0; // reset no sucesso
      }).catch(() => {
        _keepaliveFailures++;
        if (_keepaliveFailures >= 3) {
          console.warn(`[db] keepalive failed ${_keepaliveFailures}x, resetting pool`);
          resetPool();
          clearInterval(keepalive);
        }
      });
    }, 120_000);
  }
  return _pool;
}

function resetPool() {
  const old = _pool;
  _pool = null;
  _keepaliveFailures = 0;
  if (old) old.end().catch(() => {});
}

export const pool = new Proxy({} as pg.Pool, {
  get(_target, prop) {
    return (getPool() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
