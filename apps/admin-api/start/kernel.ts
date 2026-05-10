import router from '@adonisjs/core/services/router'
import server from '@adonisjs/core/services/server'

export const middleware = router.named({
  auth: () => import('#middleware/auth_middleware'),
})

server.use([() => import('@adonisjs/core/bodyparser_middleware')])
