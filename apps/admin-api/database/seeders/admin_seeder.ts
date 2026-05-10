import { BaseSeeder } from '@adonisjs/lucid/seeders'
import db from '@adonisjs/lucid/services/db'
import bcrypt from 'bcryptjs'

export default class AdminSeeder extends BaseSeeder {
  async run() {
    const email = process.env.ADMIN_EMAIL ?? 'admin@smilesrender.com'
    const password = process.env.ADMIN_PASSWORD

    if (!password) {
      console.error('[seed] ADMIN_PASSWORD env var is required — skipping')
      return
    }

    // Idempotent — skip if admin already exists.
    const existing = await db.from('users').where('email', email).first()
    if (existing) {
      console.log(`[seed] Admin already exists: ${email}`)
      return
    }

    const hash = await bcrypt.hash(password, 12)

    await db.table('users').insert({
      email,
      password_hash: hash,
      role: 'admin',
      created_at: new Date(),
      updated_at: new Date(),
    })

    console.log(`[seed] Admin user created: ${email}`)
  }
}
