import { useId } from "react"
import { ArrowDown, ArrowUp } from "lucide-react"
import { cn } from "@/lib/utils"

export type JourneySortDirection = "asc" | "desc"

export interface JourneySortOption<Key extends string> {
  key: Key
  label: string
}

interface JourneySortControlsProps<Key extends string> {
  options: readonly JourneySortOption<Key>[]
  sortKey: Key
  sortDir: JourneySortDirection
  onSort: (key: Key) => void
  ariaLabel: string
  embedded?: boolean
  className?: string
  desktopAlign?: "start" | "end"
}

export function JourneySortControls<Key extends string>({
  options,
  sortKey,
  sortDir,
  onSort,
  ariaLabel,
  embedded = false,
  className,
  desktopAlign = "end",
}: JourneySortControlsProps<Key>) {
  const generatedId = useId()
  const selectId = `${generatedId}-sort`

  return (
    <div
      className={cn(
        "flex items-center gap-3",
        desktopAlign === "start" ? "sm:justify-start" : "sm:justify-end",
        embedded ? "bg-transparent" : "border-b border-gray-200 bg-white px-3 py-2",
        className
      )}
      aria-label={ariaLabel}
    >
      <label htmlFor={selectId} className="shrink-0 text-xs font-medium text-gray-600">
        Sortierung
      </label>
      <div className="min-w-0 flex-1 sm:w-64 sm:flex-none">
        <select
          id={selectId}
          className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          value={sortKey}
          onChange={(event) => onSort(event.target.value as Key)}
        >
          {options.map((option) => (
            <option key={option.key} value={option.key}>{option.label}</option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors hover:border-blue-300 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        onClick={() => onSort(sortKey)}
        aria-label={sortDir === "asc" ? "Absteigend sortieren" : "Aufsteigend sortieren"}
        title={sortDir === "asc" ? "Aufsteigend" : "Absteigend"}
      >
        {sortDir === "asc"
          ? <ArrowUp className="h-4 w-4" />
          : <ArrowDown className="h-4 w-4" />}
      </button>
    </div>
  )
}
