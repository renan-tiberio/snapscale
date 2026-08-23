export interface HealthStatus {
  status: 'ok'
}

/**
 * Pure liveness check — no external dependencies today. Extend with
 * DB/queue pings once those services land (phase 3+); keep the return type
 * an `HealthStatus` union so callers can branch on the field, not string-match.
 */
export function getHealthStatus(): HealthStatus {
  return { status: 'ok' }
}
