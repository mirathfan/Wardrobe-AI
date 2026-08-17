import {
  formatUserBubbleText,
  prepareUserMessageText,
  prepareVisibleUserMessageText,
} from "@/src/lib/chatUserMessageText";

describe("chat user message text helpers", () => {
  it("preserves complete raw user input after trimming", () => {
    expect(prepareUserMessageText("  Give me 3 outfits for a date  ")).toBe(
      "Give me 3 outfits for a date",
    );
  });

  it("does not drop short trailing words from user bubble text", () => {
    expect(formatUserBubbleText("Give me 3 outfits for a date")).toBe(
      "Give me 3 outfits for a date",
    );
  });

  it("strips internal item metadata without truncating the visible request", () => {
    expect(
      prepareVisibleUserMessageText(
        "Give me 3 outfits for a date\nCloset item id: hidden-shirt\nSelected item ids: hidden-shirt",
      ),
    ).toBe("Give me 3 outfits for a date");
  });

  it("keeps multiline user text wrapped as real message text", () => {
    expect(formatUserBubbleText("Give me 3 outfits\nfor a date")).toBe(
      "Give me 3 outfits\nfor a date",
    );
  });
});
