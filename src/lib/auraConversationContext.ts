import type { AIMessage } from "@/src/components/ai/chatTypes";
import type { AuraLook } from "@/src/types/aura";
import type {
  AuraAgentConversationContext,
  AuraAgentOutfit,
} from "@/src/types/auraAgent";

export type AuraConversationContextEntry = {
  role: "user" | "assistant";
  text: string;
};

const DEFAULT_CONTEXT_LIMIT = 12;
const DEFAULT_AGENT_TURN_LIMIT = 8;
const DEFAULT_AGENT_OUTFIT_LIMIT = 8;

function cleanContextText(value?: string | null, maxLength = 1400) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, maxLength) : "";
}

function pushUnique(parts: string[], value?: string | null, maxLength?: number) {
  const cleaned = cleanContextText(value, maxLength);
  if (!cleaned) return;
  const normalized = cleaned.toLowerCase();
  if (parts.some((part) => part.toLowerCase() === normalized)) return;
  parts.push(cleaned);
}

function pieceSummary(
  pieces: {
    role?: string | null;
    itemName?: string | null;
    name?: string | null;
    source?: string | null;
    itemId?: string | null;
  }[],
) {
  return pieces
    .slice(0, 7)
    .map((piece) => {
      const role = cleanContextText(piece.role, 32);
      const name = cleanContextText(piece.itemName ?? piece.name, 80);
      const source = piece.source === "suggested" ? "suggested" : "owned";
      const itemId = cleanContextText(piece.itemId, 80);
      return [role, name, source, itemId ? `id ${itemId}` : ""].filter(Boolean).join(": ");
    })
    .filter(Boolean)
    .join(" | ");
}

function summarizeAuraLookForConversation(look: AuraLook, index?: number) {
  const label = index ? `Look ${index}` : "Current look";
  const parts: string[] = [];
  const title = cleanContextText(look.lookTitle || label, 100);
  parts.push(`${label}: ${title}`);
  pushUnique(parts, look.occasion ? `Occasion: ${look.occasion}` : null, 100);
  pushUnique(parts, look.vibe ? `Vibe: ${look.vibe}` : null, 140);
  pushUnique(
    parts,
    look.personalizationLabel ? `Styling lane: ${look.personalizationLabel}` : null,
    140,
  );
  pushUnique(
    parts,
    look.stylingIntelligence?.styleIdentity
      ? `Style identity: ${look.stylingIntelligence.styleIdentity}`
      : null,
    120,
  );
  pushUnique(
    parts,
    look.stylingIntelligence?.occasionFit != null
      ? `Occasion fit score: ${Math.round(look.stylingIntelligence.occasionFit)}`
      : null,
    80,
  );
  const pieces = pieceSummary(look.pieces ?? []);
  pushUnique(parts, pieces ? `Pieces: ${pieces}` : null, 900);
  pushUnique(
    parts,
    look.addToComplete?.length
      ? `Missing or suggested pieces: ${look.addToComplete.slice(0, 4).join(", ")}`
      : null,
    240,
  );
  pushUnique(
    parts,
    look.stylingIntelligence?.warnings?.length
      ? `Warnings: ${look.stylingIntelligence.warnings.slice(0, 3).join("; ")}`
      : null,
    320,
  );
  return parts.join("\n");
}

function summarizeAgentOutfitForConversation(outfit: AuraAgentOutfit, index: number) {
  const parts: string[] = [];
  const title = cleanContextText(outfit.title || `Look ${index}`, 100);
  parts.push(`Look ${index}: ${title}`);
  pushUnique(parts, outfit.occasion ? `Occasion: ${outfit.occasion}` : null, 100);
  pushUnique(parts, outfit.formality ? `Formality: ${outfit.formality}` : null, 80);
  pushUnique(parts, outfit.vibe ? `Vibe: ${outfit.vibe}` : null, 140);
  const pieces = pieceSummary(
    (outfit.items ?? []).map((item) => ({
      role: item.role,
      name: item.name,
      source: "owned",
      itemId: item.itemId,
    })),
  );
  pushUnique(parts, pieces ? `Pieces: ${pieces}` : null, 900);
  pushUnique(
    parts,
    outfit.missingItems?.length
      ? `Missing or suggested pieces: ${outfit.missingItems.slice(0, 4).join(", ")}`
      : null,
    240,
  );
  return parts.join("\n");
}

function agentOutfitItemIds(outfit: AuraAgentOutfit): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of outfit.items ?? []) {
    const itemId = cleanContextText(item.itemId, 120);
    if (!itemId || seen.has(itemId)) continue;
    seen.add(itemId);
    out.push(itemId);
  }
  return out;
}

function agentFeedbackSignals(message: AIMessage): string[] {
  const signals: string[] = [];
  const states = message.agentActionStates ?? {};
  for (const [outfitId, state] of Object.entries(states)) {
    if (state.moreLikeThis) signals.push(`positive feedback: more like outfit ${outfitId}`);
    if (state.notMyVibe) signals.push(`negative feedback: avoid outfit ${outfitId}`);
    if (state.saved) signals.push(`positive feedback: saved outfit ${outfitId}`);
    if (state.worn) signals.push(`positive feedback: worn outfit ${outfitId}`);
  }
  const feedback = message.agentResponse?.feedback;
  if (feedback?.recorded && feedback.feedbackType) {
    signals.push(`recorded feedback: ${feedback.feedbackType}`);
  }
  return signals.map((signal) => cleanContextText(signal, 240)).filter(Boolean);
}

export function buildAssistantConversationText(message: AIMessage) {
  const parts: string[] = [];
  pushUnique(parts, message.assistantIntroText, 700);
  pushUnique(parts, message.aura?.reply, 900);
  pushUnique(parts, message.agentResponse?.message, 900);
  pushUnique(parts, message.text, 900);

  const auraLooks = message.aura?.lookOptions?.length
    ? message.aura.lookOptions.slice(0, 4)
    : message.aura?.look
      ? [message.aura.look]
      : [];
  if (auraLooks.length) {
    parts.push(
      [
        "Rendered outfit-card context for follow-ups:",
        ...auraLooks.map((look, index) =>
          summarizeAuraLookForConversation(
            look,
            auraLooks.length > 1 ? index + 1 : undefined,
          ),
        ),
      ].join("\n"),
    );
  }

  const agentOutfits = message.agentResponse?.outfits?.slice(0, 4) ?? [];
  if (agentOutfits.length) {
    parts.push(
      [
        "Rendered outfit-card context for follow-ups:",
        ...agentOutfits.map((outfit, index) =>
          summarizeAgentOutfitForConversation(outfit, index + 1),
        ),
      ].join("\n"),
    );
  }

  return parts.join("\n\n").trim();
}

export function buildAuraConversationContext(
  messages: AIMessage[],
  options?: { limit?: number },
): AuraConversationContextEntry[] {
  const limit = Math.max(1, Math.min(12, options?.limit ?? DEFAULT_CONTEXT_LIMIT));
  return messages
    .filter((message) => message.type === "user" || message.type === "assistant")
    .map((message) => {
      const text =
        message.type === "assistant"
          ? buildAssistantConversationText(message)
          : cleanContextText(message.text, 1000);
      if (!text) return null;
      return {
        role: message.type === "assistant" ? "assistant" : "user",
        text,
      } as const;
    })
    .filter((entry): entry is AuraConversationContextEntry => !!entry)
    .slice(-limit);
}

export function buildAuraAgentConversationContext(
  messages: AIMessage[],
  options?: {
    selectedOutfit?: AuraAgentOutfit | null;
    selectedItemIds?: string[];
    turnLimit?: number;
    outfitLimit?: number;
  },
): AuraAgentConversationContext | undefined {
  const recentTurns = buildAuraConversationContext(messages, {
    limit: Math.max(1, Math.min(12, options?.turnLimit ?? DEFAULT_AGENT_TURN_LIMIT)),
  });
  const outfitLimit = Math.max(1, Math.min(12, options?.outfitLimit ?? DEFAULT_AGENT_OUTFIT_LIMIT));
  const priorOutfitRefs = messages
    .flatMap((message) => {
      const outfits = message.agentResponse?.outfits?.slice(0, 5) ?? [];
      return outfits.map((outfit, index) => ({
        ...(outfit.outfitId ? { outfitId: outfit.outfitId } : {}),
        sourceMessageId: message.id,
        index: index + 1,
        title: cleanContextText(outfit.title, 120),
        occasion: cleanContextText(outfit.occasion, 80),
        formality: cleanContextText(outfit.formality, 80),
        vibe: cleanContextText(outfit.vibe, 160),
        itemIds: agentOutfitItemIds(outfit).slice(0, 8),
        summary: summarizeAgentOutfitForConversation(outfit, index + 1),
      }));
    })
    .slice(-outfitLimit);
  const selectedItemIds = [
    ...(options?.selectedItemIds ?? []),
    ...(options?.selectedOutfit ? agentOutfitItemIds(options.selectedOutfit) : []),
  ]
    .map((itemId) => cleanContextText(itemId, 120))
    .filter(Boolean)
    .filter((itemId, index, all) => all.indexOf(itemId) === index)
    .slice(0, 12);
  const feedbackSignals = messages
    .flatMap(agentFeedbackSignals)
    .filter((signal, index, all) => all.indexOf(signal) === index)
    .slice(-12);
  const selectedOutfitId = cleanContextText(options?.selectedOutfit?.outfitId, 180);

  if (!recentTurns.length && !priorOutfitRefs.length && !selectedOutfitId && !selectedItemIds.length && !feedbackSignals.length) {
    return undefined;
  }
  return {
    recentTurns,
    priorOutfitRefs,
    ...(selectedOutfitId ? { selectedOutfitId } : {}),
    selectedItemIds,
    feedbackSignals,
  };
}
