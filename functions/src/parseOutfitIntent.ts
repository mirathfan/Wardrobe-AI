export type OutfitIntent = {
  occasion?: string;
  vibe?: string;
  colorPreference?: string[];
  includeOuterwear?: boolean;
  includeAccessory?: boolean;
  allowRewearToday?: boolean;
  allowOverWearLimit?: boolean;
};

const KNOWN_COLORS = [
  "black",
  "white",
  "blue",
  "navy",
  "green",
  "red",
  "grey",
  "gray",
  "beige",
  "brown",
  "pink",
  "purple",
  "yellow",
  "orange",
];

function norm(v: string) {
  return v.toLowerCase().trim();
}

function extractColors(prompt: string) {
  const p = norm(prompt);
  const colors = KNOWN_COLORS.filter((c) => p.includes(c));
  return Array.from(new Set(colors));
}

export function fallbackIntentParser(prompt: string): OutfitIntent {
  const p = norm(prompt);
  return {
    occasion: p.includes("work")
      ? "work"
      : p.includes("gym")
      ? "gym"
      : p.includes("date")
      ? "date"
      : undefined,
    vibe: p.includes("party") || p.includes("date") || p.includes("club") ? "party" : undefined,
    colorPreference: extractColors(prompt),
    includeOuterwear:
      p.includes("jacket") || p.includes("hoodie") || p.includes("coat") || p.includes("outerwear"),
    includeAccessory:
      p.includes("accessory") || p.includes("hat") || p.includes("watch") || p.includes("belt"),
    allowRewearToday: p.includes("reuse") || p.includes("rewear"),
    allowOverWearLimit:
      p.includes("don't care about wash") || p.includes("dont care about wash") || p.includes("ignore wash"),
  };
}

function safeJsonExtract(text: string): OutfitIntent | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  const raw = text.slice(start, end + 1);

  try {
    const parsed = JSON.parse(raw) as OutfitIntent;
    return {
      occasion: parsed.occasion,
      vibe: parsed.vibe,
      colorPreference: Array.isArray(parsed.colorPreference)
        ? parsed.colorPreference.map((v) => String(v).toLowerCase())
        : undefined,
      includeOuterwear: !!parsed.includeOuterwear,
      includeAccessory: !!parsed.includeAccessory,
      allowRewearToday: !!parsed.allowRewearToday,
      allowOverWearLimit: !!parsed.allowOverWearLimit,
    };
  } catch {
    return null;
  }
}

export async function parseOutfitIntentFromPrompt(prompt: string): Promise<OutfitIntent> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fallbackIntentParser(prompt);
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You extract outfit intent from user text. Return JSON only with keys: occasion, vibe, colorPreference (string[]), includeOuterwear (boolean), includeAccessory (boolean), allowRewearToday (boolean), allowOverWearLimit (boolean). No markdown.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      return fallbackIntentParser(prompt);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = safeJsonExtract(content);
    return parsed ?? fallbackIntentParser(prompt);
  } catch {
    return fallbackIntentParser(prompt);
  }
}
