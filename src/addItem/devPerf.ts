export function makeDevThrottleLogger(scope: string, intervalMs = 1000) {
  void scope;
  void intervalMs;
  return (_extra?: Record<string, unknown>) => {};
}
