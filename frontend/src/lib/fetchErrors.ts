const networkFail =
  /failed to fetch|networkerror|load failed|network request failed|connection refused|err_connection_refused|econnrefused/i

/** True when fetch failed before a response (API down, wrong port, CORS, etc.). */
export function isLikelyNetworkFailure(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return networkFail.test(msg)
}

/** User-visible message when the browser cannot reach the Express API. */
export function friendlyFetchError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (networkFail.test(msg)) {
    return 'Cannot reach the API. Run npm run dev (starts Vite + API on port 4000), or set VITE_API_BASE_URL=http://localhost:4000 if the web app is hosted separately.'
  }
  return msg
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
