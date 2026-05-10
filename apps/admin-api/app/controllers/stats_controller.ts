import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

export default class StatsController {
  async index({ response }: HttpContext) {
    try {
      const [totalRow] = await db.from('usage_events').count('* as total')
      const [errorsRow] = await db
        .from('usage_events')
        .where('status_code', '>=', 400)
        .count('* as total')
      const [avgRow] = await db.from('usage_events').avg('duration_ms as avg')

      const total = Number(totalRow?.total ?? 0)
      const errors = Number(errorsRow?.total ?? 0)
      const avgMs = Math.round(Number(avgRow?.avg ?? 0))

      const topEndpoints = await db
        .from('usage_events')
        .select('path')
        .count('* as count')
        .groupBy('path')
        .orderByRaw('count(*) desc')
        .limit(10)

      return response.json({
        total,
        errors,
        errorRate: total > 0 ? Math.round((errors / total) * 100) : 0,
        avgMs,
        topEndpoints: topEndpoints.map((ep: any) => ({
          path: ep.path,
          count: Number(ep.count),
        })),
      })
    } catch (err) {
      return response.status(503).json({ error: 'Database unavailable' })
    }
  }

  async system({ response }: HttpContext) {
    const chemistryUrl = process.env.CHEMISTRY_URL ?? 'http://chemistry:3000'

    let chemistry: 'ok' | 'down' = 'down'
    try {
      const r = await fetch(`${chemistryUrl}/ping`, {
        signal: AbortSignal.timeout(3000),
      })
      if (r.ok) chemistry = 'ok'
    } catch {}

    let database: 'ok' | 'down' = 'down'
    try {
      await db.rawQuery('SELECT 1')
      database = 'ok'
    } catch {}

    return response.json({ chemistry, database, ts: new Date().toISOString() })
  }
}
