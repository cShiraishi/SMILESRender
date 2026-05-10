import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export default class User extends BaseModel {
  static table = 'users'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare email: string

  @column({ serializeAs: null })
  declare password_hash: string

  @column()
  declare role: string

  @column.dateTime()
  declare created_at: DateTime

  @column.dateTime()
  declare updated_at: DateTime
}
