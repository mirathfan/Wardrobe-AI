# Closet App Agent Instructions

Use these instructions when making changes in this repository. Prefer existing project conventions over new architecture unless the task clearly requires otherwise.

## Project Structure

- Frontend: Expo React Native with Expo Router. Main app routes live under `app/`.
- Backend/API: Firebase Cloud Functions live under `functions/src/`.
- Persistence: Firebase Auth, Firestore, Storage, and MMKV/local cache.
- Core wardrobe/item logic: `src/lib/items.ts` and the `ClothingItem` model.
- User profile/preferences: `src/types/UserProfilePreferences.ts` and `src/lib/userProfile.ts`.
- Wardrobe gap suggestions: `src/lib/wardrobeSuggestions.ts`.
- Product recommendation UI/client logic: `src/lib/productRecommendations.ts`.
- Product search/ranking backend logic: `functions/src/products/`.
- Styling conventions: React Native `StyleSheet`, `constants/theme.ts`, Aura primitives, glass cards, Ionicons, and existing component patterns.

## General Coding Guidance

- Follow the existing Expo Router, React Native, Firebase, and TypeScript conventions.
- Keep changes scoped to the requested behavior and nearby modules.
- Prefer typed, pure TypeScript helpers for domain logic before wiring UI, network calls, or persistence.
- Avoid introducing large new frameworks or state-management systems unless explicitly requested.
- Use existing theme tokens and component styles. Do not introduce a parallel design system.
- Keep UI behavior consistent with existing Aura surfaces, cards, sheets, and button patterns.

## Shopping Recommendations

- Keep shopping recommendation logic provider-neutral. Recommendation scoring should not depend on a specific retailer, affiliate network, or product search provider.
- Do not expand hardcoded retailer/product data in `src/lib/productRecommendations.ts`.
- Keep recommendation scoring deterministic, explainable, and testable.
- Prefer pure TypeScript functions for scoring, gap detection, filtering, and explanation generation before wiring the UI.
- Include clear recommendation reasons such as wardrobe gap, preferred color, budget fit, size availability, style preference, saved-look signal, or dismissed-signal suppression.
- Keep product/provider integrations behind narrow boundaries so live search, cached products, affiliate wrapping, and future providers can change independently from scoring.
- Do not hardcode retailer-specific ranking rules unless the user explicitly asks for a provider-specific feature.

## User State, Privacy, and Analytics

- Keep durable user recommendation state in user-scoped Firestore paths.
- Keep analytics events separate from durable saved/dismissed state.
- Do not treat analytics collections as the source of truth for user preference state.
- Do not expose private wardrobe, profile, size, budget, saved, dismissed, or feedback data outside user-scoped reads/writes.
- Update `firestore.rules` whenever adding new user-scoped collections or changing persisted document shapes.
- Do not add affiliate partners, API keys, tracking params, or new telemetry fields unless explicitly requested.
- Use environment variables/config for external integrations.

## Backend and Integrations

- Cloud Functions changes belong in `functions/src/`.
- Product search and ranking changes should stay under `functions/src/products/` unless shared types/helpers are needed.
- Keep request/response types explicit and validate inputs at API boundaries.
- Avoid leaking provider-specific data into frontend recommendation scoring.
- Use Firebase config, environment variables, or existing secret-management patterns for credentials and external service settings.

## AURA Outfit Rule

Any user message that implies outfit generation, outfit improvement, outfit iteration, vibe change, occasion change, or piece replacement must produce a structured outfit card payload, not text-only. AURA must respect occasion appropriateness, closet availability, user constraints, and mutation requests. Sports/team jerseys are strongly incompatible with date, wedding, interview, business casual, and formal outfits unless the user explicitly requests a sports/game-day context.

## Validation

Run available validation commands before finishing:

- Root lint if available: `npm run lint`
- If Cloud Functions files changed: run `npm run lint` and `npm run build` inside `functions/`

If a validation command cannot be run, state why.

## Final Response Checklist

End every task with:

- Files changed
- Commands run
- Validation results
- Remaining TODOs or risks
