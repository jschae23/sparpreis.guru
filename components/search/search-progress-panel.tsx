"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { ArrowUp, CheckCircle2, CircleX, Loader2 } from "lucide-react"
import type { SearchQueueStatusData } from "@/hooks/use-search-queue-status"
import { cn } from "@/lib/utils"
import { SearchCancelButton } from "./search-cancel-button"
import { SearchQueueStatus } from "./search-queue-status"

function formatElapsedTime(seconds: number | null): string {
  if (seconds === null) return "nicht erfasst"
  if (seconds < 1) return "< 1 Sek."
  if (seconds < 60) return `${seconds} Sek.`

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes} Min. ${remainingSeconds} Sek.` : `${minutes} Min.`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0 ? `${hours} Std. ${remainingMinutes} Min.` : `${hours} Std.`
}

interface SearchProgressPanelProps {
  isActive: boolean
  completedItems: number
  totalItems: number
  queueStatus: SearchQueueStatusData
  progressUnit: string
  completedUnit: string
  isCancelled?: boolean
  onCancel?: () => void
  detail?: ReactNode
}

export function SearchProgressPanel({
  isActive,
  completedItems,
  totalItems,
  queueStatus,
  progressUnit,
  completedUnit,
  isCancelled = false,
  onCancel,
  detail,
}: SearchProgressPanelProps) {
  const panelId = useId()
  const panelRef = useRef<HTMLElement>(null)
  const wasActiveRef = useRef(isActive)
  const wasTimingRef = useRef(isActive)
  const hasAutoScrolledRef = useRef(false)
  const searchStartedAtRef = useRef<number | null>(isActive ? Date.now() : null)
  const [showTerminalShortcut, setShowTerminalShortcut] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(isActive ? 0 : null)
  const safeCompletedItems = Math.max(0, completedItems)
  const safeTotalItems = Math.max(0, totalItems)
  const remainingItems = Math.max(0, safeTotalItems - safeCompletedItems)
  const progress = safeTotalItems > 0
    ? Math.min(100, Math.round((safeCompletedItems / safeTotalItems) * 100))
    : 0
  const state = isActive ? "active" : isCancelled ? "cancelled" : "completed"

  useEffect(() => {
    if (!isActive) {
      hasAutoScrolledRef.current = false
      return
    }
    if (hasAutoScrolledRef.current) return

    hasAutoScrolledRef.current = true
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [isActive])

  useEffect(() => {
    if (!isActive) {
      if (wasTimingRef.current && searchStartedAtRef.current !== null) {
        setElapsedSeconds(Math.max(0, Math.round((Date.now() - searchStartedAtRef.current) / 1000)))
      }
      wasTimingRef.current = false
      return
    }

    if (!wasTimingRef.current || searchStartedAtRef.current === null) {
      searchStartedAtRef.current = Date.now()
      setElapsedSeconds(0)
    }
    wasTimingRef.current = true

    const updateElapsedTime = () => {
      if (searchStartedAtRef.current === null) return
      setElapsedSeconds(Math.max(0, Math.round((Date.now() - searchStartedAtRef.current) / 1000)))
    }
    updateElapsedTime()
    const timer = window.setInterval(updateElapsedTime, 1000)
    return () => window.clearInterval(timer)
  }, [isActive])

  useEffect(() => {
    if (isActive) {
      wasActiveRef.current = true
      setShowTerminalShortcut(false)
      return
    }

    if (!wasActiveRef.current) return
    wasActiveRef.current = false
    setShowTerminalShortcut(true)
    const hideTimer = window.setTimeout(() => setShowTerminalShortcut(false), 3000)
    return () => window.clearTimeout(hideTimer)
  }, [isActive])

  if (!isActive && !isCancelled && safeTotalItems === 0) return null

  const scrollToPanel = () => {
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <>
      <section
        ref={panelRef}
        id={panelId}
        className={cn(
          "scroll-mt-4 overflow-hidden rounded-lg border bg-white shadow-sm",
          state === "active" && "border-blue-200",
          state === "completed" && "border-green-200",
          state === "cancelled" && "border-amber-200"
        )}
        role="status"
        aria-live="polite"
      >
        <div
          className={cn(
            "flex items-start justify-between gap-3 border-b px-4 py-2.5",
            state === "active" && "border-blue-100 bg-blue-50/70",
            state === "completed" && "border-green-100 bg-green-50/70",
            state === "cancelled" && "border-amber-100 bg-amber-50/70"
          )}
        >
          <div className="flex min-w-0 items-start gap-3">
            {state === "active" ? (
              <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-blue-600" />
            ) : state === "cancelled" ? (
              <CircleX className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
            )}
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-gray-950">
                {state === "active"
                  ? "Suche läuft"
                  : state === "cancelled"
                    ? "Suche abgebrochen"
                    : "Suche abgeschlossen"}
              </h2>
              <p className="mt-0.5 text-xs text-gray-600">
                {state === "active"
                  ? "Die Ergebnisse werden fortlaufend ergänzt."
                  : state === "cancelled"
                    ? "Die angezeigten Ergebnisse sind unvollständig."
                    : `${safeCompletedItems} ${completedUnit} wurden geprüft.`}
              </p>
            </div>
          </div>
          {isActive && onCancel && <SearchCancelButton onClick={onCancel} />}
        </div>

        <div className="px-4 py-2.5">
          <dl className="grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-4 sm:gap-y-0">
            <div className="min-w-0">
              <dt className="text-[11px] text-gray-500">Fortschritt</dt>
              <dd className="text-sm font-semibold tabular-nums text-gray-950">{progress}%</dd>
            </div>
            <div className="min-w-0" aria-label={`${safeCompletedItems} von ${safeTotalItems} ${progressUnit} geprüft`}>
              <dt className="text-[11px] text-gray-500">Geprüft</dt>
              <dd className="text-sm font-semibold tabular-nums text-gray-950">{safeCompletedItems}/{safeTotalItems}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] text-gray-500">Offen</dt>
              <dd className="text-sm font-semibold tabular-nums text-gray-950">{remainingItems}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] text-gray-500">Dauer</dt>
              <dd className="truncate text-sm font-semibold tabular-nums text-gray-950">{formatElapsedTime(elapsedSeconds)}</dd>
            </div>
          </dl>

          <div className="mt-2 h-1.5 overflow-hidden rounded bg-gray-100">
            <div
              className={cn(
                "h-full rounded transition-all duration-500 ease-out",
                state === "active" && "bg-blue-600",
                state === "completed" && "bg-green-600",
                state === "cancelled" && "bg-amber-500"
              )}
              style={{ width: `${progress || (isActive ? 2 : 0)}%` }}
            />
          </div>

          {detail && <div className="mt-2 truncate text-xs text-gray-600">{detail}</div>}

          <div className="relative mt-2.5">
            <div className={cn(!isActive && "invisible")} aria-hidden={!isActive || undefined}>
              <SearchQueueStatus status={queueStatus} embedded />
            </div>
            {!isActive && (
              <div
                className={cn(
                  "absolute inset-0 flex items-start gap-2 border-t pt-2 text-xs font-medium",
                  state === "cancelled"
                    ? "border-amber-200 text-amber-900"
                    : "border-green-200 text-green-900"
                )}
              >
                {state === "cancelled" ? (
                  <CircleX className="h-4 w-4 shrink-0 text-amber-600" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                )}
                <span>{state === "cancelled" ? "Suche vorzeitig beendet." : "Alle geplanten Anfragen verarbeitet."}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {(isActive || showTerminalShortcut) && (
        <button
          type="button"
          className={cn(
            "fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3 z-40 inline-flex min-h-11 items-center gap-2 rounded-md border bg-white px-3 py-2 text-left text-xs font-semibold shadow-lg transition-colors hover:bg-gray-50 sm:bottom-4 sm:right-4",
            state === "active" && "border-blue-300 text-blue-900",
            state === "completed" && "border-green-300 text-green-900",
            state === "cancelled" && "border-amber-300 text-amber-950"
          )}
          onClick={scrollToPanel}
          aria-controls={panelId}
          title="Suchstatus anzeigen"
        >
          {state === "active" ? (
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          ) : state === "cancelled" ? (
            <CircleX className="h-4 w-4 text-amber-600" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          )}
          {state === "active" ? (
            <span>
              <span className="block tabular-nums">Suche läuft · {progress}% · {safeCompletedItems}/{safeTotalItems}</span>
              <span className="block text-[10px] font-medium text-blue-700">Ergebnisse unvollständig</span>
            </span>
          ) : state === "cancelled" ? (
            <span>
              <span className="block">Suche abgebrochen</span>
              <span className="block text-[10px] font-medium text-amber-800">Ergebnisse unvollständig</span>
            </span>
          ) : (
            <span>Suche abgeschlossen</span>
          )}
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
      )}
    </>
  )
}
