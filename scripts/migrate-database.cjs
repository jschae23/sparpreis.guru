#!/usr/bin/env node

const { join } = require('node:path')
const {
  DATABASE_FILE_NAME,
  migrateDatabase,
} = require('../lib/database/database-migrations.cjs')

const databasePath = process.env.DATABASE_PATH || join(process.cwd(), 'data', DATABASE_FILE_NAME)

migrateDatabase({ databasePath }).catch(error => {
  console.error(
    `[${new Date().toISOString()}] [ERROR] [database.migration] Database migration failed | error=${error instanceof Error ? error.message : String(error)}`
  )
  process.exitCode = 1
})
