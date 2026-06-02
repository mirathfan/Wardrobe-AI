import {
  buildStyleMemoryRetrieveRequest,
  nextStyleMemoryQueryState,
  styleMemoryQuickTestState,
  styleMemoryRetrieveRequestPreview,
  type StyleMemoryDebugState,
} from "./styleMemoryDebugRequest";

const staleOfficeState: StyleMemoryDebugState = {
  query: "office outfit",
  occasion: "office",
  formality: "smart_casual",
  autoInferOccasion: true,
  respectInputOccasion: true,
};

describe("style memory debug request", () => {
  it("quick test Streetwear clears occasion and formality", () => {
    expect(styleMemoryQuickTestState("Streetwear outfit")).toEqual({
      query: "Streetwear outfit",
      occasion: "",
      formality: "",
      autoInferOccasion: true,
      respectInputOccasion: false,
    });
  });

  it("quick test Office clears stale occasion and formality", () => {
    expect(styleMemoryQuickTestState("office outfit with black shoes")).toEqual({
      query: "office outfit with black shoes",
      occasion: "",
      formality: "",
      autoInferOccasion: true,
      respectInputOccasion: false,
    });
  });

  it("editing query with auto infer on clears stale occasion/formality", () => {
    expect(nextStyleMemoryQueryState(staleOfficeState, "Streetwear outfit")).toMatchObject({
      query: "Streetwear outfit",
      occasion: "",
      formality: "",
      autoInferOccasion: true,
      respectInputOccasion: true,
    });
  });

  it("auto infer on does not send occasion", () => {
    expect(buildStyleMemoryRetrieveRequest({
      ...staleOfficeState,
      query: "Streetwear outfit",
    })).toEqual({
      query: "Streetwear outfit",
      formality: "smart_casual",
      limit: 10,
      includeDiagnostics: true,
      respectInputOccasion: false,
    });
  });

  it("auto infer off can send manual occasion", () => {
    expect(buildStyleMemoryRetrieveRequest({
      query: "Streetwear outfit",
      occasion: "office",
      formality: "",
      autoInferOccasion: false,
      respectInputOccasion: true,
    })).toEqual({
      query: "Streetwear outfit",
      occasion: "office",
      limit: 10,
      includeDiagnostics: true,
      respectInputOccasion: true,
    });
  });

  it("request preview preserves undefined occasion/formality labels", () => {
    expect(styleMemoryRetrieveRequestPreview(buildStyleMemoryRetrieveRequest(
      styleMemoryQuickTestState("Date night outfit"),
    ))).toEqual({
      query: "Date night outfit",
      occasion: "undefined",
      formality: "undefined",
      respectInputOccasion: false,
    });
  });
});
