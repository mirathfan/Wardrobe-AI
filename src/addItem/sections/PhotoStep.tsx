import React from "react";

import { AddItemPhotoPanel } from "../components/AddItemPhotoPanel";
import { makeDevThrottleLogger } from "../devPerf";

export const PhotoStep = React.memo(function PhotoStep({ controller }: { controller: any }) {
  const { state, derived } = controller;
  const logRender = React.useMemo(() => makeDevThrottleLogger("PhotoStep"), []);

  logRender({
    uploading: state.uploadingPhoto,
    aiStatus: state.aiStatus,
    hasPreview: !!derived.previewPhotoUri,
  });

  return <AddItemPhotoPanel controller={controller} />;
});
