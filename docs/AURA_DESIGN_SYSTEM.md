# AURA Design System

AURA should feel like a premium dark luxury fashion app: calm, editorial, restrained, and precise. Use hierarchy, spacing, and consistency before adding visual effects.

## Tokens

Use semantic tokens from `constants/theme.ts` and shared primitives from `src/components/ui/AuraPrimitives.tsx`.

- Backgrounds: `colors.background` for screens.
- Normal cards: `colors.surface`.
- Important/elevated cards: `colors.surfaceElevated`.
- Quiet metadata areas: `colors.surfaceMuted`.
- Borders: `colors.border` by default, `colors.borderStrong` only when the surface needs more separation.
- Text: `colors.textPrimary`, `colors.textSecondary`, and `colors.textMuted`.
- Accent: `colors.accent` for the primary action or a single editorial highlight.
- Status: `colors.destructive` and `colors.success` only for real status.

Spacing should use the 4 point scale: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40`.

Radii should use `sm / md / lg / xl / xxl / full`. Avoid inventing one-off radii unless matching an image crop or external asset.

## Primitives

Prefer these for new or migrated UI:

- `AuraScreen` for tab or subpage screen containers.
- `AuraText` for typography and text tones.
- `AuraButton` for labeled actions.
- `AuraIconButton` for icon-only actions.
- `AuraCard` for solid, elevated, muted, glass, inset, and sheet surfaces.
- `AuraDivider` for subtle separators.
- `AuraSectionHeader` for section title/subtitle/action patterns.
- `AuraSheetBackdrop` and `AuraSheetSurface` for modal/sheet surfaces when migration is low risk.
- `AuraSkeleton` for loading placeholders.

## Button Hierarchy

Use one primary action per card or section.

- Primary: the action that advances the user.
- Secondary: useful but lower priority.
- Tertiary or ghost: navigation, filters, or optional actions.
- Destructive: delete, remove, cancel destructive state.

Do not show disabled future actions. Hide them until they are useful.

## Chips

Chips are for real filters, compact selections, or essential metadata. Do not use chips as a catch-all layout device.

- Keep chip rows short.
- Avoid chip-heavy empty states.
- Avoid using chips for every attribute when text grouping would read calmer.
- Metadata chips should use muted surfaces and medium weights, not bold pills.

## Glass

Glass is rare. Use it for:

- The floating tab bar.
- The chat composer.
- Modal or sheet overlays.
- A hero moment that benefits from material depth.

Use solid elevated surfaces for normal cards. Avoid stacked glass cards and nested rounded cards.

## Typography

Use `AuraText` variants:

- `hero`: rare landing or major editorial moment.
- `title`: screen title.
- `heading`: large grouped content title.
- `section`: section title.
- `body`: normal copy.
- `bodyStrong`: emphasized body text.
- `caption`: supporting copy.
- `metadata`: compact labels.
- `button`: action labels.

Most UI should use 400 to 600 weights. Reserve 700 for true hierarchy, not chips, captions, or every card title.

## Migration Guidelines

- Replace raw visual constants with semantic tokens when touching a component.
- Migrate text, buttons, cards, and dividers before changing layout.
- Preserve route names, data shapes, Firebase logic, and streaming behavior.
- Do not redesign `AuraLookCard` positioning as part of token cleanup.
- Do not convert a complex screen all at once. Move shared pieces first, then verify lint and typecheck.
- Prefer solid surfaces over glass for repeated cards.
