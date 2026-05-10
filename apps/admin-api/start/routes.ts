import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const HealthController = () => import('#controllers/health_controller')
const AuthController = () => import('#controllers/auth_controller')
const StatsController = () => import('#controllers/stats_controller')

// Public routes
router.get('/health', [HealthController, 'index'])
router.post('/api/login', [AuthController, 'login'])

// Protected routes — require valid JWT
router
  .group(() => {
    router.get('/api/stats', [StatsController, 'index'])
    router.get('/api/system', [StatsController, 'system'])
  })
  .use(middleware.auth())
