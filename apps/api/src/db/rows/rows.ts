/**
 * `returning()` and `select()` hand back arrays; `noUncheckedIndexedAccess`
 * makes `rows[0]` an `T | undefined` everywhere. These two helpers turn that
 * into one honest decision per query instead of a non-null assertion.
 */

/** The single row a lookup may or may not find. */
export const firstRow = <T>({ rows }: { rows: readonly T[] }): T | undefined => rows[0]

/**
 * The single row a write must produce. An empty result means the statement
 * silently did nothing — a bug, not a "not found", so it throws instead of
 * handing back `undefined` for a caller to ignore.
 */
export const requireRow = <T>({ rows, context }: { rows: readonly T[]; context: string }): T => {
  const row = rows[0]

  if (row === undefined) {
    throw new Error(`${context}: expected the statement to return one row, got ${rows.length}`)
  }

  return row
}
