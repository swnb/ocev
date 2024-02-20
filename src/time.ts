const getCurrentTimeMs =
  typeof performance !== 'object' || typeof performance.now !== 'function'
    ? () => Date.now()
    : () => performance.now()

export { getCurrentTimeMs }
