export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  if (timeoutMs <= 0)
    return promise

  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(errorMessage)),
        timeoutMs,
      )
    }),
  ])
}
