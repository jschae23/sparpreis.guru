import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

export function IncompleteSearchNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950",
        className
      )}
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      <div>
        <div className="font-semibold">Suche abgebrochen – Ergebnisse unvollständig</div>
        <p className="mt-1 text-sm text-amber-900">
          Bereits angezeigte Ergebnisse können vom vollständigen Suchergebnis abweichen. Starte die Suche erneut und lasse sie bis zum Abschluss laufen, um vollständige und verlässliche Ergebnisse zu erhalten.
        </p>
      </div>
    </div>
  )
}
