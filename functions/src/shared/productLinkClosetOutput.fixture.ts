import {
  buildClosetDraftFieldsFromProductExtraction,
  extractAmazonLinkData,
  extractProductImagesFromHtml,
  extractProductMetadataFromHtml,
  type ProductExtraction,
} from "./productLinkExtractor";
import { NIKE_FOOTWEAR_LEFT_PROFILE_REASON } from "./nikeFootwearImageRanking";

type FixtureResult = {
  name: string;
  passed: boolean;
  details?: Record<string, unknown>;
};

function pass(name: string, passed: boolean, details?: Record<string, unknown>): FixtureResult {
  return { name, passed, details };
}

function extractionFromHtml(url: string, html: string, selectedImageReason?: string | null): ProductExtraction {
  const metadata = extractProductMetadataFromHtml(url, html);
  const imageUrls = extractProductImagesFromHtml(url, html);
  return {
    metadata,
    imageUrls,
    selectedImageReason: selectedImageReason ?? metadata.selectedImageReason ?? null,
  };
}

function draftFromHtml(url: string, html: string, selectedImageReason?: string | null) {
  const extraction = extractionFromHtml(url, html, selectedImageReason);
  return {
    extraction,
    draft: buildClosetDraftFieldsFromProductExtraction(extraction, {
      includePriceFields: true,
    }),
  };
}

function corePreviewFields(extraction: ProductExtraction) {
  const draft = buildClosetDraftFieldsFromProductExtraction(extraction, {
    includePriceFields: true,
  });
  return {
    title: draft.name ?? extraction.metadata.title ?? null,
    brand: draft.brand ?? extraction.metadata.brand ?? null,
    category: draft.category ?? extraction.metadata.category ?? null,
    subCategory: draft.subCategory ?? extraction.metadata.subCategory ?? null,
    color: draft.displayColor ?? extraction.metadata.displayColor ?? extraction.metadata.color ?? null,
    priceAmount: draft.priceAmount ?? extraction.metadata.priceAmount ?? null,
    primaryImage: extraction.imageUrls[0] ?? null,
  };
}

function assertPreviewImportConsistency(extraction: ProductExtraction) {
  const preview = corePreviewFields(extraction);
  const draft = buildClosetDraftFieldsFromProductExtraction(extraction, {
    includePriceFields: true,
  });
  return (
    preview.title === (draft.name ?? null) &&
    preview.brand === (draft.brand ?? null) &&
    preview.category === (draft.category ?? null) &&
    preview.subCategory === (draft.subCategory ?? null) &&
    preview.color === (draft.displayColor ?? null) &&
    preview.primaryImage === extraction.imageUrls[0]
  );
}

const nikeShoeHtml = `
  <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Product","name":"Nike Air Force 1 '07 Men's Shoes. Nike.com","brand":{"name":"Nike"},"category":"Men's Shoes","color":"Summit White/Black","image":["https://static.nike.com/a/images/t_PDP_1728_v1/air-force-1-left-profile-product.jpg"],"offers":{"@type":"Offer","price":"115.00","priceCurrency":"USD"}}
  </script>`;

const fearOfGodHtml = `
  <meta property="og:title" content="Fear of God Essentials Hoodie | Fear of God" />
  <script type="application/json">{"product":{"title":"Fear of God Essentials Hoodie","brand":"Fear of God ESSENTIALS","price":11000,"currency":"USD","color":"Dark Heather Grey","images":["https://fearofgod.com/cdn/shop/products/essentials-hoodie-product-main.jpg"],"variants":[{"option1":"M"}]}}</script>`;

const allSaintsHtml = `
  <meta property="og:title" content="AllSaints US: Men's Leather Jacket" />
  <script type="application/json">{"product":{"name":"AllSaints US: Men's Leather Jacket","brand":"AllSaints","category":"Leather Jackets","color":"Black","price":"399.00","currency":"USD","images":["/images/leather-jacket-gallery-main.jpg"]}}</script>`;

const macysHtml = `
  <meta property="og:title" content="Macy's - Women's Nike Club Fleece Hoodie" />
  <script type="application/json">{"product":{"productName":"Women's Nike Club Fleece Hoodie","brand":"Nike","category":"Hoodies","productId":"1234567","salePrice":"45.00","regularPrice":"65.00","currency":"USD","color":"Navy","images":["https://slimages.macysassets.com/is/image/MCY/products/hoodie-main.jpg"]}}</script>`;

const jdSportsHtml = `
  <script type="application/json">{"product":{"name":"adidas Originals Gazelle Shoes - Blue","brand":"adidas","category":"Sneakers","price":"100.00","currency":"USD","color":"Blue","images":["https://media.jdsports.com/i/jdsports/gazelle_product_main.jpg"]}}</script>`;

const footLockerHtml = `
  <script type="application/json">{"product":{"name":"Nike Air Max 90 Men's Shoes","brand":"Nike","category":"Running Shoes","styleId":"CN8490-100","price":"130.00","currency":"USD","color":"White/Black","sizes":["8","9","10"],"images":["https://images.footlocker.com/is/image/EBFL2/CN8490100_product-main.jpg"]}}</script>`;

const stockXHtml = `
  <script type="application/json">{"product":{"title":"Nike Dunk Low Panda","brand":"Nike","category":"Sneakers","colorway":"White Black","styleId":"DD1391-100","image":"https://images.stockx.com/images/Nike-Dunk-Low-Panda-product.jpg"}}</script>`;

const shopifyHtml = `
  <script type="application/json" data-product-json>
    {"product":{"title":"Denim Shirt - Black","vendor":"Shop Brand","productType":"Shirts","price":7800,"compare_at_price":9800,"currency":"USD","images":["//cdn.shop.com/products/denim-product-main-1400.jpg"],"variants":[{"option1":"S"},{"option1":"M"}],"id":12345}}
  </script>`;

const openGraphOnlyHtml = `
  <meta property="og:title" content="Canvas Tote - Natural" />
  <meta property="og:description" content="A sturdy canvas tote." />
  <meta property="og:image" content="/images/tote-pdp-main-1200x1200.jpg" />`;

const amazonHtml = `
  <meta property="og:title" content="Amazon.com: Example Brand Running Shoes - Black/White : Clothing, Shoes & Jewelry" />
  <meta property="og:image" content="https://m.media-amazon.com/images/I/running-shoe-product-main.jpg" />`;

export function runProductLinkClosetOutputFixture() {
  const nike = draftFromHtml("https://www.nike.com/t/air-force-1-07-mens-shoes/CW2288-111", nikeShoeHtml, NIKE_FOOTWEAR_LEFT_PROFILE_REASON);
  const fearOfGod = draftFromHtml("https://fearofgod.com/products/essentials-hoodie", fearOfGodHtml);
  const allSaints = draftFromHtml("https://www.allsaints.com/us/men/leather/leather-jacket", allSaintsHtml);
  const macys = draftFromHtml("https://www.macys.com/shop/product/example?ID=1234567", macysHtml);
  const jdSports = draftFromHtml("https://www.jdsports.com/store/product/adidas-gazelle", jdSportsHtml);
  const footLocker = draftFromHtml("https://www.footlocker.com/product/nike-air-max-90/CN8490100.html", footLockerHtml);
  const stockX = draftFromHtml("https://stockx.com/nike-dunk-low-panda", stockXHtml);
  const shopify = draftFromHtml("https://shop.example.com/products/denim-shirt", shopifyHtml);
  const openGraph = draftFromHtml("https://example.com/products/canvas-tote", openGraphOnlyHtml);
  const amazonExtraction = extractAmazonLinkData(new URL("https://www.amazon.com/dp/B08N5WRWNW"), amazonHtml);
  const amazon: { extraction: ProductExtraction; draft: Record<string, unknown> } = {
    extraction: amazonExtraction,
    draft: buildClosetDraftFieldsFromProductExtraction(amazonExtraction, {
      includePriceFields: true,
    }),
  };

  const consistencyCases = [
    nike.extraction,
    fearOfGod.extraction,
    allSaints.extraction,
    macys.extraction,
    jdSports.extraction,
    footLocker.extraction,
    stockX.extraction,
    amazon.extraction,
    shopify.extraction,
    openGraph.extraction,
  ];

  const results: FixtureResult[] = [
    pass("Nike shoe closet draft", nike.draft.name === "Air Force 1 '07 Men's Shoes" && nike.draft.brand === "Nike" && nike.draft.category === "footwear" && nike.draft.subCategory === "sneaker" && nike.draft.displayColor === "Summit White/Black" && nike.draft.imageSourceReason === NIKE_FOOTWEAR_LEFT_PROFILE_REASON),
    pass("Fear of God closet draft", fearOfGod.draft.name === "Essentials Hoodie" && fearOfGod.draft.brand === "Fear of God ESSENTIALS" && fearOfGod.draft.category === "top" && fearOfGod.draft.subCategory === "hoodie" && fearOfGod.draft.displayColor === "Dark Heather Grey"),
    pass("AllSaints closet draft", allSaints.draft.name === "Men's Leather Jacket" && allSaints.draft.brand === "AllSaints" && allSaints.draft.category === "outerwear" && allSaints.draft.subCategory === "jacket" && allSaints.draft.displayColor === "Black"),
    pass("Macy's branded sale draft", macys.draft.brand === "Nike" && macys.draft.retailer === "Macy's" && macys.draft.category === "top" && macys.draft.subCategory === "hoodie" && macys.draft.retailPrice === 65 && macys.draft.purchasePrice === 45 && macys.draft.salePrice === 45 && macys.draft.currency === "USD"),
    pass("JD Sports sneaker draft", jdSports.draft.brand === "adidas" && jdSports.draft.category === "footwear" && jdSports.draft.subCategory === "sneaker" && jdSports.draft.displayColor === "Blue"),
    pass("Foot Locker sneaker draft", footLocker.draft.brand === "Nike" && footLocker.draft.styleId === "CN8490-100" && footLocker.draft.category === "footwear" && footLocker.draft.availableSizes instanceof Array && footLocker.draft.availableSizes.includes("10")),
    pass("StockX conservative price draft", stockX.draft.brand === "Nike" && stockX.draft.styleId === "DD1391-100" && stockX.draft.category === "footwear" && stockX.draft.priceAmount == null && stockX.extraction.metadata.marketPriceUnavailable === true),
    pass("Amazon conservative draft", amazon.draft.productId === "B08N5WRWNW" && amazon.draft.category === "footwear" && amazon.draft.priceAmount == null && amazon.extraction.metadata.priceUnavailable === true && amazon.extraction.metadata.brand !== "Amazon"),
    pass("Generic Shopify apparel draft", shopify.draft.name === "Denim Shirt - Black" && shopify.draft.brand === "Shop Brand" && shopify.draft.category === "top" && shopify.draft.subCategory === "shirt" && shopify.draft.purchasePrice === 78 && shopify.draft.retailPrice === 98),
    pass("Open Graph-only draft", openGraph.draft.name === "Canvas Tote - Natural" && openGraph.draft.category === "accessory" && openGraph.draft.subCategory === "tote" && !!openGraph.draft.originalImageUrl),
    pass("Preview/import core consistency", consistencyCases.every(assertPreviewImportConsistency)),
    pass("Confidence fields present", nike.extraction.metadata.categoryConfidence !== "missing" && fearOfGod.extraction.metadata.colorConfidence === "high" && openGraph.extraction.metadata.priceConfidence === "missing"),
  ];

  return {
    passed: results.every((result) => result.passed),
    results,
  };
}
