"use client"

import { Clock3, TriangleAlert, Users } from "lucide-react"
import type { SearchQueueStatusData } from "@/hooks/use-search-queue-status"
import { cn } from "@/lib/utils"

function formatEta(seconds: number): string {
  const safeSeconds = Math.max(1, Math.ceil(seconds))
  const roundedSeconds = safeSeconds < 60
    ? Math.ceil(safeSeconds / 5) * 5
    : safeSeconds < 5 * 60
      ? Math.ceil(safeSeconds / 15) * 15
      : Math.ceil(safeSeconds / 60) * 60
  if (roundedSeconds < 60) return `${roundedSeconds} Sek.`

  const minutes = Math.floor(roundedSeconds / 60)
  const remainingSeconds = roundedSeconds % 60
  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes} Min. ${remainingSeconds} Sek.`
      : `${minutes} Min.`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0
    ? `${hours} Std. ${remainingMinutes} Min.`
    : `${hours} Std.`
}

export function SearchQueueStatus({
  status,
  className,
}: {
  status: SearchQueueStatusData
  className?: string
}) {
  const hasDelayNotice = status.isContended || status.isRateLimited

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        hasDelayNotice
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-blue-100 bg-blue-50/70 text-blue-900",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 font-medium">
        <Clock3 className="h-4 w-4 shrink-0" />
        <span>Voraussichtlich noch ca. {formatEta(status.estimatedTimeRemaining)}</span>
      </div>

      {status.isContended && (
        <div className="mt-1.5 flex items-start gap-2 text-xs">
          <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Aktuell sind insgesamt {status.otherActiveSearches + 1} Suchen aktiv.{" "}
            {status.otherRemainingRequests > 0 && (
              <>
                {status.otherActiveSearches === 1
                  ? `Die andere Suche hat noch ${status.otherRemainingRequests.toLocaleString("de-DE")} offene ${status.otherRemainingRequests === 1 ? "Anfrage" : "Anfragen"}. `
                  : `Die anderen Suchen haben zusammen noch ${status.otherRemainingRequests.toLocaleString("de-DE")} offene Anfragen. `}
              </>
            )}
            Die Anfragen werden fair abwechselnd verarbeitet, daher kann deine Suche etwas länger dauern.
          </span>
        </div>
      )}

      {status.isRateLimited && (
        <div className="mt-1.5 flex items-start gap-2 text-xs">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Die DB begrenzt Anfragen aktuell. Ergebnisse erscheinen weiterhin nach und nach.</span>
        </div>
      )}
    </div>
  )
}
