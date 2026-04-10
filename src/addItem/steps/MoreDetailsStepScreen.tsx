import React from "react";
import { View } from "react-native";

import {
  AdvancedToggleRow,
  FabricContentRow,
  FabricHeaderRow,
  FitContentRow,
  FitHeaderRow,
  NotesContentRow,
  NotesHeaderRow,
  OccasionContentRow,
  OccasionHeaderRow,
  SeasonContentRow,
  SeasonHeaderRow,
  SizeContentRow,
  SizeHeaderRow,
} from "../sections/AdvancedSections";

export const MoreDetailsStepScreen = React.memo(function MoreDetailsStepScreen({
  controller,
}: {
  controller: any;
}) {
  const { state, derived } = controller;

  return (
    <View style={{ gap: 14 }}>
      <AdvancedToggleRow controller={controller} />
      {derived.showAdvanced ? (
        <>
          <FabricHeaderRow controller={controller} />
          {state.fabricExpanded ? <FabricContentRow controller={controller} /> : null}

          <SizeHeaderRow controller={controller} />
          {state.sizeExpanded ? <SizeContentRow controller={controller} /> : null}

          <OccasionHeaderRow controller={controller} />
          {state.occasionExpanded ? <OccasionContentRow controller={controller} /> : null}

          <SeasonHeaderRow controller={controller} />
          {state.seasonExpanded ? <SeasonContentRow controller={controller} /> : null}

          <FitHeaderRow controller={controller} />
          {state.fitExpanded ? <FitContentRow controller={controller} /> : null}

          <NotesHeaderRow controller={controller} />
          {state.notesExpanded ? <NotesContentRow controller={controller} /> : null}
        </>
      ) : null}
    </View>
  );
});
