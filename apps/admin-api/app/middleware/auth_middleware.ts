import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import jwt from 'jsonwebtoken'

export default class AuthMiddleware {
  async handle({ request, response }: HttpContext, next: NextFn) {
    const authHeader = request.header('authorization')

    if (!authHeader?.startsWith('Bearer ')) {
      return response.status(401).json({ error: 'Authentication required' })
    }

    const token = authHeader.slice(7)

    try {
      jwt.verify(token, process.env.APP_KEY!)
      await next()
    } catch {
      return response.status(401).json({ error: 'Invalid or expired token' })
    }
  }
}
