import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import { logger as firebaseLogger } from "firebase-functions/v2";

type LogContext = {
  traceId?: string;
  uidHash?: string;
};

const logContext = new AsyncLocalStorage<LogContext>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function withContext(args: unknown[]) {
  const context = logContext.getStore();
  if (!context || (!context.traceId && !context.uidHash)) return args;
  if (args.length >= 2 && isRecord(args[1])) {
    return [args[0], { ...context, ...args[1] }, ...args.slice(2)];
  }
  if (args.length === 1 && typeof args[0] === "string") {
    return [args[0], context];
  }
  return [...args, context];
}

function callWithContext(method: (...args: any[]) => void, args: unknown[]) {
  method(...withContext(args));
}

export const logger = {
  ...firebaseLogger,
  debug: (...args: unknown[]) => callWithContext(firebaseLogger.debug, args),
  info: (...args: unknown[]) => callWithContext(firebaseLogger.info, args),
  log: (...args: unknown[]) => callWithContext(firebaseLogger.log, args),
  warn: (...args: unknown[]) => callWithContext(firebaseLogger.warn, args),
  error: (...args: unknown[]) => callWithContext(firebaseLogger.error, args),
};

export function setLogContext(context: LogContext) {
  const current = logContext.getStore();
  if (current) {
    Object.assign(current, context);
  }
  if (context.uidHash) {
    logger.info("request started", { uidHash: context.uidHash });
  }
}

export function tracedHandler(handler: (...args: any[]) => any) {
  return (...args: any[]) => {
    const traceId = randomUUID().slice(0, 8);
    return logContext.run({ traceId }, () => {
      logger.info("request started");
      return handler(...args);
    });
  };
}
