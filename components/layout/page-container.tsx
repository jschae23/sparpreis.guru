import type { ReactNode } from "react"

export function PageContainer({ children }: { children: ReactNode }) {
  return (
    <div className="container mx-auto max-w-6xl px-0 py-6 sm:px-4">
      {children}
    </div>
  )
}
