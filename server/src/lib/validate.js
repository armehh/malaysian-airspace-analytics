import { z } from 'zod';
import { AIRPORT_CODES } from './airports.js';

const DAY = 24 * 3600 * 1000;
export const MAX_RANGE_DAYS = 90;

const dateLike = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Tarikh tidak sah (guna ISO, cth 2026-11-01)');

export const rangeSchema = z
  .object({
    from: dateLike.optional(),
    to: dateLike.optional(),
    airport: z.string().transform((s) => s.toUpperCase()).pipe(z.enum(AIRPORT_CODES)).optional(),
    bucket: z.enum(['hour', 'day']).default('day'),
    top: z.coerce.number().int().min(1).max(20).default(8),
  })
  .transform((q, ctx) => {
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 7 * DAY);
    if (from >= to) {
      ctx.addIssue({ code: 'custom', message: '"from" mesti lebih awal daripada "to"' });
      return z.NEVER;
    }
    if (to - from > MAX_RANGE_DAYS * DAY) {
      ctx.addIssue({ code: 'custom', message: `Julat maksimum ${MAX_RANGE_DAYS} hari` });
      return z.NEVER;
    }
    return { from, to, airport: q.airport, bucket: q.bucket, top: q.top };
  });

export const airportParam = z.object({
  code: z.string().transform((s) => s.toUpperCase()).pipe(z.enum(AIRPORT_CODES)),
});

export function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const err = new Error('Parameter tidak sah');
    err.status = 400;
    err.issues = r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw err;
  }
  return r.data;
}
