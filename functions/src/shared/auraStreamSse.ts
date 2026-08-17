export type AuraStreamWriter = {
  setHeader?: (name: string, value: string) => void;
  flushHeaders?: () => void;
  write: (chunk: string) => void;
  flush?: () => void;
};

export function setupAuraStreamResponse(res: AuraStreamWriter) {
  res.setHeader?.("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader?.("Cache-Control", "no-cache, no-transform");
  res.setHeader?.("Connection", "keep-alive");
  res.setHeader?.("X-Accel-Buffering", "no");
  res.setHeader?.("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.flushHeaders?.();
}

export function writeEvent(
  res: AuraStreamWriter,
  payload: Record<string, unknown>
) {
  res.write(`${JSON.stringify(payload)}\n`);
  res.flush?.();
}

export function writeStatus(res: AuraStreamWriter, status: string) {
  writeEvent(res, {
    type: "status",
    status,
  });
}

export function writeTextDelta(res: AuraStreamWriter, delta: string) {
  writeEvent(res, {
    type: "delta",
    delta,
  });
}

export function writeFinal(res: AuraStreamWriter, data: unknown) {
  writeEvent(res, {
    type: "final",
    data,
  });
}

export function writeError(res: AuraStreamWriter, error: string) {
  writeEvent(res, {
    type: "error",
    error,
  });
}
