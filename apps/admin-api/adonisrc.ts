import { defineConfig } from '@adonisjs/core/app'

export default defineConfig({
  typescript: true,

  commands: [
    () => import('@adonisjs/core/commands'),
    () => import('@adonisjs/lucid/commands'),
  ],

  providers: [
    () => import('@adonisjs/core/providers/app_provider'),
    () => import('@adonisjs/core/providers/http_provider'),
    () => import('@adonisjs/core/providers/logger_provider'),
    () => import('@adonisjs/lucid/database_provider'),
  ],

  preloads: [
    () => import('#start/routes'),
    () => import('#start/kernel'),
  ],
})
