"use client"

import { useEffect, useRef, useState } from "react"

export interface SearchQueueStatusData {
  estimatedTimeRemaining: number
  otherActiveSearches: number
  otherRemainingRequests: number
  isContended: boolean
  isRateLimited: boolean
}

interface UseSearchQueueStatusOptions {
  sessionId?: string | null
  isActive: boolean
  remainingRequests: number
}

export function useSearchQueueStatus({
  sessionId,
  isActive,
  remainingRequests,
}: UseSearchQueueStatusOptions): SearchQueueStatusData {
  const normalizedRemainingRequests = Math.max(0, remainingRequests)
  const remainingRequestsRef = useRef(normalizedRemainingRequests)
  remainingRequestsRef.current = normalizedRemainingRequests
  const fallbackStatus: SearchQueueStatusData = {
    estimatedTimeRemaining: Math.max(2, Math.ceil(Math.max(1, normalizedRemainingRequests) * 1.5)),
    otherActiveSearches: 0,
    otherRemainingRequests: 0,
    isContended: false,
    isRateLimited: false,
  }
  const [status, setStatus] = useState<SearchQueueStatusData>(fallbackStatus)

  useEffect(() => {
    if (!isActive) return

    if (!sessionId) {
      setStatus(fallbackStatus)
      return
    }

    let cancelled = false
    let pollTimer: ReturnType<typeof setTimeout> | undefined

    const poll = async () => {
      try {
        const params = new URLSearchParams({
          sessionId,
          remainingRequests: String(remainingRequestsRef.current),
        })
        const response = await fetch(`/api/search-progress?${params.toString()}`, {
          cache: "no-store",
        })

        if (response.ok && !cancelled) {
          const data = await response.json()
          setStatus({
            estimatedTimeRemaining: Math.max(1, Number(data.estimatedTimeRemaining) || 1),
            otherActiveSearches: Math.max(0, Number(data.otherActiveSearches) || 0),
            otherRemainingRequests: Math.max(0, Number(data.otherRemainingRequests) || 0),
            isContended: Boolean(data.isContended),
            isRateLimited: Boolean(data.isRateLimited),
          })
        }
      } catch {
        // Keep the last useful estimate if a progress poll fails.
      }

      if (!cancelled) {
        pollTimer = setTimeout(poll, 1000)
      }
    }

    setStatus({
      estimatedTimeRemaining: Math.max(
        2,
        Math.ceil(Math.max(1, remainingRequestsRef.current) * 1.5)
      ),
      otherActiveSearches: 0,
      otherRemainingRequests: 0,
      isContended: false,
      isRateLimited: false,
    })
    void poll()

    return () => {
      cancelled = true
      if (pollTimer) clearTimeout(pollTimer)
      void fetch('/api/search-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, isActiveSearch: false }),
        keepalive: true,
      }).catch(() => {
        // The heartbeat timeout removes the session if cleanup cannot be delivered.
      })
    }
  }, [isActive, sessionId])

  return sessionId ? status : fallbackStatus
}
