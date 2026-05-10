import type { HttpContext } from '@adonisjs/core/http'

export default class HealthController {
  async index({ response }: HttpContext) {
    return response.json({
      status: 'ok',
      service: 'smilerender-admin-api',
      ts: new Date().toISOString(),
    })
  }
}
