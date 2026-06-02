import {
  FOOTWEAR_TILE_HEIGHT,
  OUTERWEAR_TILE_HEIGHT,
  THREE_ITEM_NO_OUTERWEAR_LAYOUT,
  TOP_TILE_HEIGHT,
  buildHomeTodayLookPreviewLayout,
  buildHomeTodayLookPreviewRows,
  getHomeTodayLookImageFrame,
  homeTodayLookRoleForSlot,
  normalizeHomeTodayLookSlot,
} from "@/src/components/home/homeTodayLookLayout";

describe("Home Today Look layout", () => {
  it("uses a split-column span layout for exactly top, bottom, and footwear without outerwear", () => {
    const layout = buildHomeTodayLookPreviewLayout(["top", "bottom", "shoes"], "regular");

    expect(layout.kind).toBe("splitColumns");
    if (layout.kind !== "splitColumns") throw new Error("Expected split-column layout");

    const leftColumn = layout.columns[0];
    const rightColumn = layout.columns[1];
    expect(leftColumn).toMatchObject({
      key: "top-footwear",
      flex: THREE_ITEM_NO_OUTERWEAR_LAYOUT.leftColumnFlex,
    });
    expect(rightColumn).toMatchObject({
      key: "bottom-span",
      flex: THREE_ITEM_NO_OUTERWEAR_LAYOUT.rightColumnFlex,
    });
    expect(leftColumn?.tiles.map((tile) => tile.slot)).toEqual(["top", "shoes"]);
    expect(rightColumn?.tiles.map((tile) => tile.slot)).toEqual(["bottom"]);

    const topHeight = TOP_TILE_HEIGHT.regular;
    const shoeHeight = FOOTWEAR_TILE_HEIGHT.regular;
    expect(leftColumn?.tiles[0]?.height).toBe(topHeight);
    expect(leftColumn?.tiles[1]?.height).toBe(shoeHeight);
    expect(rightColumn?.tiles[0]?.height).toBe(topHeight + layout.gap + shoeHeight);
    expect(rightColumn?.tiles[0]?.imageFrame).toBe(THREE_ITEM_NO_OUTERWEAR_LAYOUT.pantsImageScale);
  });

  it("uses matching taller top and outerwear cards when outerwear exists", () => {
    const layout = buildHomeTodayLookPreviewLayout(["outerwear", "top", "bottom", "shoes"], "large");

    expect(layout.kind).toBe("rows");
    if (layout.kind !== "rows") throw new Error("Expected standard rows layout");

    expect(layout.rows).toHaveLength(2);
    expect(layout.rows[0]).toMatchObject({
      key: "top-outerwear",
      alignItems: "stretch",
    });
    expect(layout.rows[0]?.tiles.map((tile) => tile.slot)).toEqual(["top", "outerwear"]);
    expect(layout.rows[0]?.tiles[0]?.height).toBe(TOP_TILE_HEIGHT.large);
    expect(layout.rows[0]?.tiles[1]?.height).toBe(OUTERWEAR_TILE_HEIGHT.large);
    expect(layout.rows[0]?.tiles[0]?.height).toBe(layout.rows[0]?.tiles[1]?.height);
    expect(layout.rows[1]?.tiles.find((tile) => tile.slot === "shoes")?.height).toBe(FOOTWEAR_TILE_HEIGHT.large);
  });

  it("leaves the legacy row builder behavior available for non-special cases", () => {
    const rows = buildHomeTodayLookPreviewRows(["top", "bottom", "shoes"], "regular");

    expect(rows[0]?.tiles.map((tile) => tile.slot)).toEqual(["top", "bottom"]);
    expect(rows[1]?.tiles.map((tile) => tile.slot)).toEqual(["shoes"]);
  });

  it("keeps role and image-frame sizing role-aware", () => {
    expect(homeTodayLookRoleForSlot("shoes")).toBe("footwear");
    expect(homeTodayLookRoleForSlot("top")).toBe("top");
    expect(getHomeTodayLookImageFrame("shoes")).toEqual({ width: "92%", height: "68%" });
    expect(getHomeTodayLookImageFrame("bottom")).toEqual({ width: "92%", height: "96%" });
    expect(THREE_ITEM_NO_OUTERWEAR_LAYOUT.pantsImageScale).toEqual({ width: "84%", height: "82%" });
  });

  it("normalizes common clothing words without hardcoding item names", () => {
    expect(normalizeHomeTodayLookSlot("polo shirt")).toBe("top");
    expect(normalizeHomeTodayLookSlot("wide-leg trousers")).toBe("bottom");
    expect(normalizeHomeTodayLookSlot("white sneakers")).toBe("shoes");
    expect(normalizeHomeTodayLookSlot("hoodie")).toBe("outerwear");

    const layout = buildHomeTodayLookPreviewLayout(["polo", "trousers", "sneakers"], "compact");
    expect(layout.kind).toBe("splitColumns");

    const outerwearLayout = buildHomeTodayLookPreviewLayout(["tee", "jeans", "loafers", "jacket"], "compact");
    expect(outerwearLayout.kind).toBe("rows");
  });
});
