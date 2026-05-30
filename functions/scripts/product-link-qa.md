# Product Link Release QA Checklist

Use the developer smoke runner after building functions:

```bash
npm --prefix functions run build
npm --prefix functions run smoke:product-links -- --show-diagnostics <url>
```

Optional review output:

```bash
npm --prefix functions run smoke:product-links -- --json --save-output ./tmp/product-link-smoke.json <url> [url...]
```

## Pre-release

- Run `npm run lint`.
- Run `npx tsc --noEmit`.
- Run `npm test --if-present`.
- Run `npm --prefix functions run lint`.
- Run `npm --prefix functions run build`.
- Run the product extraction fixture runner.
- Run the Nike footwear fixture runner.
- Run the closet draft golden fixture runner.
- Run the product-link release fixture runner.
- Run the smoke script against representative URLs.
- Verify `PRODUCT_LINK_EXTRACTION_V2_ENABLED` is set intentionally for the target environment.
- Verify product-link logs do not include raw HTML, cookies, auth headers, closet contents, or private user data.

## Manual QA URL Groups

- Nike shoe product
- Fear of God or ESSENTIALS apparel
- AllSaints apparel
- Macy's branded product, ideally with sale pricing
- JD Sports sneaker
- Foot Locker sneaker
- StockX sneaker
- Amazon product
- Random Shopify product page
- Generic Open Graph-only product page
- Blocked or bot-check-like product page

## Manual QA Checklist

- Title is clean and does not include retailer wrappers or duplicated brand text.
- Brand is the product brand; Amazon is not inferred as brand.
- Category and subcategory are reasonable, with uncertain items left as unknown.
- Color or colorway is correct when visible in metadata.
- Price is not fabricated; sale price appears only when original/current prices are reliable.
- Primary image is product-focused and not a logo, banner, thumbnail, review image, or lifestyle image when a clean product image is available.
- Nike footwear uses a left-facing shoe image where a real candidate exists.
- Preview and imported item agree on title, brand, category, color, price, and primary image.
- Partial/failure states are understandable and do not crash the flow.
- Smoke output includes `durationMs`, `resultStatus`, `warningCodes`, `failureCode`, and `featureFlagEnabled`.
- Macy's sale price maps to current price with original price retained.
- JD Sports sneaker image/title are product-focused and clean.
- Foot Locker style ID, color, and sizes are retained when present.
- StockX does not fabricate market price.
- Amazon does not fabricate price or availability.
- Open Graph-only pages create a partial preview when structured product data is absent.

## Post-release Monitoring

- Monitor product-link preview/import partial and failure rates by domain.
- Monitor `NO_PRODUCT_IMAGE`.
- Monitor `FETCH_BLOCKED`.
- Monitor `AMAZON_PRICE_UNAVAILABLE`.
- Monitor `STOCKX_MARKET_PRICE_UNAVAILABLE`.
- Monitor import success rate and image-required import failures.
- Collect representative failed and partial examples for future adapter tuning.

## Known Limits

- The extractor is best-effort and does not execute arbitrary page JavaScript.
- Some sites block server fetches; client preview or screenshot/manual add may be needed.
- Amazon price and availability require reliable structured/API-like data.
- StockX market prices are not fabricated when unavailable.
