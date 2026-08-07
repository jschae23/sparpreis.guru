"use client"

import { useEffect, useState } from "react"
import { getEarliestSearchDateKey } from "@/lib/shared/berlin-date"

const DATE_REFRESH_INTERVAL_MS = 30_000

export function useBerlinEarliestSearchDate() {
  const [earliestSearchDate, setEarliestSearchDate] = useState(getEarliestSearchDateKey)

  useEffect(() => {
    const refreshDate = () => setEarliestSearchDate(getEarliestSearchDateKey())
    const refreshVisibleDate = () => {
      if (document.visibilityState === "visible") refreshDate()
    }

    refreshDate()
    const interval = window.setInterval(refreshDate, DATE_REFRESH_INTERVAL_MS)
    window.addEventListener("focus", refreshDate)
    document.addEventListener("visibilitychange", refreshVisibleDate)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener("focus", refreshDate)
      document.removeEventListener("visibilitychange", refreshVisibleDate)
    }
  }, [])

  return earliestSearchDate
}
