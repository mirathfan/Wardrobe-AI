import { doc, getDoc } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createStyles } from "./styles";
import {
  CATEGORIES,
  CURRENCIES,
  FIT_OPTIONS,
  LEG_SHAPE_OPTIONS,
  MATERIAL_OPTIONS,
  OCCASION_OPTIONS,
  PATTERN_OPTIONS,
  RISE_OPTIONS,
  SEASON_OPTIONS,
  SIZE_OPTIONS,
  DEFAULT_COLORS,
  makeCreateSessionId,
  norm,
  normColor,
} from "./controllerShared";
import { useItemDraft } from "./hooks/useItemDraft";
import { useItemExtraction } from "./hooks/useItemExtraction";
import { usePhotoStep } from "./hooks/usePhotoStep";
import { useAuth } from "../hooks/useAuth";
import { useAppTheme } from "../hooks/useAppTheme";
import { db } from "../lib/firebase";
import { getDefaultSizeForSelection, loadUserProfilePreferences } from "../lib/userProfile";
import { SUB_CATEGORIES } from "../shared/wardrobeTaxonomy";
import type { UserProfilePreferences } from "../types/UserProfilePreferences";

export function useAddItemController({
  editItemId,
}: {
  editItemId: string | null;
}) {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const uid = user?.uid ?? null;
  const isEdit = !!editItemId;

  const [createSessionId, setCreateSessionId] = useState(() => makeCreateSessionId());
  const [profilePreferences, setProfilePreferences] = useState<UserProfilePreferences | null>(null);
  const photoRef = useRef<any>(null);
  const extractionRef = useRef<any>(null);
  const resetCreateFlowRef = useRef<any>(null);
  const autoAppliedSizeRef = useRef("");
  const prevEditItemIdRef = useRef<string | null>(null);
  const controllerRenderMetricsRef = useRef({
    lastLogAt: 0,
    renders: 0,
    lastDurationMs: 0,
  });
  const renderStartMs =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

  const createSessionRef = useRef({
    sessionId: makeCreateSessionId(),
    requestId: 0,
    draftId: null as string | null,
    unsub: null as (() => void) | null,
  });

  if (createSessionRef.current.sessionId !== createSessionId) {
    createSessionRef.current.sessionId = createSessionId;
  }

  const beginAsyncRequest = useCallback(() => {
    createSessionRef.current.requestId += 1;
    return {
      sessionId: createSessionRef.current.sessionId,
      requestId: createSessionRef.current.requestId,
    };
  }, []);

  const isActiveRequest = useCallback(
    (token: { sessionId: string; requestId: number }) =>
      createSessionRef.current.sessionId === token.sessionId &&
      createSessionRef.current.requestId === token.requestId,
    []
  );

  useEffect(() => {
    let cancelled = false;
    if (!uid) {
      setProfilePreferences(null);
      return;
    }
    void loadUserProfilePreferences(uid).then((profile) => {
      if (!cancelled) setProfilePreferences(profile);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const draft = useItemDraft({
    uid,
    editItemId,
    isEdit,
    photoRef,
    extractionRef,
    resetCreateFlowRef,
  });

  const photo = usePhotoStep({
    uid,
    isEdit,
    draft,
    extractionRef,
    beginAsyncRequest,
  });
  photoRef.current = photo;

  const extraction = useItemExtraction({
    uid,
    isEdit,
    draft,
    photo,
    beginAsyncRequest,
    isActiveRequest,
    createSessionRef,
  });
  extractionRef.current = extraction;

  const hasActiveCreateState = useMemo(() => {
    return Boolean(
      extraction.state.draftItemId ||
        createSessionRef.current.draftId ||
        photo.state.originalPickedPhotoUri ||
        photo.state.pendingPhotoUri ||
        photo.state.pendingCleanedPhotoUri ||
        photo.state.cleanedPhotoUrl ||
        photo.state.serverCleanedUrl ||
        photo.state.photoUrl ||
        photo.state.photoUri ||
        photo.state.refiningCutout ||
        draft.state.loading ||
        photo.state.uploadingPhoto
    );
  }, [
    draft.state.loading,
    extraction.state.draftItemId,
    photo.state.cleanedPhotoUrl,
    photo.state.originalPickedPhotoUri,
    photo.state.pendingCleanedPhotoUri,
    photo.state.pendingPhotoUri,
    photo.state.photoUri,
    photo.state.photoUrl,
    photo.state.refiningCutout,
    photo.state.serverCleanedUrl,
    photo.state.uploadingPhoto,
  ]);

  const profileDefaultSize = useMemo(
    () =>
      getDefaultSizeForSelection(
        profilePreferences,
        draft.state.category ?? draft.derived.selectedCategory,
        draft.state.subCategory,
      ),
    [
      draft.derived.selectedCategory,
      draft.state.category,
      draft.state.subCategory,
      profilePreferences,
    ],
  );

  useEffect(() => {
    if (isEdit) return;
    if (draft.refs.userEditedKeysRef.current.has("size")) return;
    const currentSize = norm(draft.state.size);
    const nextDefault = norm(profileDefaultSize);
    const autoAppliedSize = norm(autoAppliedSizeRef.current);

    if (!nextDefault) {
      if (currentSize && autoAppliedSize && currentSize === autoAppliedSize) {
        draft.actions.setSize("");
        autoAppliedSizeRef.current = "";
      }
      return;
    }

    if (!currentSize) {
      draft.actions.setSize(nextDefault);
      autoAppliedSizeRef.current = nextDefault;
      return;
    }

    if (autoAppliedSize && currentSize === autoAppliedSize && currentSize !== nextDefault) {
      draft.actions.setSize(nextDefault);
      autoAppliedSizeRef.current = nextDefault;
    }
  }, [
    draft.actions,
    draft.refs.userEditedKeysRef,
    draft.state.size,
    isEdit,
    profileDefaultSize,
  ]);

  const resetCreateFlow = useCallback(
    async (
      reason: string,
      options?: {
        deleteActiveDraft?: boolean;
      }
    ) => {
      if (isEdit) return;
      if (__DEV__) {
        console.log("[AddItemLifecycle] resetCreateFlow:start", {
          reason,
          deleteActiveDraft: options?.deleteActiveDraft === true,
          draftId: createSessionRef.current.draftId ?? extraction.state.draftItemId ?? null,
        });
      }
      void reason;
      const previousDraftId = createSessionRef.current.draftId ?? extraction.state.draftItemId;
      createSessionRef.current.requestId += 1;
      createSessionRef.current.draftId = null;
      const nextSessionId = makeCreateSessionId();
      createSessionRef.current.sessionId = nextSessionId;
      setCreateSessionId(nextSessionId);
      draft.actions.resetDraftState();
      photo.actions.resetPhotoState();
      extraction.actions.resetExtractionState();
      if (options?.deleteActiveDraft && previousDraftId) {
        await extraction.actions.cleanupDraftDoc(previousDraftId);
      }
      if (__DEV__) {
        console.log("[AddItemLifecycle] resetCreateFlow:end", {
          previousDraftId: previousDraftId ?? null,
        });
      }
    },
    [draft.actions, extraction.actions, extraction.state.draftItemId, isEdit, photo.actions]
  );
  resetCreateFlowRef.current = resetCreateFlow;

  const onScreenFocus = useCallback(() => {
    const prevEdit = prevEditItemIdRef.current;
    const nowEdit = editItemId ?? null;
    prevEditItemIdRef.current = nowEdit;

    draft.actions.setShowCurrencyPicker(false);
    draft.actions.setShowAttributeSheet(null);

    if (nowEdit) return;
    if (!hasActiveCreateState && prevEdit && !nowEdit) {
      void resetCreateFlow("focus-create-after-edit");
      return;
    }

    const existingDraftId = createSessionRef.current.draftId ?? extraction.state.draftItemId;
    if (existingDraftId && uid) {
      createSessionRef.current.draftId = existingDraftId;
      const sessionId = createSessionRef.current.sessionId;
      void getDoc(doc(db, "users", uid, "items", existingDraftId)).then((snap) => {
        if (createSessionRef.current.sessionId !== sessionId) return;
        if (!snap.exists()) {
          createSessionRef.current.draftId = null;
          extraction.actions.resetDraftTracking?.();
          return;
        }
        const data = snap.data() as any;
        if (data?.isDraft !== true) {
          // Prevent finalized items from being re-hydrated into add-item as an active draft.
          createSessionRef.current.draftId = null;
          extraction.actions.resetDraftTracking?.();
          return;
        }
        extraction.actions.maybeApplyAutofillFromDraft(data);
        extraction.actions.attachDraftSubscription(
          existingDraftId,
          sessionId,
          extraction.refs.aiRunIdRef.current
        );
      });
    }
  }, [
    draft.actions,
    editItemId,
    extraction.actions,
    extraction.refs.aiRunIdRef,
    extraction.state.draftItemId,
    hasActiveCreateState,
    resetCreateFlow,
    uid,
  ]);

  const onScreenBlur = useCallback(() => {
    createSessionRef.current.requestId += 1;
    draft.actions.setShowCurrencyPicker(false);
    draft.actions.setShowAttributeSheet(null);
    photo.actions.setRefiningCutout(false);
    extraction.actions.stopDraftSubscription();

    const isDirty =
      !!photo.state.pendingPhotoUri ||
      !!draft.state.brand ||
      !!draft.state.name ||
      !!draft.state.category ||
      !!draft.state.subCategory ||
      draft.state.selectedColors.length > 0 ||
      !!draft.state.pattern ||
      !!draft.state.material ||
      !!draft.state.size ||
      !!draft.state.notes;
    if (isDirty && !extraction.refs.isFinalizingRef.current) {
      void draft.actions.syncDraftProgress();
    }
  }, [draft.actions, draft.state, extraction.actions, extraction.refs.isFinalizingRef, photo.actions, photo.state.pendingPhotoUri]);

  const colorOptions = useMemo(() => {
    const set = new Set<string>(DEFAULT_COLORS.map(normColor));
    draft.state.selectedColors.forEach((c: string) => set.add(normColor(c)));
    return Array.from(set);
  }, [draft.state.selectedColors]);

  const warmthLabel = useMemo(() => {
    if (draft.state.warmthPreference == null) return "Auto";
    if (draft.state.warmthPreference < 0.34) return "Light";
    if (draft.state.warmthPreference < 0.67) return "Balanced";
    return "Warm";
  }, [draft.state.warmthPreference]);

  const hasPhoto = useMemo(
    () =>
      !!(
        photo.state.pendingCleanedPhotoUri ||
        photo.state.pendingPhotoUri ||
        photo.state.photoUri ||
        photo.state.cleanedPhotoUrl ||
        photo.state.serverCleanedUrl ||
        photo.state.photoUrl
      ),
    [
      photo.state.cleanedPhotoUrl,
      photo.state.pendingCleanedPhotoUri,
      photo.state.pendingPhotoUri,
      photo.state.photoUri,
      photo.state.photoUrl,
      photo.state.serverCleanedUrl,
    ]
  );

  const aiHasCategory = useMemo(() => !!draft.state.category, [draft.state.category]);
  const aiHasColors = useMemo(
    () => draft.state.selectedColors.length > 0,
    [draft.state.selectedColors.length]
  );
  const refinePreviewUri = useMemo(
    () =>
      photo.state.pendingCleanedPhotoUri ??
      photo.state.cleanedPhotoUrl ??
      photo.state.serverCleanedUrl ??
      null,
    [
      photo.state.cleanedPhotoUrl,
      photo.state.pendingCleanedPhotoUri,
      photo.state.serverCleanedUrl,
    ]
  );
  const fallbackPreviewUri = useMemo(
    () =>
      photo.state.pendingPhotoUri ??
      photo.state.photoUrl ??
      photo.state.photoUri ??
      null,
    [photo.state.pendingPhotoUri, photo.state.photoUri, photo.state.photoUrl]
  );
  const normalizedPreviewUri = useMemo(
    () => photo.state.pendingNormalizedPreviewUri ?? null,
    [photo.state.pendingNormalizedPreviewUri]
  );
  const displayedPreviewUri = refinePreviewUri ?? fallbackPreviewUri;

  const hasCutoutPreview = !!refinePreviewUri;

  const showBasics = hasPhoto;
  const showDetails = hasPhoto;
  const showAdvanced = showDetails && draft.state.advancedExpanded;

  const setupProgress = useMemo(() => {
    const slots = [
      hasPhoto,
      aiHasCategory,
      aiHasColors,
      !!norm(draft.state.brand) || !!norm(draft.state.name),
      !!norm(draft.state.material ?? "") || !!norm(draft.state.pattern ?? ""),
    ];
    const completed = slots.filter(Boolean).length;
    const total = slots.length;
    const ratio = completed / total;
    return {
      completed,
      total,
      ratio,
      percent: Math.round(ratio * 100),
    };
  }, [aiHasCategory, aiHasColors, draft.state.brand, draft.state.material, draft.state.name, draft.state.pattern, hasPhoto]);

  const advancedDone = useMemo(
    () =>
      !!(
        norm(draft.state.pattern || "") ||
        norm(draft.state.material || "") ||
        draft.state.occasionTags.length > 0 ||
        draft.state.seasonTags.length > 0 ||
        draft.state.fit ||
        draft.state.rise ||
        draft.state.legShape ||
        norm(draft.state.size) ||
        norm(draft.state.notes)
      ),
    [draft.state]
  );

  const requiredChecklist = useMemo(
    () => [
      { id: "photo", label: "Photo", done: hasPhoto, rowId: "photo" },
      { id: "category", label: "Category", done: aiHasCategory, rowId: "details" },
      { id: "colors", label: "Color", done: aiHasColors, rowId: "details" },
      { id: "details", label: "Details", done: showDetails, rowId: "details" },
      { id: "advanced", label: "Advanced", done: advancedDone, rowId: "advanced-toggle" },
    ],
    [advancedDone, aiHasCategory, aiHasColors, hasPhoto, showDetails]
  );

  const nextMissing = useMemo(
    () => requiredChecklist.find((item) => !item.done) ?? null,
    [requiredChecklist]
  );

  const aiSuggestions = useMemo(() => {
    const items: { key: string; label: string; onPress: () => void }[] = [];
    const suggestionOccasion = extraction.state.aiOccasionTags[0];
    if (suggestionOccasion && !draft.state.occasionTags.includes(suggestionOccasion)) {
      items.push({
        key: `occasion:${suggestionOccasion}`,
        label: suggestionOccasion.replace(/_/g, " "),
        onPress: () => {
          draft.actions.markUserEdited("occasionTags");
          draft.actions.setOccasionTags((prev: string[]) =>
            prev.includes(suggestionOccasion) ? prev : [...prev, suggestionOccasion]
          );
        },
      });
    }
    const suggestionSeason = extraction.state.aiSeasonTags[0];
    if (suggestionSeason && !draft.state.seasonTags.includes(suggestionSeason)) {
      items.push({
        key: `season:${suggestionSeason}`,
        label: suggestionSeason.replace(/_/g, " "),
        onPress: () => {
          draft.actions.markUserEdited("seasonTags");
          draft.actions.setSeasonTags((prev: string[]) =>
            prev.includes(suggestionSeason) ? prev : [...prev, suggestionSeason]
          );
        },
      });
    }
    if (extraction.state.aiFit && draft.state.fit !== extraction.state.aiFit) {
      items.push({
        key: `fit:${extraction.state.aiFit}`,
        label: `${extraction.state.aiFit} fit`,
        onPress: () => {
          draft.actions.markUserEdited("fit");
          draft.actions.setFit(extraction.state.aiFit);
        },
      });
    }
    return items.slice(0, 4);
  }, [draft.actions, draft.state.fit, draft.state.occasionTags, draft.state.seasonTags, extraction.state.aiFit, extraction.state.aiOccasionTags, extraction.state.aiSeasonTags]);

  const aiStatusRows = useMemo(() => {
    if (extraction.state.aiStatus === "error" || extraction.state.ingestionStatus === "failed") {
      return ["⚠️ AI failed — you can fill manually"];
    }
    if (
      extraction.state.aiStatus === "running" ||
      extraction.state.ingestionStatus === "pending" ||
      extraction.state.ingestionStatus === "processing"
    ) {
      return [
        aiHasColors
          ? "✓ Color ready"
          : extraction.state.aiStage === "Color"
            ? "✨ Color…"
            : "✨ Detecting colors...",
        aiHasCategory
          ? "✓ Category ready"
          : extraction.state.aiStage === "Category"
            ? "✨ Category…"
            : "✨ Detecting category...",
        extraction.state.aiPattern || extraction.state.aiMaterial || extraction.state.aiStage === "Details"
          ? "✓ Details ready"
          : "✨ Details…",
      ];
    }
    if (extraction.state.aiStatus === "ready" || extraction.state.ingestionStatus === "done") {
      return [
        aiHasCategory ? "✓ Category detected" : "⚠️ Category missing",
        aiHasColors ? "✓ Colors detected" : "⚠️ Colors missing",
        extraction.state.aiPattern || extraction.state.aiMaterial
          ? "✓ Material/pattern detected"
          : "⚠️ Material/pattern missing",
      ];
    }
    return [];
  }, [aiHasCategory, aiHasColors, extraction.state.aiMaterial, extraction.state.aiPattern, extraction.state.aiStage, extraction.state.aiStatus, extraction.state.ingestionStatus]);

  const aiStatusPill = useMemo(() => {
    if (extraction.state.aiStatus === "error" || extraction.state.ingestionStatus === "failed") {
      return { label: "AI failed — fill manually", tone: "error" as const };
    }
    if (
      extraction.state.aiStatus === "running" ||
      extraction.state.ingestionStatus === "pending" ||
      extraction.state.ingestionStatus === "processing"
    ) {
      return { label: "AI filling details…", tone: "running" as const };
    }
    if (
      (extraction.state.aiStatus === "ready" || extraction.state.ingestionStatus === "done") &&
      aiSuggestions.length > 0
    ) {
      return { label: "AI suggestions ready", tone: "ready" as const };
    }
    if (extraction.state.aiStatus === "ready" || extraction.state.ingestionStatus === "done") {
      return { label: "AI ready", tone: "ready" as const };
    }
    return { label: "AI idle", tone: "idle" as const };
  }, [aiSuggestions.length, extraction.state.aiStatus, extraction.state.ingestionStatus]);

  const canApplyAiSuggestions =
    extraction.state.ingestionStatus === "done" && aiSuggestions.length > 0;

  const touched = {
    categoryTouched: draft.refs.userEditedKeysRef.current.has("category"),
    subCategoryTouched: draft.refs.userEditedKeysRef.current.has("subCategory"),
    colorsTouched: draft.refs.userEditedKeysRef.current.has("colors"),
    brandTouched: draft.refs.userEditedKeysRef.current.has("brand"),
    patternTouched: draft.refs.userEditedKeysRef.current.has("pattern"),
    materialTouched: draft.refs.userEditedKeysRef.current.has("material"),
  };

  const applyAiSuggestions = useCallback(() => {
    aiSuggestions.forEach((suggestion) => suggestion.onPress());
  }, [aiSuggestions]);

  const hasRequiredPhoto = !!photo.derived.previewPhotoUri;
  const canSave = hasRequiredPhoto && !draft.state.loading;
  const ctaStatusText = photo.state.uploadError
    ? "Upload failed. Retry below."
    : photo.state.uploadingPhoto
      ? "Uploading photo…"
      : photo.state.refiningCutout ||
          extraction.state.isAutofillRunning ||
          (extraction.state.draftItemId &&
            extraction.state.ingestionStatus &&
            extraction.state.ingestionStatus !== "done" &&
            extraction.state.ingestionStatus !== "failed")
        ? "AI autofill running…"
        : canSave
          ? "Ready to save"
          : "Add a photo to continue";

  const rowKeys = useMemo(() => {
    const rows: { key: string }[] = [{ key: "photo" }];
    if (showBasics) rows.push({ key: "basics" });
    if (showDetails) {
      rows.push({ key: "details" });
      rows.push({ key: "advanced-toggle" });
    }
    if (showAdvanced) {
      rows.push({ key: "fabric-header" });
      if (draft.state.fabricExpanded) rows.push({ key: "fabric-content" });
      rows.push({ key: "size-header" });
      if (draft.state.sizeExpanded) rows.push({ key: "size-content" });
      rows.push({ key: "occasion-header" });
      if (draft.state.occasionExpanded) rows.push({ key: "occasion-content" });
      rows.push({ key: "season-header" });
      if (draft.state.seasonExpanded) rows.push({ key: "season-content" });
      rows.push({ key: "fit-header" });
      if (draft.state.fitExpanded) rows.push({ key: "fit-content" });
      rows.push({ key: "notes-header" });
      if (draft.state.notesExpanded) rows.push({ key: "notes-content" });
    }
    return rows;
  }, [draft.state.fabricExpanded, draft.state.fitExpanded, draft.state.notesExpanded, draft.state.occasionExpanded, draft.state.seasonExpanded, draft.state.sizeExpanded, showAdvanced, showBasics, showDetails]);

  if (__DEV__) {
    const now =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const metrics = controllerRenderMetricsRef.current;
    metrics.renders += 1;
    metrics.lastDurationMs = now - renderStartMs;
    if (now - metrics.lastLogAt >= 1000) {
      metrics.renders = 0;
      metrics.lastLogAt = now;
    }
  }

  const state = {
    uid,
    editItemId,
    isEdit,
    ...draft.state,
    ...photo.state,
    ...extraction.state,
    createSessionId,
  };

  const derived = {
    CATEGORIES,
    SUB_CATEGORIES,
    OCCASION_OPTIONS,
    SEASON_OPTIONS,
    FIT_OPTIONS,
    RISE_OPTIONS,
    LEG_SHAPE_OPTIONS,
    SIZE_OPTIONS,
    MATERIAL_OPTIONS,
    PATTERN_OPTIONS,
    CURRENCIES,
    previewPhotoUri: displayedPreviewUri,
    normalizedPreviewUri,
    refinePreviewUri: displayedPreviewUri,
    cleanedPreviewUri: refinePreviewUri,
    fallbackPreviewUri,
    hasCutoutPreview,
    maskDebugUri: photo.state.pendingCutoutMaskUri,
    canRefineCutout: photo.derived.canRefineCutout,
    selectedCategory: draft.derived.selectedCategory,
    displayedPattern: draft.state.pattern ?? extraction.state.aiPattern ?? "Auto (AI)",
    displayedMaterial: draft.state.material ?? extraction.state.aiMaterial ?? "Auto (AI)",
    isPatternAuto:
      !draft.refs.userEditedKeysRef.current.has("pattern") && !draft.state.pattern,
    isMaterialAuto:
      !draft.refs.userEditedKeysRef.current.has("material") && !draft.state.material,
    hasActiveCreateState,
    colorOptions,
    warmthLabel,
    hasPhoto,
    aiHasCategory,
    aiHasColors,
    showBasics,
    showDetails,
    showAdvanced,
    setupProgress,
    requiredChecklist,
    nextMissing,
    aiSuggestions,
    aiStatusRows,
    aiStatusPill,
    canApplyAiSuggestions,
    hasRequiredPhoto,
    canSave,
    ctaStatusText,
    rowKeys,
    touched,
    isDirty:
      !!photo.state.pendingPhotoUri ||
      !!draft.state.brand ||
      !!draft.state.name ||
      !!draft.state.category ||
      !!draft.state.subCategory ||
      draft.state.selectedColors.length > 0 ||
      !!draft.state.pattern ||
      !!draft.state.material ||
      !!draft.state.size ||
      !!draft.state.notes,
  };

  const actions = {
    ...draft.actions,
    applyAiSuggestions,
    ...photo.actions,
    ...extraction.actions,
    saveItem: draft.actions.saveItem,
    onScreenFocus,
    onScreenBlur,
    resetCreateFlow,
  };

  return { state, derived, actions, styles };
}
