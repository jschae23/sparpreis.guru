export type PriceBand = "best" | "low" | "medium" | "elevated" | "high"

export const PRICE_BAND_ORDER: PriceBand[] = ["best", "low", "medium", "elevated", "high"]

export const PRICE_BAND_STYLES: Record<PriceBand, {
  label: string
  text: string
  background: string
  border: string
  emphasis: string
}> = {
  best: {
    label: "Bestpreis",
    text: "text-green-800",
    background: "bg-green-100",
    border: "border-green-300",
    emphasis: "ring-1 ring-inset ring-green-300 shadow-sm",
  },
  low: {
    label: "Günstig",
    text: "text-emerald-700",
    background: "bg-emerald-50",
    border: "border-emerald-200",
    emphasis: "",
  },
  medium: {
    label: "Mittel",
    text: "text-yellow-800",
    background: "bg-yellow-50",
    border: "border-yellow-200",
    emphasis: "",
  },
  elevated: {
    label: "Erhöht",
    text: "text-orange-700",
    background: "bg-orange-50",
    border: "border-orange-200",
    emphasis: "",
  },
  high: {
    label: "Teuer",
    text: "text-red-700",
    background: "bg-red-50",
    border: "border-red-200",
    emphasis: "",
  },
}

export function createPriceBandScale(inputPrices: number[]) {
  const prices = [...new Set(inputPrices.filter((price) => Number.isFinite(price) && price > 0))]
    .sort((left, right) => left - right)
  const min = prices[0] ?? 0
  const max = prices[prices.length - 1] ?? 0
  const hasMeaningfulSpread = prices.length > 1 && max - min >= Math.max(5, min * 0.1)

  const getBand = (price: number): PriceBand => {
    if (!Number.isFinite(price) || price <= 0 || prices.length === 0) return "medium"
    if (price <= min) return "best"
    if (!hasMeaningfulSpread) return "medium"

    const remainingPrices = prices.slice(1)
    if (remainingPrices.length === 1) return "high"

    const rank = remainingPrices.findIndex((candidate) => price <= candidate)
    const normalizedRank = (rank < 0 ? remainingPrices.length - 1 : rank) / (remainingPrices.length - 1)

    if (normalizedRank <= 0.25) return "low"
    if (normalizedRank <= 0.5) return "medium"
    if (normalizedRank <= 0.75) return "elevated"
    return "high"
  }

  const activeBands = PRICE_BAND_ORDER.filter((band) => prices.some((price) => getBand(price) === band))

  return { min, max, getBand, activeBands }
}

export function getPriceBandClasses(band: PriceBand) {
  const style = PRICE_BAND_STYLES[band]
  return `${style.background} ${style.border} ${style.text} ${style.emphasis}`
}
