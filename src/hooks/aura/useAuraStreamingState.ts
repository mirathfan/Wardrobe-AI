import React, { useRef } from "react";

import { runHaptic } from "@/src/lib/haptics";

export function useAuraStreamingState() {
  const streamAbortControllerRef = useRef<AbortController | null>(null);
  const stopStreamingRequestedRef = useRef(false);

  const handleStopGenerating = React.useCallback(() => {
    stopStreamingRequestedRef.current = true;
    streamAbortControllerRef.current?.abort();
    void runHaptic("selection");
  }, []);

  return {
    handleStopGenerating,
    stopStreamingRequestedRef,
    streamAbortControllerRef,
  };
}
