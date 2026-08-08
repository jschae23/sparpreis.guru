import { Children, type ReactNode } from "react"
import { ArrowRight, ChevronDown, ChevronUp, Clock, Shuffle, Train } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { calculateDuration, getDurationMinutes } from "@/lib/train-search/day-details-utils"
import {
  JourneyTimelineHorizontal,
  JourneyTimelineVertical,
  type JourneyLeg,
} from "@/components/bestpreissuche/journey-timeline"
import { VehicleTypesSummary } from "@/components/bestpreissuche/vehicle-types-summary"

export interface RoundTripJourneyData {
  outwardDate: string
  returnDate?: string
  nights?: number
  outwardPrice: number
  returnPrice?: number
  totalPrice: number
  outwardDeparture: string
  outwardArrival: string
  returnDeparture?: string
  returnArrival?: string
  outwardTransfers?: number
  returnTransfers?: number
  outwardLegs?: JourneyLeg[]
  returnLegs?: JourneyLeg[]
}

export interface OneWayJourneyData {
  date: string
  price: number
  departure: string
  arrival: string
  origin?: string
  destination?: string
  transfers?: number
  legs?: JourneyLeg[]
}

export function DirectJourneyBadge({ compact = false }: { compact?: boolean }) {
  return (
    <Badge className={cn(
      "inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 py-0.5 font-semibold text-blue-700 shadow-none",
      compact ? "px-1.5 text-[10px]" : "px-2 text-[11px]"
    )}>
      <Train className="h-3 w-3" />
      Direkt
    </Badge>
  )
}

export function JourneyBookingButton({
  direction,
  href,
  onClick,
  className,
}: {
  direction: "one-way" | "outward" | "return"
  href?: string
  onClick?: () => void
  className?: string
}) {
  const label = direction === "one-way"
    ? "Fahrt buchen"
    : direction === "outward"
      ? "Hinfahrt buchen"
      : "Rückfahrt buchen"
  const buttonClasses = cn(
    "h-8 px-2 text-xs",
    direction !== "return"
      ? "bg-blue-600 text-white hover:bg-blue-700"
      : "border-blue-200 bg-white text-blue-700 hover:bg-blue-50",
    className
  )
  const content = <><Train className="h-3.5 w-3.5" />{label}</>

  if (href) {
    return (
      <Button asChild size="sm" variant={direction === "return" ? "outline" : "default"} className={buttonClasses}>
        <a href={href} target="_blank" rel="noopener noreferrer" title={label}>{content}</a>
      </Button>
    )
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={direction === "return" ? "outline" : "default"}
      className={buttonClasses}
      onClick={onClick}
      title={label}
    >
      {content}
    </Button>
  )
}

export function JourneyBookingButtonGroup({
  children,
  label,
}: {
  children: ReactNode
  label?: string
}) {
  const actions = Children.toArray(children)

  return (
    <div className={cn(
      "grid w-full gap-2 sm:flex sm:w-auto sm:items-center",
      actions.length > 1 ? "grid-cols-2" : "grid-cols-1"
    )}>
      {label && <span className="hidden text-xs font-semibold text-blue-700 sm:inline">{label}</span>}
      {actions.map((child, index) => (
        <div key={index} className="min-w-0 [&>*]:w-full">{child}</div>
      ))}
    </div>
  )
}

export function JourneyResultActionBar({
  bookingActions,
  secondaryActions,
  layout = "default",
  dense = false,
  secondaryColumns = 1,
}: {
  bookingActions?: ReactNode
  secondaryActions?: ReactNode
  layout?: "default" | "table"
  dense?: boolean
  secondaryColumns?: 1 | 2
}) {
  const tableLayout = layout === "table"

  return (
    <div className={cn(
      "flex flex-col gap-2 border-t border-gray-100 bg-gray-50/70 px-3",
      tableLayout
        ? "py-2 md:grid md:grid-cols-[minmax(7rem,1fr)_minmax(7rem,1fr)_minmax(10rem,1.5fr)_minmax(7rem,0.85fr)_minmax(7rem,0.85fr)] md:items-center md:gap-4 md:px-4"
        : cn("sm:flex-row sm:items-center sm:justify-between", dense ? "py-1.5" : "py-2 sm:px-4")
    )}>
      <div className={cn(
        tableLayout
          ? "md:col-start-5 md:row-start-1 md:flex md:justify-end"
          : "sm:order-2"
      )}>
        {bookingActions}
      </div>
      <div className={cn(
        "grid w-full gap-2",
        secondaryColumns === 2 ? "grid-cols-2" : "grid-cols-1",
        tableLayout
          ? "md:col-span-4 md:col-start-1 md:row-start-1 md:flex md:w-auto md:flex-wrap md:items-center md:justify-start md:gap-x-4"
          : "sm:order-1 sm:flex sm:w-auto sm:items-center sm:justify-start"
      )}>
        {secondaryActions}
      </div>
    </div>
  )
}

export function JourneyDisclosureButton({
  icon,
  label,
  expandedLabel,
  mobileLabel,
  expanded,
  onClick,
  disabled = false,
  layout = "default",
}: {
  icon: ReactNode
  label: string
  expandedLabel: string
  mobileLabel: string
  expanded: boolean
  onClick: () => void
  disabled?: boolean
  layout?: "default" | "table"
}) {
  const tableLayout = layout === "table"

  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-8 items-center justify-center gap-1 rounded-md border border-gray-200 bg-white px-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-gray-300",
        tableLayout
          ? "md:min-h-0 md:justify-start md:gap-1.5 md:rounded-none md:border-0 md:bg-transparent md:px-0 md:text-xs"
          : "sm:min-h-0 sm:justify-start sm:gap-1.5 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-0 sm:text-xs"
      )}
      onClick={onClick}
      disabled={disabled}
      aria-expanded={expanded}
    >
      {icon}
      <span className={tableLayout ? "md:hidden" : "sm:hidden"}>{mobileLabel}</span>
      <span className={tableLayout ? "hidden md:inline" : "hidden sm:inline"}>
        {expanded ? expandedLabel : label}
      </span>
      {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
    </button>
  )
}

function formatFullDate(value?: string) {
  if (!value) return "–"
  return new Date(value).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function formatTime(value?: string) {
  if (!value) return "–"
  return new Date(value).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatPrice(value?: number) {
  if (typeof value !== "number") return "–"
  return `${value.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`
}

function getRoundTripTravelMinutes(journey: RoundTripJourneyData) {
  if (
    !journey.outwardDeparture ||
    !journey.outwardArrival ||
    !journey.returnDeparture ||
    !journey.returnArrival
  ) return null

  return getDurationMinutes(journey.outwardDeparture, journey.outwardArrival) +
    getDurationMinutes(journey.returnDeparture, journey.returnArrival)
}

function formatTravelMinutes(minutes: number | null) {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return null
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}min`
}

function transferLabel(transfers?: number) {
  if (transfers === 0) return "Direkt"
  if (typeof transfers !== "number") return "–"
  return `${transfers} Umstieg${transfers === 1 ? "" : "e"}`
}

function DirectionSummary({
  direction,
  date,
  departure,
  arrival,
  price,
  transfers,
  legs,
}: {
  direction: "Einfache Fahrt" | "Hinfahrt" | "Rückfahrt"
  date?: string
  departure?: string
  arrival?: string
  price?: number
  transfers?: number
  legs?: JourneyLeg[]
}) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        <span className="font-semibold uppercase tracking-wide text-blue-700">{direction}</span>
        <span className="hidden text-gray-300 sm:inline" aria-hidden="true">·</span>
        <span className="hidden font-medium text-gray-500 sm:inline">Einzelpreis {formatPrice(price)}</span>
      </div>
      <div className="mt-0.5 truncate text-xs font-semibold text-gray-900 sm:text-sm">{formatFullDate(date)}</div>
      <div className="mt-0.5 flex items-center gap-1 text-base font-bold tabular-nums text-gray-950 sm:mt-1 sm:gap-1.5 sm:text-lg">
        <span>{formatTime(departure)}</span>
        <ArrowRight className="h-3 w-3 shrink-0 text-gray-400 sm:h-3.5 sm:w-3.5" />
        <span>{formatTime(arrival)}</span>
      </div>
      <div className="mt-0.5 flex min-h-4 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-600 sm:mt-1 sm:min-h-[1.375rem] sm:text-xs">
        <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-gray-800">
          <Clock className="h-3.5 w-3.5 text-gray-400" />
          {departure && arrival ? calculateDuration(departure, arrival) : "–"}
        </span>
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <Shuffle className="h-3.5 w-3.5 text-gray-400" />
          {transferLabel(transfers)}
        </span>
        <span className="hidden sm:inline-flex">
          <VehicleTypesSummary interval={{ abschnitte: legs || [] }} />
        </span>
      </div>
      <div className="mt-0.5 text-[11px] font-medium text-gray-500 sm:hidden">{formatPrice(price)}</div>
    </div>
  )
}

export function OneWayJourneySummary({
  journey,
  mobileBadges,
  desktopBadges,
  priceTone,
  layout = "card",
  showMobileRoute = true,
}: {
  journey: OneWayJourneyData
  mobileBadges?: ReactNode
  desktopBadges?: ReactNode
  priceTone: string
  layout?: "card" | "table"
  showMobileRoute?: boolean
}) {
  if (layout === "table") {
    return (
      <>
        <div className="min-h-[10.75rem] p-2.5 md:hidden">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1">{mobileBadges}</div>
            <div className="shrink-0 text-right">
              <div className="text-[10px] text-gray-500">Preis</div>
              <div className={cn("rounded-md px-1.5 py-0.5 text-lg font-bold leading-tight tabular-nums", priceTone)}>
                {formatPrice(journey.price)}
              </div>
            </div>
          </div>
          <section className="mt-2 min-w-0" aria-label="Einfache Fahrt">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-blue-700">
                Einfache Fahrt
              </span>
              <span className="min-w-0 truncate text-xs font-semibold text-gray-700">
                {formatFullDate(journey.date)}
              </span>
            </div>

            <div className="mt-2 flex items-center gap-1 text-xl font-bold tabular-nums text-gray-950">
              <span>{formatTime(journey.departure)}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
              <span>{formatTime(journey.arrival)}</span>
            </div>
            {showMobileRoute && (journey.origin || journey.destination) && (
              <div
                className="mt-0.5 min-h-4 truncate text-[10px] font-medium leading-tight text-gray-500"
                title={`${journey.origin || "Start"} → ${journey.destination || "Ziel"}`}
              >
                {journey.origin || "Start"} → {journey.destination || "Ziel"}
              </div>
            )}
            <div className="mt-1 flex min-h-[1.375rem] flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
              <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-gray-800">
                <Clock className="h-3.5 w-3.5 text-gray-400" />
                {calculateDuration(journey.departure, journey.arrival)}
              </span>
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <Shuffle className="h-3.5 w-3.5 text-gray-400" />
                {transferLabel(journey.transfers)}
              </span>
              <span className="inline-flex">
                <VehicleTypesSummary interval={{ abschnitte: journey.legs || [] }} />
              </span>
            </div>
          </section>
        </div>

        <div className="hidden px-4 py-3 md:block">
          <div className="mb-2 flex min-h-6 flex-wrap items-center gap-1.5">{desktopBadges}</div>
          <div className="grid grid-cols-[minmax(7rem,1fr)_minmax(7rem,1fr)_minmax(10rem,1.5fr)_minmax(7rem,0.85fr)_minmax(7rem,0.85fr)] items-start gap-4 text-sm">
            <div className="relative min-w-0">
              <div className="text-lg font-bold tabular-nums text-gray-950">{formatTime(journey.departure)}</div>
              <div className="truncate text-xs text-gray-500" title={journey.origin}>{journey.origin || "–"}</div>
              <ArrowRight className="absolute -right-3 top-2 h-3.5 w-3.5 text-gray-300" />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold tabular-nums text-gray-950">{formatTime(journey.arrival)}</div>
              <div className="truncate text-xs text-gray-500" title={journey.destination}>{journey.destination || "–"}</div>
            </div>
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1 font-semibold text-gray-900">
                <Clock className="h-3.5 w-3.5 text-gray-400" />
                {calculateDuration(journey.departure, journey.arrival)}
              </div>
              <div className="mt-1 flex min-h-5 flex-wrap items-center gap-1">
                <VehicleTypesSummary interval={{ abschnitte: journey.legs || [] }} />
              </div>
            </div>
            <div>
              <div className="inline-flex items-center gap-1 font-semibold text-gray-900">
                <Shuffle className="h-3.5 w-3.5 text-gray-400" />
                {transferLabel(journey.transfers)}
              </div>
            </div>
            <div className="text-right">
              <div className={cn("inline-block rounded-md px-2 py-1 text-xl font-bold tabular-nums", priceTone)}>
                {formatPrice(journey.price)}
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="min-h-[9.5rem] p-2.5 sm:min-h-[8.5rem] sm:p-4">
      <div className="flex items-start justify-between gap-2 sm:hidden">
        <div className="flex min-w-0 flex-wrap items-center gap-1">{mobileBadges}</div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] text-gray-500">Preis</div>
          <div className={cn("rounded-md px-1.5 py-0.5 text-lg font-bold leading-tight tabular-nums", priceTone)}>
            {formatPrice(journey.price)}
          </div>
        </div>
      </div>
      <div className="mt-2 sm:hidden">
        <DirectionSummary
          direction="Einfache Fahrt"
          date={journey.date}
          departure={journey.departure}
          arrival={journey.arrival}
          price={journey.price}
          transfers={journey.transfers}
          legs={journey.legs}
        />
        {(journey.origin || journey.destination) && (
          <div className="mt-2 truncate border-t border-gray-100 pt-1.5 text-[11px] font-medium text-gray-600">
            {journey.origin || "Start"} → {journey.destination || "Ziel"}
          </div>
        )}
      </div>

      <div className="mb-2 hidden min-h-6 flex-wrap items-center gap-1.5 sm:flex">{desktopBadges}</div>
      <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_7rem] items-center gap-4 sm:grid">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Einfache Fahrt</div>
          <div className="mt-0.5 truncate text-sm font-semibold text-gray-900">{formatFullDate(journey.date)}</div>
          {(journey.origin || journey.destination) && (
            <div className="mt-1 truncate text-xs text-gray-500">{journey.origin || "Start"} → {journey.destination || "Ziel"}</div>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-lg font-bold tabular-nums text-gray-950">
            <span>{formatTime(journey.departure)}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span>{formatTime(journey.arrival)}</span>
          </div>
          <div className="mt-1 flex min-h-[1.375rem] flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-gray-800">
              <Clock className="h-3.5 w-3.5 text-gray-400" />
              {calculateDuration(journey.departure, journey.arrival)}
            </span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <Shuffle className="h-3.5 w-3.5 text-gray-400" />
              {transferLabel(journey.transfers)}
            </span>
            <VehicleTypesSummary interval={{ abschnitte: journey.legs || [] }} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Preis</div>
          <div className={cn("inline-block rounded-md px-2 py-1 text-xl font-bold tabular-nums", priceTone)}>
            {formatPrice(journey.price)}
          </div>
        </div>
      </div>
    </div>
  )
}

export function OneWayJourneyDetails({ journey }: { journey: OneWayJourneyData }) {
  const legs = journey.legs || []
  if (legs.length === 0) return null

  return (
    <div className="border-t border-gray-200 bg-white p-3 sm:p-4">
      <section className="min-w-0 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Fahrtverlauf</h4>
        <div className="hidden md:block"><JourneyTimelineHorizontal legs={legs} /></div>
        <div className="md:hidden"><JourneyTimelineVertical legs={legs} /></div>
      </section>
    </div>
  )
}

export function OneWayJourneySummaryPlaceholder({ layout = "card" }: { layout?: "card" | "table" }) {
  if (layout === "table") {
    return (
      <>
        <div className="min-h-[10.75rem] animate-pulse p-2.5 md:hidden">
          <div className="flex items-start justify-between gap-2">
            <div className="h-5 w-24 rounded-full bg-blue-100" />
            <div className="text-right">
              <div className="text-[10px] text-gray-500">Preis</div>
              <div className="mt-0.5 h-7 w-20 rounded bg-green-100" />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-3 w-20 rounded bg-blue-100" />
            <div className="h-4 w-32 rounded bg-gray-100" />
          </div>
          <div className="mt-2 flex items-center gap-1">
            <div className="h-6 w-14 rounded bg-gray-200" />
            <ArrowRight className="h-4 w-4 text-gray-300" />
            <div className="h-6 w-14 rounded bg-gray-200" />
          </div>
          <div className="mt-1 h-3 w-40 rounded bg-gray-100" />
          <div className="mt-1 flex min-h-[1.375rem] items-center gap-2">
            <div className="h-4 w-16 rounded bg-gray-200" />
            <div className="h-4 w-20 rounded bg-gray-100" />
            <div className="h-4 w-14 rounded bg-blue-100" />
          </div>
        </div>
        <div className="hidden animate-pulse px-4 py-3 md:block">
          <div className="mb-2 flex min-h-6 items-center">
            <div className="h-5 w-24 rounded-full bg-blue-100" />
          </div>
          <div className="grid grid-cols-[minmax(7rem,1fr)_minmax(7rem,1fr)_minmax(10rem,1.5fr)_minmax(7rem,0.85fr)_minmax(7rem,0.85fr)] items-start gap-4">
            <div><div className="h-6 w-14 rounded bg-gray-200" /><div className="mt-1 h-3 w-24 max-w-full rounded bg-gray-100" /></div>
            <div><div className="h-6 w-14 rounded bg-gray-200" /><div className="mt-1 h-3 w-24 max-w-full rounded bg-gray-100" /></div>
            <div><div className="h-4 w-16 rounded bg-gray-200" /><div className="mt-2 h-4 w-28 max-w-full rounded bg-gray-100" /></div>
            <div><div className="h-4 w-16 rounded bg-gray-200" /><div className="mt-2 h-3 w-20 rounded bg-gray-100" /></div>
            <div className="text-right"><div className="ml-auto h-8 w-20 rounded bg-green-100" /></div>
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="min-h-[9.5rem] animate-pulse p-2.5 sm:min-h-[8.5rem] sm:p-4">
      <div className="flex items-start justify-between gap-2 sm:hidden">
        <div className="h-5 w-24 rounded-full bg-blue-100" />
        <div className="text-right">
          <div className="text-[10px] text-gray-500">Preis</div>
          <div className="mt-0.5 h-7 w-20 rounded bg-green-100" />
        </div>
      </div>
      <div className="mt-2 sm:hidden">
        <div className="h-4 w-24 rounded bg-blue-100" />
        <div className="mt-0.5 h-4 w-28 rounded bg-gray-100" />
        <div className="mt-0.5 flex h-6 items-center gap-1.5">
          <div className="h-5 w-12 rounded bg-gray-200" />
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-300" />
          <div className="h-5 w-12 rounded bg-gray-200" />
        </div>
        <div className="mt-0.5 h-4 w-28 rounded bg-gray-100" />
        <div className="mt-0.5 h-4 w-14 rounded bg-gray-100" />
        <div className="mt-2 border-t border-gray-100 pt-1.5">
          <div className="h-3 w-40 rounded bg-gray-100" />
        </div>
      </div>

      <div className="mb-2 hidden min-h-6 items-center sm:flex">
        <div className="h-5 w-28 rounded-full bg-blue-100" />
      </div>
      <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_7rem] items-center gap-4 sm:grid">
        <div>
          <div className="h-4 w-24 rounded bg-blue-100" />
          <div className="mt-1 h-5 w-32 rounded bg-gray-100" />
          <div className="mt-1 h-4 w-40 max-w-full rounded bg-gray-100" />
        </div>
        <div>
          <div className="flex h-7 items-center gap-1.5">
            <div className="h-6 w-12 rounded bg-gray-200" />
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-300" />
            <div className="h-6 w-12 rounded bg-gray-200" />
          </div>
          <div className="mt-1 h-[1.375rem] w-36 rounded bg-gray-100" />
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Preis</div>
          <div className="ml-auto h-9 w-20 rounded bg-green-100" />
        </div>
      </div>
    </div>
  )
}

function RoundTripDirectionPanel({
  direction,
  date,
  departure,
  arrival,
  price,
  transfers,
  legs,
}: {
  direction: "Hinfahrt" | "Rückfahrt"
  date?: string
  departure?: string
  arrival?: string
  price?: number
  transfers?: number
  legs?: JourneyLeg[]
}) {
  const departureStation = legs?.[0]?.abfahrtsOrt
  const arrivalStation = legs?.[legs.length - 1]?.ankunftsOrt
  const stationRoute = departureStation && arrivalStation
    ? `${departureStation} → ${arrivalStation}`
    : departureStation || arrivalStation || ""

  return (
    <section
      className="flex min-h-[7.25rem] min-w-0 flex-col sm:min-h-[5.25rem]"
      aria-label={direction}
    >
      <div className="pb-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-blue-700">
            {direction}
          </span>
          <span className="min-w-0 truncate text-xs font-semibold text-gray-700 sm:text-sm" title={formatFullDate(date)}>
            {formatFullDate(date)}
          </span>
          <span className="shrink-0 text-[11px] font-medium tabular-nums text-gray-500 sm:text-xs">
            · {formatPrice(price)}
          </span>
        </div>
      </div>

      <div className="flex-1 py-1">
        <div className="flex items-center gap-1 text-lg font-bold tabular-nums text-gray-950">
          <span>{formatTime(departure)}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span>{formatTime(arrival)}</span>
        </div>
        <div className="mt-0.5 min-h-4 truncate text-[10px] font-medium leading-tight text-gray-500 sm:text-[11px]" title={stationRoute}>
          {stationRoute}
        </div>
        <div className="mt-0.5 flex min-h-[2.625rem] flex-wrap content-start items-center gap-x-2 gap-y-1 text-xs text-gray-600 sm:min-h-[1.375rem]">
          <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-gray-800">
            <Clock className="h-3.5 w-3.5 text-gray-400" />
            {departure && arrival ? calculateDuration(departure, arrival) : "–"}
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <Shuffle className="h-3.5 w-3.5 text-gray-400" />
            {transferLabel(transfers)}
          </span>
          <span className="inline-flex">
            <VehicleTypesSummary interval={{ abschnitte: legs || [] }} />
          </span>
        </div>
      </div>

    </section>
  )
}

export function RoundTripJourneySummary({
  journey,
  mobileBadges,
  desktopBadges,
  priceTone,
  dense = false,
}: {
  journey: RoundTripJourneyData
  mobileBadges?: ReactNode
  desktopBadges?: ReactNode
  priceTone: string
  dense?: boolean
}) {
  const nights = journey.nights
  const totalTravelTime = formatTravelMinutes(getRoundTripTravelMinutes(journey))

  return (
    <div className={cn(
      "min-h-[10.75rem] p-2.5",
      dense ? "sm:min-h-[8.25rem]" : "sm:min-h-[9rem] sm:p-4"
    )}>
      <div className="flex items-start justify-between gap-2 sm:hidden">
        <div className="flex min-w-0 flex-wrap items-center gap-1">{mobileBadges}</div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] text-gray-500">Gesamt</div>
          <div className={cn("rounded-md px-1.5 py-0.5 text-lg font-bold leading-tight tabular-nums", priceTone)}>
            {formatPrice(journey.totalPrice)}
          </div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 divide-x divide-gray-200 sm:hidden [&>section:first-child]:pr-2 [&>section:last-child]:pl-2">
        <RoundTripDirectionPanel
          direction="Hinfahrt"
          date={journey.outwardDate}
          departure={journey.outwardDeparture}
          arrival={journey.outwardArrival}
          price={journey.outwardPrice}
          transfers={journey.outwardTransfers}
          legs={journey.outwardLegs}
        />
        <RoundTripDirectionPanel
          direction="Rückfahrt"
          date={journey.returnDate}
          departure={journey.returnDeparture}
          arrival={journey.returnArrival}
          price={journey.returnPrice}
          transfers={journey.returnTransfers}
          legs={journey.returnLegs}
        />
      </div>

      <div className="mt-2 grid min-h-5 grid-cols-2 divide-x divide-gray-100 border-t border-gray-100 pt-1.5 text-xs text-gray-600 sm:hidden">
        <span className="flex items-center justify-center px-2 text-center whitespace-nowrap">
          {typeof nights === "number" ? (
            <span className="inline-flex items-baseline gap-1">
              <span className="font-bold text-gray-900">{nights}</span>
              <span>{nights === 1 ? "Nacht" : "Nächte"}</span>
            </span>
          ) : "Hin- und Rückfahrt"}
        </span>
        {totalTravelTime && (
          <span className="flex items-center justify-center gap-1 px-2 text-center whitespace-nowrap text-gray-800">
            <Clock className="h-3.5 w-3.5 text-gray-400" />
            <span className="font-semibold">{totalTravelTime}</span>
            <span className="font-normal">Fahrzeit</span>
          </span>
        )}
      </div>

      <div className="mb-2 hidden min-h-6 flex-wrap items-center gap-1.5 sm:flex">{desktopBadges}</div>
      <div className="hidden gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)_7rem] sm:items-center">
        <RoundTripDirectionPanel
          direction="Hinfahrt"
          date={journey.outwardDate}
          departure={journey.outwardDeparture}
          arrival={journey.outwardArrival}
          price={journey.outwardPrice}
          transfers={journey.outwardTransfers}
          legs={journey.outwardLegs}
        />

        <div className="border-x border-gray-100 px-2 text-center">
          {typeof nights === "number" ? (
            <>
              <div className="text-lg font-bold text-gray-900">{nights}</div>
              <div className="text-xs text-gray-500">{nights === 1 ? "Nacht" : "Nächte"}</div>
            </>
          ) : <div className="text-xs font-medium text-gray-500">Hin &amp; zurück</div>}
        </div>

        <RoundTripDirectionPanel
          direction="Rückfahrt"
          date={journey.returnDate}
          departure={journey.returnDeparture}
          arrival={journey.returnArrival}
          price={journey.returnPrice}
          transfers={journey.returnTransfers}
          legs={journey.returnLegs}
        />

        <div className="text-right">
          <div className="text-xs text-gray-500">Gesamtpreis</div>
          <div className={cn("inline-block rounded-md px-2 py-1 text-xl font-bold tabular-nums", priceTone)}>
            {formatPrice(journey.totalPrice)}
          </div>
          <div className="mt-1 flex min-h-[1.375rem] items-center justify-end text-xs text-gray-800">
            {totalTravelTime && (
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <Clock className="h-3.5 w-3.5 text-gray-400" />
                <span className="font-semibold">{totalTravelTime}</span>
                <span className="font-normal">Fahrzeit</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function RoundTripJourneyDetails({ journey }: { journey: RoundTripJourneyData }) {
  const outwardLegs = journey.outwardLegs || []
  const returnLegs = journey.returnLegs || []

  if (outwardLegs.length === 0 && returnLegs.length === 0) return null

  return (
    <div className="grid gap-3 border-t border-gray-200 bg-white p-3 sm:p-4 lg:grid-cols-2">
      {([
        ["Fahrtverlauf Hinfahrt", outwardLegs],
        ["Fahrtverlauf Rückfahrt", returnLegs],
      ] as const).map(([title, legs]) => (
        <section key={title} className="min-w-0 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</h4>
          {legs.length > 0 ? (
            <>
              <div className="hidden md:block"><JourneyTimelineHorizontal legs={legs} /></div>
              <div className="md:hidden"><JourneyTimelineVertical legs={legs} /></div>
            </>
          ) : <p className="text-xs text-gray-500">Keine Detaildaten verfügbar.</p>}
        </section>
      ))}
    </div>
  )
}

export function RoundTripJourneySummaryPlaceholder({
  outwardDate,
  returnDate,
  nights,
  dense = false,
  mobileBadge,
  desktopBadge,
}: {
  outwardDate?: string
  returnDate?: string
  nights?: number
  dense?: boolean
  mobileBadge?: ReactNode
  desktopBadge?: ReactNode
}) {
  const DirectionPlaceholder = ({ direction, date }: { direction: string; date?: string }) => (
    <div className="flex min-h-[7.25rem] min-w-0 flex-col sm:min-h-[5.25rem]">
      <div className="pb-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-blue-700">{direction}</span>
          {date ? (
            <span className="min-w-0 truncate text-xs font-semibold text-gray-700 sm:text-sm">{formatFullDate(date)}</span>
          ) : <span className="h-3 w-20 rounded bg-gray-100" />}
          <span className="h-3 w-14 shrink-0 rounded bg-gray-100" />
        </div>
      </div>

      <div className="flex-1 py-1">
        <div className="flex h-7 items-center gap-1">
          <div className="h-5 w-12 rounded bg-gray-200" />
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-300" />
          <div className="h-5 w-12 rounded bg-gray-200" />
        </div>
        <div className="mt-0.5 flex h-4 items-center">
          <div className="h-2.5 w-3/4 rounded bg-gray-100" />
        </div>
        <div className="mt-0.5 flex min-h-[2.625rem] flex-wrap content-start items-center gap-x-2 gap-y-1 sm:min-h-[1.375rem]">
          <div className="h-4 w-12 rounded bg-gray-100" />
          <div className="h-4 w-14 rounded bg-gray-100" />
          <div className="h-[1.375rem] w-10 rounded bg-blue-50" />
        </div>
      </div>

    </div>
  )

  return (
    <div className={cn(
      "min-h-[10.75rem] animate-pulse p-2.5",
      dense ? "sm:min-h-[8.25rem]" : "sm:min-h-[9rem] sm:p-4"
      )}>
      <div className="flex items-start justify-between gap-2 sm:hidden">
        {mobileBadge || <div className="h-5 w-24 rounded-full bg-blue-100" />}
        <div className="text-right">
          <div className="text-[10px] text-gray-500">Gesamt</div>
          <div className="mt-0.5 h-7 w-20 rounded bg-green-100" />
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 divide-x divide-gray-200 sm:hidden [&>div:first-child]:pr-2 [&>div:last-child]:pl-2">
        <DirectionPlaceholder direction="Hinfahrt" date={outwardDate} />
        <DirectionPlaceholder direction="Rückfahrt" date={returnDate} />
      </div>
      <div className="mt-2 grid min-h-5 grid-cols-2 divide-x divide-gray-100 border-t border-gray-100 pt-1.5 text-xs text-gray-600 sm:hidden">
        <span className="flex items-center justify-center px-2 text-center">
          {typeof nights === "number" ? (
            <span className="inline-flex items-baseline gap-1">
              <span className="font-bold text-gray-900">{nights}</span>
              <span>{nights === 1 ? "Nacht" : "Nächte"}</span>
            </span>
          ) : <span className="inline-block h-3 w-20 rounded bg-gray-100" />}
        </span>
        <span className="flex items-center justify-center px-2">
          <span className="inline-block h-3 w-24 rounded bg-gray-100" />
        </span>
      </div>
      <div className="mb-2 hidden min-h-6 items-center sm:flex">
        {desktopBadge || <div className="h-5 w-28 rounded-full bg-blue-100" />}
      </div>
      <div className="hidden gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)_7rem] sm:items-center">
        <DirectionPlaceholder direction="Hinfahrt" date={outwardDate} />
        <div className="border-x border-gray-100 px-2 text-center">
          <div className="mx-auto h-6 w-6 rounded bg-gray-200" />
          <div className="mx-auto mt-1 h-3 w-10 rounded bg-gray-100" />
        </div>
        <DirectionPlaceholder direction="Rückfahrt" date={returnDate} />
        <div className="text-right">
          <div className="text-xs text-gray-500">Gesamtpreis</div>
          <div className="ml-auto h-9 w-20 rounded bg-green-100" />
          <div className="ml-auto mt-1 h-3 w-20 rounded bg-gray-100" />
        </div>
      </div>
    </div>
  )
}
