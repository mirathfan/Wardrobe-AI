import { normalizeClosetItemMetadata } from "../metadata";
import {
  blackLeatherLoafers,
  blackOversizedNikeHoodie,
  whiteOxfordShirt,
} from "./fixtures";

describe("normalizeClosetItemMetadata", () => {
  it("normalizes a black oversized Nike hoodie as a casual warm top", () => {
    const metadata = normalizeClosetItemMetadata(blackOversizedNikeHoodie);

    expect(metadata.category).toBe("top");
    expect(metadata.subcategory).toBe("hoodie");
    expect(metadata.brand).toBe("Nike");
    expect(metadata.colors).toEqual(["black"]);
    expect(metadata.fit).toBe("oversized");
    expect(metadata.warmth).toBeGreaterThanOrEqual(4);
    expect(metadata.formality).toBe(1);
    expect(metadata.styleTags).toEqual(expect.arrayContaining(["casual", "minimal", "streetwear"]));
    expect(metadata.occasionTags).toEqual(expect.arrayContaining(["casual", "class", "errands"]));
    expect(metadata.source).toBe("deterministic");
  });

  it("normalizes a white Oxford shirt as smart casual top metadata", () => {
    const metadata = normalizeClosetItemMetadata(whiteOxfordShirt);

    expect(metadata.category).toBe("top");
    expect(metadata.subcategory).toBe("shirt");
    expect(metadata.colors).toEqual(["white"]);
    expect(metadata.fit).toBe("regular");
    expect(metadata.formality).toBeGreaterThanOrEqual(3);
    expect(metadata.styleTags).toEqual(expect.arrayContaining(["classic", "smart casual"]));
    expect(metadata.occasionTags).toEqual(expect.arrayContaining(["office", "smart casual"]));
  });

  it("normalizes black leather loafers as formal smart casual shoes", () => {
    const metadata = normalizeClosetItemMetadata(blackLeatherLoafers);

    expect(metadata.category).toBe("shoes");
    expect(metadata.subcategory).toBe("loafer");
    expect(metadata.colors).toEqual(["black"]);
    expect(metadata.material).toBe("leather");
    expect(metadata.formality).toBeGreaterThanOrEqual(4);
    expect(metadata.styleTags).toEqual(expect.arrayContaining(["classic", "formal", "smart casual"]));
    expect(metadata.occasionTags).toEqual(expect.arrayContaining(["dinner", "formal", "smart casual"]));
  });

  it("normalizes DRESS PENNY LOAFERS as shoes instead of one_piece", () => {
    const metadata = normalizeClosetItemMetadata({
      name: "DRESS PENNY LOAFERS",
      category: "Shoes",
      colors: ["black"],
      material: "leather",
    });

    expect(metadata.category).toBe("shoes");
    expect(metadata.subcategory).toBe("loafer");
    expect(metadata.formality).toBeGreaterThanOrEqual(4);
  });

  it("normalizes linen and resort shirts as tops instead of one_piece", () => {
    expect(normalizeClosetItemMetadata({
      name: "Light beige Relaxed Fit Linen-blend resort shirt",
      category: "one_piece",
      colors: ["light beige"],
    }).category).toBe("top");

    expect(normalizeClosetItemMetadata({
      name: "Light blue/Striped Relaxed Fit Linen-blend shirt",
      category: "one_piece",
      colors: ["light blue", "white"],
    }).category).toBe("top");
  });

  it("keeps short-sleeved utility shirts available as tops", () => {
    const metadata = normalizeClosetItemMetadata({
      name: "White/Moto Garage Relaxed Fit Short-sleeved utility shirt",
      category: "one_piece",
      colors: ["white"],
    });

    expect(metadata.category).toBe("top");
  });

  it("keeps true jackets outerwear and dresses/jumpsuits/rompers one_piece", () => {
    expect(normalizeClosetItemMetadata({
      name: "Black Coated racer jacket",
      category: "outerwear",
    }).category).toBe("outerwear");
    expect(normalizeClosetItemMetadata({ name: "Black slip dress", category: "one_piece" }).category).toBe("one_piece");
    expect(normalizeClosetItemMetadata({ name: "Tailored jumpsuit", category: "one_piece" }).category).toBe("one_piece");
    expect(normalizeClosetItemMetadata({ name: "Linen romper", category: "one_piece" }).category).toBe("one_piece");
  });

  it("normalizes Air Force 1 as sneaker shoes", () => {
    const metadata = normalizeClosetItemMetadata({
      name: "Nike Air Force 1",
      brand: "Nike",
      category: "nike shoes",
      colors: ["white"],
    });

    expect(metadata.category).toBe("shoes");
    expect(metadata.subcategory).toBe("sneaker");
    expect(metadata.formality).toBe(2);
  });

  it("normalizes ReactX Rejuven8 as shoes with sandal subcategory", () => {
    const metadata = normalizeClosetItemMetadata({
      name: "Nike ReactX Rejuven8",
      brand: "Nike",
      category: "footwear",
      colors: ["black"],
    });

    expect(metadata.category).toBe("shoes");
    expect(metadata.subcategory).toBe("sandal");
  });

  it("scores office-ready and casual pieces on the updated formality scale", () => {
    expect(normalizeClosetItemMetadata({ name: "Straight trousers", category: "bottom" }).formality).toBe(3);
    expect(normalizeClosetItemMetadata({ name: "Black tank top", category: "top" }).formality).toBe(1);
    expect(normalizeClosetItemMetadata({ name: "Loud graphic tee", category: "top" }).formality).toBe(1);
    expect(normalizeClosetItemMetadata({
      name: "Clean minimal leather sneakers",
      category: "footwear",
    }).formality).toBeGreaterThanOrEqual(3);
  });
});
