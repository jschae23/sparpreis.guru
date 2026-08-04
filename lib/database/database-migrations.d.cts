import type Database from 'better-sqlite3'

export const DATABASE_FILE_NAME: string
export const LATEST_DATABASE_VERSION: number
export function connectionKey(connectionId: string): Buffer
export function initializeEmptyDatabase(db: Database.Database): void
export function migrateDatabase(options?: {
  databasePath?: string
  targetVersion?: number
  log?: (level: string, message: string, context?: Record<string, unknown>) => void
}): Promise<{ databasePath: string; version: number }>
