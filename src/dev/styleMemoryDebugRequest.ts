export type StyleMemoryDebugState = {
  query: string;
  occasion: string;
  formality: string;
  autoInferOccasion: boolean;
  respectInputOccasion: boolean;
};

export type StyleMemoryRetrieveRequest = {
  query: string;
  occasion?: string;
  formality?: string;
  limit: number;
  includeDiagnostics: boolean;
  respectInputOccasion: boolean;
};

export const DEFAULT_STYLE_MEMORY_DEBUG_STATE: StyleMemoryDebugState = {
  query: "",
  occasion: "",
  formality: "",
  autoInferOccasion: true,
  respectInputOccasion: false,
};

export function nextStyleMemoryQueryState(
  current: StyleMemoryDebugState,
  query: string,
): StyleMemoryDebugState {
  return {
    ...current,
    query,
    occasion: current.autoInferOccasion ? "" : current.occasion,
    formality: current.autoInferOccasion ? "" : current.formality,
  };
}

export function styleMemoryQuickTestState(query: string): StyleMemoryDebugState {
  return {
    query,
    occasion: "",
    formality: "",
    autoInferOccasion: true,
    respectInputOccasion: false,
  };
}

export function buildStyleMemoryRetrieveRequest(
  state: StyleMemoryDebugState,
  fallbackQuery = "",
): StyleMemoryRetrieveRequest | null {
  const query = (state.query || fallbackQuery).trim();
  if (!query) return null;

  const occasion = state.occasion.trim();
  const formality = state.formality.trim();
  const request: StyleMemoryRetrieveRequest = {
    query,
    limit: 10,
    includeDiagnostics: true,
    respectInputOccasion: state.autoInferOccasion ? false : state.respectInputOccasion,
  };

  if (!state.autoInferOccasion && occasion) request.occasion = occasion;
  if (formality) request.formality = formality;
  return request;
}

export function styleMemoryRetrieveRequestPreview(request: StyleMemoryRetrieveRequest | null) {
  return {
    query: request?.query ?? "",
    occasion: request?.occasion ?? "undefined",
    formality: request?.formality ?? "undefined",
    respectInputOccasion: request?.respectInputOccasion ?? false,
  };
}
