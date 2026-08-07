export const SEARCH_TIME_ZONE = "Europe/Berlin"

const berlinDateFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: SEARCH_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

export function getBerlinDateKey(date = new Date()) {
  const parts = berlinDateFormatter.formatToParts(date)
  const year = parts.find((part) => part.type === "year")?.value
  const month = parts.find((part) => part.type === "month")?.value
  const day = parts.find((part) => part.type === "day")?.value

  if (!year || !month || !day) {
    throw new Error("Could not determine the current date in Europe/Berlin")
  }

  return `${year}-${month}-${day}`
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

export function getEarliestSearchDateKey(now = new Date()) {
  return addDaysToDateKey(getBerlinDateKey(now), 1)
}
