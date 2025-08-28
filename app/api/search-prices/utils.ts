// Durchschnittswerte für Response-Zeiten (ms) - global für alle Sessions
let averageUncachedResponseTime = 2000 // Startwert 2s
let averageCachedResponseTime = 100 // Startwert 0.1s
const alpha = 0.2 // Glättungsfaktor für gleitenden Mittelwert

// Progress-Update-Funktion
export async function updateProgress(
  sessionId: string,
  currentDay: number,
  totalDays: number,
  currentDate: string,
  isComplete = false,
  uncachedDays?: number,
  cachedDays?: number,
  avgUncachedTime?: number,
  avgCachedTime?: number,
  queueSize?: number,
  activeRequests?: number
) {
  try {
    // Use absolute URL for server-side fetch
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    await fetch(`${baseUrl}/api/search-progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        currentDay,
        totalDays,
        currentDate,
        isComplete,
        uncachedDays,
        cachedDays,
        averageUncachedResponseTime: avgUncachedTime,
        averageCachedResponseTime: avgCachedTime,
        queueSize,
        activeRequests,
      }),
    })
  } catch (error) {
    console.error("Error updating progress:", error)
  }
}

// Update average response times
export function updateAverageResponseTimes(duration: number, isCached: boolean) {
  if (isCached) {
    averageCachedResponseTime = alpha * duration + (1 - alpha) * averageCachedResponseTime
  } else {
    averageUncachedResponseTime = alpha * duration + (1 - alpha) * averageUncachedResponseTime
  }
}

export function getAverageResponseTimes() {
  return {
    uncached: averageUncachedResponseTime,
    cached: averageCachedResponseTime
  }
}

// Hilfsfunktion für lokales Datum im Format YYYY-MM-DD
export function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, "0")
  const day = date.getDate().toString().padStart(2, "0")
  return `${year}-${month}-${day}`
}