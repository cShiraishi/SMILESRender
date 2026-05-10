import { defineConfig } from '@adonisjs/core/app'

export default defineConfig({
  appKey: process.env.APP_KEY!,
  http: {
    trustProxy: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    },
  },
})
