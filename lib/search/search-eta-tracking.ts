import { metricsCollector } from "@/app/api/metrics/collector"

export type SearchEtaType = "bestpreissuche" | "urlaubsfinder" | "unknown"

interface SearchEtaSample {
  timestamp: number
  estimatedSeconds: number
}

interface SearchEtaSession {
  searchType: SearchEtaType
  samples: SearchEtaSample[]
}

const etaSessions = new Map<string, SearchEtaSession>()
const MAX_SAMPLES_PER_SESSION = 300

export function recordSearchEtaEstimate(
  sessionId: string,
  estimatedSeconds: number,
  searchType: SearchEtaType
): void {
  if (!sessionId || !Number.isFinite(estimatedSeconds) || estimatedSeconds <= 0) return

  const session = etaSessions.get(sessionId) || { searchType, samples: [] }
  session.searchType = searchType
  session.samples.push({ timestamp: Date.now(), estimatedSeconds })
  if (session.samples.length > MAX_SAMPLES_PER_SESSION) session.samples.shift()
  etaSessions.set(sessionId, session)
}

export function completeSearchEtaTracking(sessionId: string): void {
  const session = etaSessions.get(sessionId)
  if (!session) return

  const completedAt = Date.now()
  for (const sample of session.samples) {
    const actualRemainingMs = Math.max(0, completedAt - sample.timestamp)
    const estimatedRemainingMs = sample.estimatedSeconds * 1000
    metricsCollector.recordSearchEtaAccuracy(
      session.searchType,
      estimatedRemainingMs,
      actualRemainingMs
    )
  }

  etaSessions.delete(sessionId)
}

export function discardSearchEtaTracking(sessionId: string): void {
  etaSessions.delete(sessionId)
}
