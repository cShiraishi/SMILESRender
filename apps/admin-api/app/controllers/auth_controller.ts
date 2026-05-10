import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

export default class AuthController {
  async login({ request, response }: HttpContext) {
    const { email, password } = request.only(['email', 'password'])

    if (!email || !password) {
      return response.status(400).json({ error: 'Email and password are required' })
    }

    const user = await db.from('users').where('email', email).first()

    // Same error message for missing user and wrong password — prevents user enumeration.
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return response.status(401).json({ error: 'Invalid credentials' })
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      process.env.APP_KEY!,
      { expiresIn: '8h' },
    )

    return response.json({ token, email: user.email, role: user.role })
  }
}
