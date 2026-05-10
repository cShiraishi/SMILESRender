import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export default class UsageEvent extends BaseModel {
  static table = 'usage_events'

  @column({ isPrimary: true })
  declare id: number

  @column.dateTime()
  declare ts: DateTime

  @column()
  declare method: string

  @column()
  declare path: string

  @column()
  declare status_code: number

  @column()
  declare duration_ms: number

  @column()
  declare ip: string | null
}
