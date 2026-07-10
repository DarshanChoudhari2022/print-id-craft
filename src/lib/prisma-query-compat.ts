export async function runWithMissingColumnFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  try {
    return await primary()
  } catch (error) {
    if ((error as { code?: string } | null)?.code !== "P2022") throw error
    return fallback()
  }
}
