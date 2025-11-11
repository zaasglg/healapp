export interface RetryOptions {
  retries?: number
  factor?: number
  minDelay?: number
  maxDelay?: number
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const retryAsync = async <T>(
  fn: (attempt: number) => Promise<T>,
  { retries = 2, factor = 2, minDelay = 400, maxDelay = 4000 }: RetryOptions = {}
): Promise<T> => {
  let attempt = 0
  let lastError: unknown

  while (attempt <= retries) {
    try {
      return await fn(attempt)
    } catch (error) {
      lastError = error
      if (attempt === retries) {
        break
      }
      const delay = Math.min(maxDelay, minDelay * Math.pow(factor, attempt))
      await sleep(delay)
      attempt += 1
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Operation failed after retries')
}
