// Cache ringkas dalam memori (TTL). Cukup untuk satu instans Render percuma.
export function cacheMiddleware(ttlMs) {
  const store = new Map();
  return (req, res, next) => {
    if (req.method !== 'GET' || ttlMs <= 0) return next();
    const key = req.originalUrl;
    const hit = store.get(key);
    if (hit && hit.expires > Date.now()) {
      res.set('X-Cache', 'HIT');
      return res.json(hit.body);
    }
    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) {
        if (store.size > 500) store.delete(store.keys().next().value);
        store.set(key, { body, expires: Date.now() + ttlMs });
      }
      res.set('X-Cache', 'MISS');
      return json(body);
    };
    next();
  };
}
