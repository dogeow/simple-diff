export function wrapHandler<T>(fn: () => Promise<T>): Promise<{ success: boolean; data?: T; error?: string }> {
  return fn()
    .then((data) => ({ success: true as const, data }))
    .catch((err: unknown) => ({
      success: false as const,
      error: err instanceof Error ? err.message : String(err),
    }))
}
