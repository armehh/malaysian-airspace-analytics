export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL,
    collectorSecret: env.COLLECTOR_SECRET,
    corsOrigin: env.CORS_ORIGIN ?? '*',
    cacheTtlMs: Number(env.CACHE_TTL_MS ?? 60_000),
  };
}
