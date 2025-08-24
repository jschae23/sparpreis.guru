import { NextRequest, NextResponse } from "next/server"
import { metricsCollector } from "./collector"

// Security: List of allowed IPs (localhost, docker networks, common monitoring IPs)
const ALLOWED_IPS = [
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1', // IPv6-mapped IPv4 localhost
  'localhost',
  // Docker default networks
  '172.16.0.0/12',  // Docker default bridge
  '10.0.0.0/8',     // Docker custom networks
  '192.168.0.0/16', // Local networks
]

// Security: API Key from environment
const METRICS_API_KEY = process.env.METRICS_API_KEY || 'dev-metrics-key-change-in-production'

function isIPAllowed(ip: string): boolean {
  if (!ip) return false

  // Normalize IPv6-mapped IPv4 addresses
  if (ip.startsWith('::ffff:')) {
    const ipv4 = ip.replace('::ffff:', '')
    if (ALLOWED_IPS.includes(ipv4)) return true
  }

  // Exact matches
  if (ALLOWED_IPS.includes(ip)) return true
  
  // Check CIDR ranges (simplified)
  for (const allowedRange of ALLOWED_IPS) {
    if (allowedRange.includes('/')) {
      // Simplified CIDR check for common ranges
      if (allowedRange === '172.16.0.0/12' && ip.startsWith('172.')) return true
      if (allowedRange === '10.0.0.0/8' && ip.startsWith('10.')) return true
      if (allowedRange === '192.168.0.0/16' && ip.startsWith('192.168.')) return true
    }
  }
  
  return false
}

function getClientIP(request: NextRequest): string {
  // Try various headers to get real IP
  const forwarded = request.headers.get('x-forwarded-for')
  const realIP = request.headers.get('x-real-ip')
  const cfIP = request.headers.get('cf-connecting-ip')

  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  if (realIP) return realIP
  if (cfIP) return cfIP

  // Fallback to localhost if IP is not available
  return '127.0.0.1'
}

export async function GET(request: NextRequest) {
  // Logge alle Zugriffe, um Prometheus-Requests zu erkennen
  console.log(
    `[METRICS] Incoming request:`,
    {
      url: request.url,
      headers: Object.fromEntries(request.headers.entries()),
      method: "GET"
    }
  )

  try {
    // Security Check 1: API Key
    const authHeader = request.headers.get('authorization')
    const apiKey = request.headers.get('x-api-key')
    const urlKey = new URL(request.url).searchParams.get('key')
    
    const providedKey = authHeader?.replace('Bearer ', '') || apiKey || urlKey
    
    if (!providedKey || providedKey !== METRICS_API_KEY) {
      console.log(`🚫 Metrics: Unauthorized access attempt with key: ${providedKey?.slice(0, 10)}...`)
      return NextResponse.json(
        { error: "Unauthorized - Invalid API key" }, 
        { status: 401 }
      )
    }

    // Security Check 2: IP Address
    const clientIP = getClientIP(request)
    const isDevelopment = process.env.NODE_ENV === 'development'
    
    if (!isDevelopment && !isIPAllowed(clientIP)) {
      console.log(`🚫 Metrics: Access denied for IP: ${clientIP}`)
      return NextResponse.json(
        { error: "Forbidden - IP not allowed" }, 
        { status: 403 }
      )
    }

    // Determine response format
    const accept = request.headers.get('accept')
    const format = new URL(request.url).searchParams.get('format')
    
    const wantsPrometheus = accept?.includes('text/plain') || 
                           format === 'prometheus' || 
                           format === 'prom'

    console.log(`📊 Metrics: Access granted for IP ${clientIP}, format: ${wantsPrometheus ? 'prometheus' : 'json'}`)

    if (wantsPrometheus) {
      // Return Prometheus format
      const prometheusMetrics = metricsCollector.exportPrometheusMetrics()
      
      return new Response(prometheusMetrics, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
    } else {
      // Return JSON format
      const jsonMetrics = metricsCollector.getMetricsJSON()
      
      return NextResponse.json(jsonMetrics, {
        status: 200,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
    }

  } catch (error) {
    console.error("❌ Error in metrics endpoint:", error)
    return NextResponse.json(
      { error: "Internal server error" }, 
      { status: 500 }
    )
  }
}

// POST endpoint for external metrics submission (optional)
export async function POST(request: NextRequest) {
  try {
    // Same security checks
    const authHeader = request.headers.get('authorization')
    const apiKey = request.headers.get('x-api-key')
    
    const providedKey = authHeader?.replace('Bearer ', '') || apiKey
    
    if (!providedKey || providedKey !== METRICS_API_KEY) {
      return NextResponse.json(
        { error: "Unauthorized" }, 
        { status: 401 }
      )
    }

    const clientIP = getClientIP(request)
    const isDevelopment = process.env.NODE_ENV === 'development'
    
    if (!isDevelopment && !isIPAllowed(clientIP)) {
      return NextResponse.json(
        { error: "Forbidden" }, 
        { status: 403 }
      )
    }

    // Accept custom metrics from external sources
    const body = await request.json()
    
    if (body.type === 'increment_counter' && body.name && typeof body.value === 'number') {
      metricsCollector.incrementCounter(body.name, body.value, body.labels)
      return NextResponse.json({ success: true })
    }
    
    if (body.type === 'set_gauge' && body.name && typeof body.value === 'number') {
      metricsCollector.setGauge(body.name, body.value, body.labels)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json(
      { error: "Invalid metric data" }, 
      { status: 400 }
    )

  } catch (error) {
    console.error("❌ Error in metrics POST endpoint:", error)
    return NextResponse.json(
      { error: "Internal server error" }, 
      { status: 500 }
    )
  }
}
