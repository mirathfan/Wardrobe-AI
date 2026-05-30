import {
  amazonAsinFromProductUrl,
  extractEmbeddedAppState,
  extractGenericProductDataSync,
  extractOpenGraph,
  extractStructuredData,
  normalizeProductImages,
  normalizeProductUrl,
  rankGenericProductImages,
} from "./productExtractionPipeline";
import { runNikeFootwearImageRankingFixture } from "./nikeFootwearImageRanking.fixture";

type FixtureResult = {
  name: string;
  passed: boolean;
  details?: Record<string, unknown>;
};

function pass(name: string, passed: boolean, details?: Record<string, unknown>): FixtureResult {
  return { name, passed, details };
}

const productJsonLdHtml = `
  <html><head>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Wool Overshirt",
        "brand": {"@type": "Brand", "name": "Example Brand"},
        "image": ["https://cdn.example.com/products/overshirt-main-1400x1800.jpg"],
        "description": "A warm wool overshirt.",
        "sku": "WOOL-123",
        "offers": {"@type": "Offer", "price": "129.00", "priceCurrency": "USD", "availability": "https://schema.org/InStock"}
      }
    </script>
  </head></html>`;

const graphHtml = `
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        {"@type": "BreadcrumbList", "itemListElement": [
          {"@type": "ListItem", "position": 1, "name": "Women"},
          {"@type": "ListItem", "position": 2, "name": "Jackets"}
        ]},
        {"@type": "Product", "name": "Leather Biker Jacket", "brand": "AllSaints", "image": "https://www.allsaints.com/images/jacket-main.jpg"}
      ]
    }
  </script>`;

const productGroupHtml = `
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "ProductGroup",
      "name": "Air Runner Shoes",
      "brand": {"name": "Runner Co"},
      "productGroupID": "AR-999",
      "hasVariant": [
        {"@type": "Product", "name": "Air Runner Shoes Blue", "sku": "AR-999-BLU", "image": "https://cdn.example.com/air-runner-blue-main.jpg"}
      ],
      "offers": {"@type": "AggregateOffer", "lowPrice": "88.00", "highPrice": "120.00", "priceCurrency": "USD"}
    }
  </script>`;

const openGraphHtml = `
  <meta property="og:title" content="Canvas Tote | Example Store" />
  <meta property="og:description" content="A sturdy canvas tote." />
  <meta property="og:image" content="/images/tote-pdp-main-1200x1200.jpg" />
  <meta property="product:price:amount" content="48.00" />
  <meta property="product:price:currency" content="USD" />`;

const twitterHtml = `
  <meta name="twitter:title" content="Ribbed Tank" />
  <meta name="twitter:description" content="A ribbed tank top." />
  <meta name="twitter:image" content="https://example.com/images/tank-gallery-main.jpg" />`;

const nextHtml = `
  <script id="__NEXT_DATA__" type="application/json">
    {"props":{"pageProps":{"product":{"title":"Next Data Sneaker","brand":"Next Brand","price":9900,"currency":"USD","color":"White","images":[{"url":"/next/sneaker-gallery-main-1600.jpg"}],"variants":[{"size":"8"},{"size":"9"}],"styleId":"ND-100"}}}}
  </script>`;

const shopifyHtml = `
  <script type="application/json" data-product-json>
    {"product":{"title":"Shopify Denim Shirt","vendor":"Shop Brand","price":7800,"compare_at_price":9800,"images":["//cdn.shop.com/products/denim-product-main-1400.jpg"],"variants":[{"option1":"S"},{"option1":"M"}],"id":12345}}
  </script>`;

const fearOfGodHtml = `
  <meta property="og:title" content="ESSENTIALS Relaxed Hoodie | Fear of God" />
  <script type="application/json" data-product-json>
    {"product":{"title":"ESSENTIALS Relaxed Hoodie","brand":"Fear of God ESSENTIALS","price":11000,"currency":"USD","color":"Smoke","images":["https://fearofgod.com/cdn/shop/products/essentials-hoodie-product-main.jpg"]}}
  </script>`;

const allSaintsHtml = `
  <meta property="og:title" content="Dalby Leather Biker Jacket | AllSaints" />
  <script type="application/json">{"product":{"name":"Dalby Leather Biker Jacket","brand":"AllSaints","color":"Black","price":"399.00","currency":"USD","images":["/images/dalby-gallery-main.jpg"]}}</script>`;

const macysHtml = `
  <meta property="og:title" content="Nike Men's Club Fleece Hoodie - Macy's" />
  <script type="application/json">{"product":{"productName":"Men's Club Fleece Hoodie","brand":"Nike","productId":"1234567","salePrice":"45.00","regularPrice":"65.00","currency":"USD","color":"Navy","images":["https://slimages.macysassets.com/is/image/MCY/products/1/optimized/hoodie-main.jpg"]}}</script>`;

const jdSportsHtml = `
  <script type="application/json">{"product":{"name":"adidas Originals Gazelle Shoes","brand":"adidas","price":"100.00","currency":"USD","color":"Blue","images":["https://media.jdsports.com/i/jdsports/gazelle_product_main.jpg"]}}</script>`;

const footLockerHtml = `
  <script type="application/json">{"product":{"name":"Nike Air Max 90 Men's Shoes","brand":"Nike","styleId":"CN8490-100","price":"130.00","currency":"USD","sizes":["8","9","10"],"images":["https://images.footlocker.com/is/image/EBFL2/CN8490100_product-main.jpg"]}}</script>`;

const stockXHtml = `
  <script type="application/json">{"product":{"title":"Nike Dunk Low Panda","brand":"Nike","colorway":"White Black","styleId":"DD1391-100","image":"https://images.stockx.com/images/Nike-Dunk-Low-Panda-product.jpg"}}</script>`;

const malformedWithOpenGraphHtml = `
  <script type="application/ld+json">{not valid</script>
  <meta property="og:title" content="Fallback Shirt" />
  <meta property="og:image" content="//cdn.example.com/products/fallback-shirt-main-1200.jpg" />`;

const manyNonProductImagesHtml = `
  <meta property="og:title" content="Gallery Coat" />
  <script type="application/json">{"product":{"title":"Gallery Coat","images":[
    "https://example.com/assets/logo-icon.png",
    "https://example.com/banners/winter-sale-header.jpg",
    "https://example.com/products/gallery-coat-main-1600.jpg",
    "https://example.com/reviews/customer-upload.jpg"
  ]}}</script>`;

const blockedLikeHtml = `
  <html><head><title>Access Denied</title></head><body>Captcha required. Please verify you are human.</body></html>`;

export function runProductExtractionPipelineFixture() {
  const baseUrl = "https://example.com/products/item?utm_source=test&color=blue";
  const structured = extractStructuredData(productJsonLdHtml, baseUrl);
  const graph = extractStructuredData(graphHtml, "https://www.allsaints.com/products/dalby");
  const productGroup = extractStructuredData(productGroupHtml, "https://example.com/products/air-runner");
  const openGraph = extractOpenGraph(openGraphHtml, "https://example.com/products/tote");
  const twitter = extractOpenGraph(twitterHtml, "https://example.com/products/tank");
  const next = extractEmbeddedAppState(nextHtml, "https://example.com/products/sneaker");
  const shopify = extractEmbeddedAppState(shopifyHtml, "https://shop.example.com/products/denim-shirt");
  const malformed = extractStructuredData("<script type=\"application/ld+json\">{not valid</script>", baseUrl);
  const malformedWithOg = extractGenericProductDataSync("https://example.com/products/fallback-shirt", malformedWithOpenGraphHtml);
  const partial = extractGenericProductDataSync("https://example.com/products/tote", openGraphHtml);
  const manyImages = extractGenericProductDataSync("https://example.com/products/gallery-coat", manyNonProductImagesHtml);
  const blockedLike = extractGenericProductDataSync("https://example.com/products/blocked", blockedLikeHtml);
  const empty = extractGenericProductDataSync("https://example.com/products/empty", "");
  const normalizedImages = normalizeProductImages(
    [
      "/images/product-main-1200.jpg",
      "https://example.com/images/product-main-1200.jpg?utm_source=x",
      "https://example.com/assets/logo.svg",
    ],
    new URL("https://example.com/products/abc"),
    "fixture",
  );
  const normalizedAdvancedImages = normalizeProductImages(
    [
      "http://images.example.com/products/sneaker-main.jpg?width=80",
      "https://images.example.com/products/sneaker-main.jpg?width=1600",
      "//cdn.example.com/products/coat-main.webp?imwidth=1200",
      "/media/coat-main.jpg",
    ],
    new URL("https://example.com/products/coat"),
    "fixture",
  );
  const rankedImages = rankGenericProductImages(
    {
      images: [
        { url: "https://example.com/assets/logo-icon.png", source: "fixture" },
        { url: "https://example.com/banners/sale-header.jpg", source: "fixture" },
        { url: "https://example.com/products/coat-gallery-main-1600.jpg", source: "fixture" },
      ],
    },
    "https://example.com/products/coat",
  );

  const fearOfGod = extractGenericProductDataSync("https://fearofgod.com/products/essentials-relaxed-hoodie", fearOfGodHtml);
  const allSaints = extractGenericProductDataSync("https://www.allsaints.com/us/women/leather/dalby", allSaintsHtml);
  const macys = extractGenericProductDataSync("https://www.macys.com/shop/product/example?ID=1234567&utm_source=x", macysHtml);
  const jdSports = extractGenericProductDataSync("https://www.jdsports.com/store/product/adidas-gazelle", jdSportsHtml);
  const footLocker = extractGenericProductDataSync("https://www.footlocker.com/product/nike-air-max-90/CN8490100.html", footLockerHtml);
  const stockX = extractGenericProductDataSync("https://stockx.com/nike-dunk-low-panda", stockXHtml);
  const amazonDp = normalizeProductUrl("https://www.amazon.com/Some-Product/dp/B08N5WRWNW?utm_source=x&tag=abc");
  const amazonGp = normalizeProductUrl("https://www.amazon.co.uk/gp/product/B07PGL2ZSL/ref=something?gclid=abc");
  const amazonAw = normalizeProductUrl("https://m.amazon.com/gp/aw/d/B012345678/ref=tracking?utm_source=x&psc=1");
  const amazonObidos = normalizeProductUrl("https://www.amazon.com/exec/obidos/ASIN/B000123456?ref=abc");
  const amazonQueryAsin = normalizeProductUrl("https://www.amazon.com/s?k=shirt&ASIN=B000654321&utm_source=x");
  const normalizedGenericUrl = normalizeProductUrl("HTTP://WWW.EXAMPLE.COM//products//shirt?utm_source=x&fbclid=y&color=red&size=M&variant=123&ref=abc");
  const normalizedMobileUrl = normalizeProductUrl("https://m.allsaints.com//products//dalby?utm_campaign=x");
  const amazonFallback = extractGenericProductDataSync(
    "https://www.amazon.com/dp/B08N5WRWNW",
    "<meta property=\"og:title\" content=\"Amazon Product : Clothing, Shoes & Jewelry\" /><meta property=\"og:image\" content=\"https://m.media-amazon.com/images/I/product-main.jpg\" />",
  );
  const nike = runNikeFootwearImageRankingFixture();

  const results: FixtureResult[] = [
    pass("JSON-LD Product extraction", structured.title === "Wool Overshirt" && structured.brand === "Example Brand" && structured.priceAmount === 129),
    pass("@graph Product extraction", graph.title === "Leather Biker Jacket" && graph.breadcrumbs?.includes("Jackets") === true),
    pass("ProductGroup extraction", productGroup.title === "Air Runner Shoes" && productGroup.priceAmount === 88),
    pass("Offer extraction", structured.currency === "USD" && structured.availability?.includes("InStock") === true),
    pass("AggregateOffer extraction", productGroup.priceAmount === 88 && productGroup.currency === "USD"),
    pass("BreadcrumbList category extraction", graph.category === "Women" && graph.subcategory === "Jackets"),
    pass("Open Graph fallback", openGraph.title === "Canvas Tote | Example Store" && openGraph.priceAmount === 48),
    pass("Twitter card fallback", twitter.title === "Ribbed Tank" && twitter.images?.[0]?.url.includes("tank-gallery-main") === true),
    pass("Next.js __NEXT_DATA__ fallback", next.title === "Next Data Sneaker" && next.sizes?.includes("9") === true),
    pass("Shopify-like product JSON fallback", shopify.title === "Shopify Denim Shirt" && shopify.salePrice === 78),
    pass("Malformed JSON-LD does not crash", malformed.confidence === 0 && malformed.debug?.warnings?.includes("malformed_json_ld") === true),
    pass("Malformed JSON-LD plus Open Graph fallback", malformedWithOg.title === "Fallback Shirt" && malformedWithOg.primaryImage?.startsWith("https://cdn.example.com") === true),
    pass("Partial extraction still returns usable draft", partial.title === "Canvas Tote | Example Store" && !!partial.primaryImage),
    pass("Image URL normalization and dedupe", normalizedImages.length === 2 && normalizedImages[0]?.url.startsWith("https://")),
    pass(
      "Advanced image normalization keeps high-res absolute URLs",
      normalizedAdvancedImages.length === 3 &&
        normalizedAdvancedImages[0]?.url.includes("width=1600") === true &&
        normalizedAdvancedImages.some((image) => image.url === "https://cdn.example.com/products/coat-main.webp?imwidth=1200") &&
        normalizedAdvancedImages.some((image) => image.url === "https://example.com/media/coat-main.jpg"),
    ),
    pass("Generic image ranking rejects logos/banners/icons", rankedImages[0]?.url.includes("coat-gallery-main") === true),
    pass("Page with many non-product images prefers product image", manyImages.primaryImage?.includes("gallery-coat-main") === true),
    pass("Blocked-like page returns diagnostics instead of crashing", blockedLike.diagnostics?.extractionWarnings.includes("blocked_or_bot_check_page") === true),
    pass("Empty page returns canonical partial result", empty.canonicalUrl === "https://example.com/products/empty" && empty.diagnostics?.missingFields.includes("title") === true),
    pass(
      "URL normalization strips tracking and preserves variants",
      normalizedGenericUrl.canonicalDomain === "example.com" &&
        normalizedGenericUrl.url.pathname === "/products/shirt" &&
        normalizedGenericUrl.url.searchParams.get("color") === "red" &&
        normalizedGenericUrl.url.searchParams.get("size") === "M" &&
        normalizedGenericUrl.url.searchParams.get("variant") === "123" &&
        !normalizedGenericUrl.normalizedUrl.includes("utm_") &&
        !normalizedGenericUrl.normalizedUrl.includes("fbclid") &&
        !normalizedGenericUrl.normalizedUrl.includes("ref="),
    ),
    pass("Mobile subdomain normalization", normalizedMobileUrl.normalizedUrl.startsWith("https://allsaints.com/products/dalby")),
    pass("Fear of God fixture", fearOfGod.brand === "Fear of God ESSENTIALS" && fearOfGod.priceAmount === 110),
    pass("AllSaints fixture", allSaints.brand === "AllSaints" && allSaints.color === "Black"),
    pass("Macy's fixture", macys.brand === "Nike" && macys.productId === "1234567" && macys.salePrice === 45),
    pass("JD Sports fixture", jdSports.retailer === "JD Sports" && jdSports.brand === "adidas" && jdSports.priceAmount === 100),
    pass("Foot Locker fixture", footLocker.retailer === "Foot Locker" && footLocker.styleId === "CN8490-100" && footLocker.sizes?.includes("10") === true),
    pass("StockX fixture", stockX.retailer === "StockX" && stockX.styleId === "DD1391-100" && stockX.priceUnavailable === true),
    pass("Amazon ASIN from /dp URL", amazonAsinFromProductUrl(new URL(amazonDp.normalizedUrl)) === "B08N5WRWNW" && !amazonDp.normalizedUrl.includes("utm_")),
    pass("Amazon ASIN from /gp/product URL", amazonGp.amazonAsin === "B07PGL2ZSL" && amazonGp.normalizedUrl.includes("/dp/B07PGL2ZSL")),
    pass("Amazon ASIN from /gp/aw/d URL", amazonAw.amazonAsin === "B012345678" && amazonAw.normalizedUrl === "https://amazon.com/dp/B012345678?psc=1"),
    pass("Amazon ASIN from obidos URL", amazonObidos.amazonAsin === "B000123456" && amazonObidos.normalizedUrl === "https://www.amazon.com/dp/B000123456"),
    pass("Amazon ASIN from query param", amazonQueryAsin.amazonAsin === "B000654321" && amazonQueryAsin.normalizedUrl === "https://www.amazon.com/dp/B000654321"),
    pass("Amazon fallback without API credentials", amazonFallback.productId === "B08N5WRWNW" && amazonFallback.priceUnavailable === true && !!amazonFallback.primaryImage),
    pass("Diagnostics include safe confidence fields", malformedWithOg.diagnostics?.titleConfidence === "medium" && malformedWithOg.diagnostics.priceConfidence === "missing"),
    pass("Nike footwear left-facing fixture still passes", nike.passed),
    pass("Non-Nike behavior remains unchanged", nike.results.some((result) => result.name === "non-Nike retailer order is unchanged" && result.passed)),
  ];

  return {
    passed: results.every((result) => result.passed),
    results,
  };
}
