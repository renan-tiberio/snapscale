export type HealthStatus = {
  readonly status: 'ok'
}

/** Liveness only. The field is a literal union so callers branch on it instead of string-matching. */
export const getHealthStatus = (): HealthStatus => ({ status: 'ok' })
