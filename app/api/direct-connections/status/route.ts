import { NextResponse } from "next/server"
import { logError } from "@/lib/shared/logger"
import { getDirectConnectionsDbRefreshStatus } from "../direct-connections-db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const LOG_SCOPE = "direktverbindungen.status"

export async function GET() {
  try {
    const status = await getDirectConnectionsDbRefreshStatus()

    return NextResponse.json(status, {
      headers: {
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    logError(LOG_SCOPE, "Could not determine direct connections DB status", error)
    return NextResponse.json(
      { error: "Could not determine direct connections DB status" },
      { status: 500 }
    )
  }
}
