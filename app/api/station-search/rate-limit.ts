interface QueuedStationRequest<T> {
  execute: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
  retryCount: number
}

interface StationRateLimiterOptions {
  capacity?: number
  refillRate?: number
  maxConcurrentRequests?: number
  maxRetries?: number
}

function getPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function getPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function getNonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

export function getStationSearchRequestKey(query: string): string {
  return query.trim().toLowerCase()
}

export class StationRateLimitError extends Error {
  readonly retryAfterMs: number

  constructor(retryAfterMs: number = 2000) {
    super('HTTP 429')
    this.name = 'StationRateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}

export class StationRateLimiter {
  private tokens: number
  private lastRefill = Date.now()
  private activeRequests = 0
  private backoffUntil = 0
  private processingTimer: ReturnType<typeof setTimeout> | null = null
  private readonly queue: Array<QueuedStationRequest<unknown>> = []
  private readonly capacity: number
  private readonly refillRate: number
  private readonly maxConcurrentRequests: number
  private readonly maxRetries: number

  constructor(options: StationRateLimiterOptions = {}) {
    this.capacity = options.capacity ?? 5
    this.refillRate = options.refillRate ?? 1
    this.maxConcurrentRequests = options.maxConcurrentRequests ?? 2
    this.maxRetries = options.maxRetries ?? 1
    this.tokens = this.capacity
  }

  addToQueue<T>(execute: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        execute: async () => execute(),
        resolve: value => resolve(value as T),
        reject,
        retryCount: 0,
      })
      this.processQueue()
    })
  }

  private refill(now: number): void {
    const elapsedSeconds = Math.max(0, now - this.lastRefill) / 1000
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillRate)
    this.lastRefill = now
  }

  private scheduleProcessing(delayMs: number): void {
    if (this.processingTimer) {
      clearTimeout(this.processingTimer)
    }

    this.processingTimer = setTimeout(() => {
      this.processingTimer = null
      this.processQueue()
    }, Math.max(0, Math.ceil(delayMs)))
  }

  private processQueue(): void {
    if (this.processingTimer) {
      clearTimeout(this.processingTimer)
      this.processingTimer = null
    }

    const now = Date.now()
    this.refill(now)

    if (this.queue.length === 0 || this.activeRequests >= this.maxConcurrentRequests) {
      return
    }

    if (now < this.backoffUntil) {
      this.scheduleProcessing(this.backoffUntil - now)
      return
    }

    while (
      this.queue.length > 0 &&
      this.activeRequests < this.maxConcurrentRequests &&
      this.tokens >= 1
    ) {
      const request = this.queue.shift()
      if (!request) break

      this.tokens -= 1
      this.activeRequests += 1
      void this.executeRequest(request)
    }

    if (
      this.queue.length > 0 &&
      this.activeRequests < this.maxConcurrentRequests &&
      this.tokens < 1
    ) {
      const waitMs = ((1 - this.tokens) / this.refillRate) * 1000
      this.scheduleProcessing(waitMs)
    }
  }

  private async executeRequest(request: QueuedStationRequest<unknown>): Promise<void> {
    try {
      const result = await request.execute()
      request.resolve(result)
    } catch (error) {
      if (error instanceof StationRateLimitError) {
        this.backoffUntil = Math.max(this.backoffUntil, Date.now() + error.retryAfterMs)

        if (request.retryCount < this.maxRetries) {
          request.retryCount += 1
          this.queue.unshift(request)
        } else {
          request.reject(error)
        }
      } else {
        request.reject(error)
      }
    } finally {
      this.activeRequests -= 1
      this.processQueue()
    }
  }
}

export const stationRateLimiter = new StationRateLimiter({
  capacity: getPositiveNumber(process.env.STATION_RL_BURST_CAPACITY, 5),
  refillRate: getPositiveNumber(process.env.STATION_RL_REFILL_PER_SECOND, 1),
  maxConcurrentRequests: getPositiveInteger(process.env.STATION_RL_MAX_CONCURRENT_REQUESTS, 2),
  maxRetries: getNonNegativeInteger(process.env.STATION_RL_MAX_RETRIES, 1),
})
