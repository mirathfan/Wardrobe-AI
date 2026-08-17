import { allowedWebOrigins } from "./cors";

describe("allowedWebOrigins", () => {
  it("returns an empty allowlist when ALLOWED_WEB_ORIGINS is empty", () => {
    expect(allowedWebOrigins("")).toEqual([]);
  });

  it("parses comma-separated web origins", () => {
    expect(allowedWebOrigins("https://a.com,https://b.com")).toEqual([
      "https://a.com",
      "https://b.com",
    ]);
  });
});
