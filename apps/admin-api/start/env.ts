import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number.optional(),
  HOST: Env.schema.string.optional(),
  APP_KEY: Env.schema.string(),
  DATABASE_URL: Env.schema.string(),
  ADMIN_EMAIL: Env.schema.string.optional(),
  ADMIN_PASSWORD: Env.schema.string.optional(),
  REDIS_URL: Env.schema.string.optional(),
  CHEMISTRY_URL: Env.schema.string.optional(),
})
