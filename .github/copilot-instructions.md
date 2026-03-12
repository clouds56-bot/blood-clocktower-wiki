# UI/UX Skill Pack for This Repository

These instructions define the default UI/UX quality bar for changes in `wiki/`.

## Product Context

- Frontend stack: Astro + TypeScript + UnoCSS.
- Route model: locale-aware pages under `wiki/src/pages/[lang]`.
- Existing visual language: fantasy editorial tone with display heading font, readable body text, panel surfaces, and warm accent colors.

## Core UI Rules

- Keep layouts responsive by default (`mobile-first`, then `sm`, `md`, `lg` adjustments).
- Use existing visual tokens and utility patterns from `wiki/src/layouts/BaseLayout.astro` (`surface-panel`, `soft-divider`, `font-display`, accent vars).
- Prefer composition over one-off styling: reuse patterns from existing pages before introducing new styles.
- Keep reading comfort high: short line lengths, clear spacing rhythm, and strong contrast for text and interactive controls.
- Maintain clear interaction states for links/buttons (`default`, `hover`, `focus-visible`, `active`, and disabled where relevant).

## Core UX Rules

- Preserve information hierarchy: page title, context text, controls, then content grid/list.
- Keep primary actions obvious and secondary actions visually quieter.
- Avoid dead controls; if UI is not functional yet, do not render as interactive.
- Ensure keyboard navigation works across filters, links, and language controls.
- Keep locale behavior consistent: all new labels and controls must use i18n keys in `wiki/src/i18n/translations/`.

## Accessibility Baseline

- Use semantic landmarks and headings in order (`h1` once per page).
- Ensure controls have accessible names and visible focus states.
- Do not convey meaning by color only; include text/icon shape cues.
- Keep body text and metadata at readable sizes on small screens.
- Preserve adequate color contrast when adding new surfaces or accents.

## Motion and Feedback

- Use subtle, purposeful transitions (150-300ms) for hover/focus/enter states.
- Avoid heavy animation loops and distracting motion.
- Animate transform/opacity where possible, avoid layout-janking transitions.

## Implementation Workflow

When making UI/UX changes:

1. Inspect similar pages/components and match established patterns.
2. Add or adjust i18n strings for both `en` and `cn`.
3. Verify responsive behavior for narrow and wide viewports.
4. Run `pnpm --filter wiki run build` before finishing.

## Non-Goals

- Do not add a new design framework when UnoCSS utilities and existing styles are sufficient.
- Do not restyle the whole site for isolated feature changes.
- Do not introduce decorative complexity that harms readability or maintainability.
