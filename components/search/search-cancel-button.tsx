"use client"

import type { ComponentProps } from "react"
import { Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type SearchCancelButtonProps = Omit<ComponentProps<typeof Button>, "children" | "variant" | "size">

export function SearchCancelButton({ className, ...props }: SearchCancelButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        "h-8 shrink-0 border-red-200 bg-red-50 px-2.5 text-xs font-semibold text-red-700 hover:border-red-300 hover:bg-red-100 hover:text-red-800 focus-visible:ring-red-400 [&_svg]:size-3",
        className,
      )}
      {...props}
    >
      <Square className="fill-current" aria-hidden="true" />
      Suche abbrechen
    </Button>
  )
}
