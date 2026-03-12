export function makeDevThrottleLogger(scope: string, intervalMs = 1000) {
  let lastLog = 0;
  let count = 0;
  return (extra?: Record<string, unknown>) => {
    if (!__DEV__) return;
    count += 1;
    const now = Date.now();
    if (now - lastLog < intervalMs) return;
    lastLog = now;
    console.log(`[Perf] ${scope} renders=${count}`, extra ?? {});
  };
}
