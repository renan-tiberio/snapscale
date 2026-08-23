// STUB (RED phase) — permissive placeholder, filled in during the GREEN implementation.
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: { code: string; message: string }
  meta?: { total: number; page: number; limit: number }
}

export function ok<T>(data: T, meta?: ApiResponse<T>['meta']): ApiResponse<T> {
  return { success: true, data, meta }
}

// Intentionally wrong shape for the RED phase: real implementation must flip
// `success` to false and populate `error`.
export function fail(_code: string, _message: string): ApiResponse<never> {
  return { success: true }
}
