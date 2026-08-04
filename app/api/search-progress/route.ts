import { NextRequest, NextResponse } from "next/server"
import { globalRateLimiter } from "@/app/api/search-prices/rate-limiter"
import { estimateSearchEtaSeconds } from "@/lib/search/search-eta"
import {
  recordSearchEtaEstimate,
  type SearchEtaType,
} from "@/lib/search/search-eta-tracking"
import { logDebug, logError } from "@/lib/shared/logger"

const LOG_SCOPE = "search-progress"

interface SearchProgressData {
  currentDay: number
  totalDays: number
  currentDate: string
  isComplete: boolean
  uncachedDays?: number
  cachedDays?: number
  averageUncachedResponseTime?: number
  averageCachedResponseTime?: number
  queueSize?: number
  activeRequests?: number
  timestamp: number
  isActiveSearch?: boolean // Markiert aktive Suchen
}

// In-Memory Storage für Progress-Daten
const progressStorage = new Map<string, SearchProgressData>()

interface RemainingWork {
  total: number
  uncached: number
  cached: number
}

function parseRequestedRemainingRequests(url: URL): number | undefined {
  const rawRequestedValue = url.searchParams.get('remainingRequests')
  if (rawRequestedValue === null) return undefined

  const requestedValue = Number(rawRequestedValue)
  if (Number.isFinite(requestedValue) && requestedValue >= 0) {
    return Math.min(Math.ceil(requestedValue), 500)
  }

  return undefined
}

function parseSearchType(url: URL): SearchEtaType {
  const searchType = url.searchParams.get('searchType')
  if (searchType === 'bestpreissuche' || searchType === 'urlaubsfinder') return searchType
  return 'unknown'
}

function getRemainingWork(
  url: URL,
  progressData: SearchProgressData | undefined,
  queueStatus: ReturnType<typeof globalRateLimiter.getQueueStatus>
): RemainingWork {
  const requestedRemaining = parseRequestedRemainingRequests(url)
  const liveSessionRequests = queueStatus.sessionQueueSize + queueStatus.sessionActiveRequests
  const progressRemaining = progressData
    ? Math.max(0, progressData.totalDays - progressData.currentDay)
    : 0
  const progressUncached = Math.max(0, progressData?.uncachedDays || 0)
  const progressCached = Math.max(0, progressData?.cachedDays || 0)
  const total = Math.max(
    progressData ? progressRemaining : (requestedRemaining ?? 0),
    liveSessionRequests
  )
  const knownUncached = Math.min(total, Math.max(progressUncached, liveSessionRequests))
  const knownCached = Math.min(Math.max(0, total - knownUncached), progressCached)
  const unclassified = Math.max(0, total - knownUncached - knownCached)

  return {
    total,
    uncached: knownUncached + unclassified,
    cached: knownCached,
  }
}

function calculateEstimatedTimeRemaining(
  remainingWork: RemainingWork,
  progressData: SearchProgressData | undefined,
  queueStatus: ReturnType<typeof globalRateLimiter.getQueueStatus>
): number {
  if (progressData?.isComplete && remainingWork.total === 0) return 0

  return estimateSearchEtaSeconds({
    uncachedRequests: remainingWork.uncached,
    cachedRequests: remainingWork.cached,
    averageCachedResponseTimeMs: progressData?.averageCachedResponseTime || 100,
    queue: queueStatus,
  })
}

// GET - Progress-Daten abrufen
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const sessionId = url.searchParams.get('sessionId')
    
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 })
    }

    const progressData = progressStorage.get(sessionId)
    const requestedRemaining = parseRequestedRemainingRequests(url)
    if (!progressData?.isComplete) {
      globalRateLimiter.heartbeatSearchSession(
        sessionId,
        progressData
          ? Math.max(0, progressData.totalDays - progressData.currentDay)
          : requestedRemaining,
        progressData
          ? Math.max(0, progressData.uncachedDays || 0)
          : requestedRemaining
      )
    }
    const queueStatus = globalRateLimiter.getQueueStatus(sessionId)
    const remainingWork = getRemainingWork(url, progressData, queueStatus)
    const estimatedTimeRemaining = calculateEstimatedTimeRemaining(
      remainingWork,
      progressData,
      queueStatus
    )

    const isCancelled = globalRateLimiter.isSessionCancelledSync(sessionId)
    if (!isCancelled && !progressData?.isComplete && remainingWork.total > 0) {
      recordSearchEtaEstimate(sessionId, estimatedTimeRemaining, parseSearchType(url))
    }

    return NextResponse.json({
      currentDay: progressData?.currentDay || 0,
      totalDays: progressData?.totalDays || 0,
      currentDate: progressData?.currentDate || "",
      isComplete: progressData?.isComplete || false,
      estimatedTimeRemaining,
      queueSize: queueStatus.queueSize,
      activeRequests: queueStatus.activeRequests,
      totalUsers: queueStatus.totalUsers,
      otherActiveSearches: queueStatus.otherActiveSearches,
      otherRemainingRequests: queueStatus.otherRemainingRequests,
      isCancelled,
      isContended: remainingWork.total > 0 && queueStatus.otherActiveSearches > 0,
      isRateLimited: queueStatus.isRateLimited,
      effectiveInterval: queueStatus.effectiveInterval,
      remainingRequests: remainingWork.total,
    })

  } catch (error) {
    logError(LOG_SCOPE, "Could not read search progress", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST - Progress-Daten speichern
export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const { sessionId } = data
    
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 })
    }

    if (data.isActiveSearch === false) {
      globalRateLimiter.cancelSession(sessionId, 'client_inactive')
      return NextResponse.json({ success: true })
    }

    // Speichere Progress-Daten
    progressStorage.set(sessionId, {
      ...data,
      timestamp: Date.now()
    })

    // Wenn die Suche abgeschlossen ist, markiere Session als beendet für den Rate Limiter
    if (data.isComplete) {
      // Session als abgeschlossen markieren, damit sie nicht mehr als aktiv gilt
      // Verwende die cancel-Funktion mit speziellem Grund für abgeschlossene Suchen
      globalRateLimiter.cancelSession(sessionId, 'search_completed')
      logDebug(LOG_SCOPE, "✅ Search session marked as completed", { sessionId })
    } else {
      globalRateLimiter.registerSearchSession(
        sessionId,
        Math.max(0, Number(data.totalDays || 0) - Number(data.currentDay || 0)),
        Math.max(0, Number(data.uncachedDays || 0))
      )
    }

    // Nur wichtige Meilensteine loggen
    if (data.totalDays > 0 && (data.currentDay === 1 || data.currentDay === data.totalDays || data.currentDay % 10 === 0)) {
      logDebug(LOG_SCOPE, "📊 Search progress milestone updated", {
        sessionId,
        currentDay: data.currentDay,
        totalDays: data.totalDays,
        progressPercent: Math.round((data.currentDay / data.totalDays) * 100),
        currentDate: data.currentDate,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logError(LOG_SCOPE, "Could not update search progress", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Cleanup alte Progress-Daten (älter als 1 Stunde)
setInterval(() => {
  const now = Date.now()
  const oneHour = 60 * 60 * 1000
  
  for (const [sessionId, data] of progressStorage.entries()) {
    if (now - data.timestamp > oneHour) {
      progressStorage.delete(sessionId)
      logDebug(LOG_SCOPE, "🧹 Old search progress data cleaned up", { sessionId })
    }
  }
}, 5 * 60 * 1000) // Cleanup alle 5 Minuten
