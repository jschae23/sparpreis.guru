import { NextRequest, NextResponse } from "next/server"
import { globalRateLimiter } from "@/app/api/search-prices/rate-limiter"
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
    requestedRemaining ?? progressRemaining,
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

  const workItems = Math.max(1, remainingWork.uncached)
  const effectiveIntervalSeconds = Math.max(0.25, queueStatus.effectiveInterval / 1000)
  const averageApiSeconds = Math.min(
    Math.max((progressData?.averageUncachedResponseTime || 2000) / 1000, 0.5),
    10
  )
  const sessionsSharingCapacity = Math.max(
    1,
    queueStatus.totalUsers + (queueStatus.hasOwnRequest ? 0 : 1)
  )
  const alreadyRunningForSession = Math.min(
    workItems,
    Math.max(0, queueStatus.sessionActiveRequests)
  )
  const remainingStarts = Math.max(0, workItems - Math.max(1, alreadyRunningForSession))
  const fastStartsForSession = Math.min(
    remainingStarts,
    Math.floor(queueStatus.burstCapacity / sessionsSharingCapacity)
  )
  const pacedStartsForSession = Math.max(0, remainingStarts - fastStartsForSession)
  const sustainedIntervalSeconds = Math.max(
    effectiveIntervalSeconds,
    queueStatus.sustainedInterval / 1000
  )
  const scheduledSeconds =
    fastStartsForSession * effectiveIntervalSeconds * sessionsSharingCapacity +
    pacedStartsForSession * sustainedIntervalSeconds * sessionsSharingCapacity
  const cachedSeconds = remainingWork.cached * Math.max(
    (progressData?.averageCachedResponseTime || 100) / 1000,
    0.05
  )

  return Math.max(
    2,
    Math.ceil(queueStatus.estimatedWaitTime + scheduledSeconds + averageApiSeconds + cachedSeconds)
  )
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
    if (!progressData?.isComplete) {
      globalRateLimiter.registerSearchSession(
        sessionId,
        progressData
          ? Math.max(0, progressData.totalDays - progressData.currentDay)
          : parseRequestedRemainingRequests(url)
      )
    }
    const queueStatus = globalRateLimiter.getQueueStatus(sessionId)
    const remainingWork = getRemainingWork(url, progressData, queueStatus)
    const estimatedTimeRemaining = calculateEstimatedTimeRemaining(
      remainingWork,
      progressData,
      queueStatus
    )

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
      globalRateLimiter.unregisterSearchSession(sessionId)
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
        Math.max(0, Number(data.totalDays || 0) - Number(data.currentDay || 0))
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
