import React from "react";
import { makeDevThrottleLogger } from "./devPerf";
import { SectionTitle } from "./ui/SectionTitle";
import { PhotoStep } from "./sections/PhotoStep";
import { BasicsStep } from "./sections/BasicsStep";
import { DetailsStep } from "./sections/DetailsStep";
import {
  AdvancedToggleRow,
  FabricHeaderRow,
  FabricContentRow,
  SizeHeaderRow,
  SizeContentRow,
  OccasionHeaderRow,
  OccasionContentRow,
  SeasonHeaderRow,
  SeasonContentRow,
  FitHeaderRow,
  FitContentRow,
  NotesHeaderRow,
  NotesContentRow,
} from "./sections/AdvancedSections";

const logRenderAddRow = makeDevThrottleLogger("renderAddRow");

export function renderAddRow({
  rowKey,
  controller,
}: {
  rowKey: string;
  controller: any;
}) {
  if (__DEV__) {
    logRenderAddRow({ rowKey });
  }
  switch (rowKey) {
    case "photo":
      return <PhotoStep controller={controller} />;
    case "basics":
      return <BasicsStep controller={controller} />;
    case "details":
      return <DetailsStep controller={controller} />;
    case "advanced-toggle":
      return <AdvancedToggleRow controller={controller} />;
    case "fabric-header":
      return <FabricHeaderRow controller={controller} />;
    case "fabric-content":
      return <FabricContentRow controller={controller} />;
    case "size-header":
      return <SizeHeaderRow controller={controller} />;
    case "size-content":
      return <SizeContentRow controller={controller} />;
    case "occasion-header":
      return <OccasionHeaderRow controller={controller} />;
    case "occasion-content":
      return <OccasionContentRow controller={controller} />;
    case "season-header":
      return <SeasonHeaderRow controller={controller} />;
    case "season-content":
      return <SeasonContentRow controller={controller} />;
    case "fit-header":
      return <FitHeaderRow controller={controller} />;
    case "fit-content":
      return <FitContentRow controller={controller} />;
    case "notes-header":
      return <NotesHeaderRow controller={controller} />;
    case "notes-content":
      return <NotesContentRow controller={controller} />;
    case "advanced-header":
      return (
        <SectionTitle
          title="Advanced"
          subtitle="Optional details you can fill in later."
        />
      );
    default:
      return null;
  }
}
