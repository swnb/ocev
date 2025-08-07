function waitForMs(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

function waitForSec(sec: number): Promise<void> {
  return waitForMs(sec * 1000)
}

export { waitForMs, waitForSec }
