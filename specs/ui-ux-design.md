# UI/UX Design Decisions (Grimoire Theme)

This document captures the UI/UX decisions for the interactive Blood on the Clocktower wiki.
Use this as the reference for future pages and components.

## Scope
- Target features: Character Directory and Character Detail Pages.
- Platform priority: Mobile-first, responsive to desktop.
- Visual direction: Grimoire-inspired, moody, tactile surfaces.

## Visual Direction
### Color Palette
- Background base: #0e0b12
- Surfaces: #16121f, #221b2e
- Text primary: #f5f2eb
- Text secondary: #d6d0c7
- Accent gold: #d7b46a
- Accent blue (good): #5aa2ff
- Accent red (evil): #ff5a5a

### Typography
- Display: Cinzel (headings, major titles)
- Body: Source Sans 3 (all body, UI labels)
- Use letter spacing in all-caps labels to reinforce the grimoire mood.

### Background
- Dark, layered gradients; avoid flat colors.
- Subtle radial glows to imply depth and atmosphere.

## Layout Patterns
### Global Layout
- Sticky header with blurred backdrop.
- Wide container (max-w-6xl) for desktop; padding-first for mobile.
- Footer muted with light gold separator line.

### Character Directory
- Sticky search + filter panel with pill filters.
- Token grid layout with circular avatars.
- Two-column grid on mobile, expanding to 3-4 columns on larger screens.
- Card: surface panel with token-ring and type badge.
- Type color ring:
  - Townsfolk/Outsider/Traveller/Fabled: blue ring.
  - Minion/Demon: red ring.

### Character Detail Page
- Hero token centered on mobile, left-aligned on desktop.
- Dossier header: uppercase label + Cinzel title + type/edition pills.
- Ability block: bordered panel, uppercase label, larger text.
- Tips/Examples: split into two surface panels on desktop.

## Interaction Patterns
- Hover: subtle lift and glow on cards.
- Filter chips: gold active state, dark inactive state.
- Focus: gold ring on inputs and active filters.

## Implementation Notes
- Use shared CSS custom properties defined in `wiki/src/layouts/BaseLayout.astro`.
- `surface-panel` and `token-ring` are reusable utility classes for panels and avatars.
- Keep all components accessible and touch-friendly (44px targets).
- Keep copy concise and scannable for mobile.
