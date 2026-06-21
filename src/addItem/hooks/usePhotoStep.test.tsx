import React from "react";
import { Image as RNImage } from "react-native";
import { act, render, waitFor } from "@testing-library/react-native";

import { usePhotoStep } from "./usePhotoStep";
import { runProductPolishForLocalImage } from "../../lib/productPolish";

const mockRunProductPolishForLocalImage = runProductPolishForLocalImage as jest.Mock;

let mockEarlyAccessState = {
  loading: false,
  featureKey: "aiPolish" as const,
  betaRole: "power" as const,
  enabled: true,
  allowed: true,
  periodKey: "2026-06",
  limit: 3,
  used: 0,
  remaining: 3,
};

jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file://cache/",
  documentDirectory: "file://documents/",
  getInfoAsync: jest.fn(async () => ({ exists: true, size: 1234 })),
  downloadAsync: jest.fn(async (_url: string, destination: string) => ({
    uri: destination,
    status: 200,
  })),
}));

jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  manipulateAsync: jest.fn(async (uri: string) => ({ uri, width: 100, height: 100 })),
}));

jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [
      {
        uri: "file://original.jpg",
        width: 100,
        height: 100,
        fileSize: 1000,
        fileName: "original.jpg",
        assetId: "asset-1",
      },
    ],
  })),
}));

jest.mock("firebase/firestore", () => ({
  doc: jest.fn(),
  updateDoc: jest.fn(),
}));

jest.mock("../../bg/removeBackground", () => ({
  isBackgroundRemovalAvailable: jest.fn(() => true),
  removeBackground: jest.fn(async (inputUri: string) => ({
    uri: inputUri.includes("polished") ? "file://polished-cutout.png" : "file://cleaned.png",
    hasTransparency: true,
    transparentPixelRatio: 0.5,
    maskUri: "file://mask.png",
    contentBounds: { x: 5, y: 5, width: 90, height: 90 },
    width: 100,
    height: 100,
  })),
}));

jest.mock("../../lib/cutoutNormalize", () => ({
  normalizeCutoutImage: jest.fn(async ({ cutoutUri }: { cutoutUri: string }) => ({
    uri: cutoutUri.includes("polished") ? "file://polished-preview.png" : "file://preview.png",
  })),
}));

jest.mock("../../lib/detectBrandLogo", () => ({
  detectBrandLogo: jest.fn(async () => null),
}));

jest.mock("../../lib/earlyAccess", () => ({
  useEarlyAccessFeature: jest.fn(() => mockEarlyAccessState),
}));

jest.mock("../../lib/firebase", () => ({
  db: {},
}));

jest.mock("../../lib/photoPipelineLogger", () => ({
  createPhotoPipelineTraceId: jest.fn(() => "trace-1"),
  formatPhotoPipelineSummaryLine: jest.fn(() => "summary"),
  logPhotoPipeline: jest.fn(({ sink, traceId, step, status, data }) => {
    sink?.({ traceId, step, status, data, at: 0 });
  }),
  photoPipelineDuration: jest.fn(() => 0),
  photoPipelineNow: jest.fn(() => 0),
  safeErrorData: jest.fn((error: unknown) => ({
    message: error instanceof Error ? error.message : String(error ?? ""),
  })),
  safeUriType: jest.fn((uri: string | null | undefined) =>
    String(uri ?? "").startsWith("file://") ? "file" : "missing",
  ),
  summarizeImageQuality: jest.fn((quality) => quality ?? null),
}));

jest.mock("../../lib/productPolish", () => ({
  runProductPolishForLocalImage: jest.fn(),
}));

jest.mock("../../lib/uploadImage", () => ({
  uploadItemPhoto: jest.fn(),
}));

jest.mock("../../lib/visualNormalization", () => ({
  analyzeCutoutVisualNormalization: jest.fn(() => ({
    visualFillRatio: 0.8,
    anchor: "center",
  })),
}));

function quality() {
  return {
    aestheticScore: 0.9,
    lightingQuality: 0.9,
    clutterLevel: 0,
    wrinkleLevel: 0,
    cropQuality: 0.9,
    visibilityCompleteness: 0.9,
    humanVisible: false,
    hangerVisible: false,
    surfaceVisible: false,
    needsRefinement: true,
    refinementReason: ["test"],
  };
}

function polishResult() {
  return {
    ok: true,
    imageQuality: quality(),
    refinementApplied: true,
    refinedImageUrl: "https://example.com/polished.jpg",
    refinedStoragePath: "users/u/productPolish/refined/polished.jpg",
    modelUsed: "test-model",
    warnings: [],
    sourceImageUrl: "https://example.com/source.jpg",
    sourceStoragePath: "users/u/productPolish/sources/source.jpg",
    refinedLocalUri: "file://polished.jpg",
  };
}

function createHarness() {
  let latest: ReturnType<typeof usePhotoStep> | null = null;
  const extractionRef = {
    current: {
      state: {
        draftItemId: null,
        draftPhotoHash: null,
      },
      actions: {
        prepareForNewPhoto: jest.fn(),
        setIngestionStatus: jest.fn(),
        setAutofillRunningState: jest.fn(),
      },
    },
  };
  const draft = {
    state: {
      name: "",
      brand: "",
      pattern: "",
      material: "",
      selectedColors: [],
      graphicText: "",
      category: null,
      subCategory: null,
    },
    derived: {
      selectedCategory: null,
    },
  };

  function Harness() {
    latest = usePhotoStep({
      uid: "user-1",
      isEdit: false,
      draft,
      extractionRef,
      beginAsyncRequest: () => ({ sessionId: "session-1", requestId: 1 }),
    });
    return null;
  }

  render(<Harness />);

  return {
    get latest() {
      if (!latest) throw new Error("Hook did not render.");
      return latest;
    },
  };
}

async function pickPhoto(harness: ReturnType<typeof createHarness>) {
  await act(async () => {
    await harness.latest.actions.pickPhoto("library");
  });
  await waitFor(() => {
    expect(harness.latest.state.pendingNormalizedPreviewUri).toBe("file://preview.png");
  });
}

describe("usePhotoStep AI Polish flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEarlyAccessState = {
      loading: false,
      featureKey: "aiPolish",
      betaRole: "power",
      enabled: true,
      allowed: true,
      periodKey: "2026-06",
      limit: 3,
      used: 0,
      remaining: 3,
    };
    jest.spyOn(RNImage, "getSize").mockImplementation(
      (_uri: string, success: (width: number, height: number) => void) => {
        success(100, 100);
      },
    );
    jest.spyOn(console, "warn").mockImplementation(() => {});
    mockRunProductPolishForLocalImage.mockResolvedValue(polishResult());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("does not call product polish automatically during photo ingestion", async () => {
    const harness = createHarness();

    await pickPhoto(harness);

    expect(mockRunProductPolishForLocalImage).not.toHaveBeenCalled();
    expect(harness.latest.state.pendingActiveImageVariant).toBe("original");
    expect(harness.latest.state.pendingRefinedPhotoUri).toBeNull();
  });

  it("calls product polish only after the explicit polish action", async () => {
    const harness = createHarness();
    await pickPhoto(harness);

    await act(async () => {
      await harness.latest.actions.polishProductPhoto();
    });

    expect(mockRunProductPolishForLocalImage).toHaveBeenCalledTimes(1);
    expect(mockRunProductPolishForLocalImage).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: "user-1",
        localUri: "file://original.jpg",
        photoHash: "1000-100x100-original.jpg-asset-1",
      }),
    );
    await waitFor(() => {
      expect(harness.latest.state.pendingActiveImageVariant).toBe("polished");
    });
  });

  it("keeps the original cleaned preview when polish fails", async () => {
    const harness = createHarness();
    await pickPhoto(harness);
    mockRunProductPolishForLocalImage.mockRejectedValueOnce(new Error("polish failed"));

    await act(async () => {
      await harness.latest.actions.polishProductPhoto();
    });

    expect(harness.latest.state.pendingNormalizedPreviewUri).toBe("file://preview.png");
    expect(harness.latest.state.pendingActiveImageVariant).toBe("original");
    expect(harness.latest.state.productPolishError).toBe(
      "Polish didn’t complete. Your original preview is still saved.",
    );
  });

  it("reuses an existing polished result without calling polish again", async () => {
    const harness = createHarness();
    await pickPhoto(harness);

    await act(async () => {
      await harness.latest.actions.polishProductPhoto();
    });
    await waitFor(() => {
      expect(harness.latest.state.pendingRefinedPhotoUri).toBe("file://polished.jpg");
    });

    await act(async () => {
      await harness.latest.actions.polishProductPhoto();
    });

    expect(mockRunProductPolishForLocalImage).toHaveBeenCalledTimes(1);
    expect(harness.latest.state.pendingActiveImageVariant).toBe("polished");
  });
});
