import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/admin',
  server: {
    proxy: {
      '/admin/api': {
        target: 'http://localhost:5000',
        rewrite: (path) => path.replace('/admin/api', '/api'),
      },
    },
  },
})
