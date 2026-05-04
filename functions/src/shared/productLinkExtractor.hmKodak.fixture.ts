import { extractProductMetadataFromHtml } from "./productLinkExtractor";

export const hmKodakProductFixture = {
  url: "https://www2.hm.com/en_us/productpage.1234567001.html",
  html: `
    <html>
      <head>
        <title>Light blue/Kodak Loose Fit Printed football shirt | H&M US</title>
        <meta property="og:site_name" content="H&M" />
        <meta property="og:title" content="Light blue/Kodak Loose Fit Printed football shirt | H&M US" />
        <meta property="og:description" content="Loose-fit football shirt in striped mesh. Printed Kodak camera club artwork at front. Ribbed collar. Composition Cotton 100%. Machine wash cold." />
        <meta property="product:price:amount" content="19.99" />
        <meta property="product:price:currency" content="USD" />
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": "Light blue/Kodak Loose Fit Printed football shirt",
            "brand": { "@type": "Brand", "name": "Kodak" },
            "color": "Light blue",
            "description": "Loose-fit football shirt in striped mesh with printed Kodak camera club artwork.",
            "material": "100% cotton",
            "offers": { "@type": "Offer", "price": "19.99", "priceCurrency": "USD" }
          }
        </script>
      </head>
      <body>
        <main>
          <h1>Light blue/Kodak Loose Fit Printed football shirt</h1>
          <section>Sizes XS S M L XL</section>
          <section>Care instructions: Machine wash cold.</section>
        </main>
      </body>
    </html>
  `,
  expected: {
    brand: "H&M",
    title: "Light blue loose striped football shirt",
    graphicText: "Kodak",
    color: "Light blue",
    fit: "loose",
    pattern: "striped",
    material: "cotton",
    priceAmount: 19.99,
    priceCurrency: "USD",
  },
};

export function runHmKodakProductFixture() {
  const metadata = extractProductMetadataFromHtml(hmKodakProductFixture.url, hmKodakProductFixture.html);
  return {
    metadata,
    passed:
      metadata.brand === hmKodakProductFixture.expected.brand &&
      metadata.title === hmKodakProductFixture.expected.title &&
      !metadata.title?.includes("/Kodak") &&
      metadata.graphicText === hmKodakProductFixture.expected.graphicText &&
      metadata.material === hmKodakProductFixture.expected.material &&
      metadata.priceAmount === hmKodakProductFixture.expected.priceAmount,
  };
}
