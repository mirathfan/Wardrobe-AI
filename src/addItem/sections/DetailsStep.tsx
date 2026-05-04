import React from "react";

import { AddItemDetailsPanel } from "../components/AddItemDetailsPanel";
import { makeDevThrottleLogger } from "../devPerf";

export const DetailsStep = React.memo(function DetailsStep({ controller }: { controller: any }) {
  const { state } = controller;
  const logRender = React.useMemo(() => makeDevThrottleLogger("DetailsStep"), []);

  logRender({
    aiStatus: state.aiStatus,
    category: state.category,
    colors: state.selectedColors.length,
  });

  return <AddItemDetailsPanel controller={controller} />;
});
