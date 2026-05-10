import { defineConfig } from '@adonisjs/lucid/database'

const dbConfig = defineConfig({
  connection: 'postgres',
  connections: {
    postgres: {
      client: 'pg',
      connection: {
        connectionString: process.env.DATABASE_URL,
      },
      migrations: {
        // Prisma owns migrations — Lucid is read-only here.
        naturalSort: true,
        paths: [],
      },
    },
  },
})

export default dbConfig
