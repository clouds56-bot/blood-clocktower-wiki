# Spec: UI Consistency Fix - Characters & Editions Pages

## Problem
The characters page and editions page have inconsistent UI patterns:

1. **Characters page** has a sticky filter/search panel above the grid
2. **Editions page** has no sticky panel - just a simple grid

This creates visual and UX inconsistency between the two directory pages.

## Goal
Make both pages follow the same UI pattern while preserving functionality.

## Options

### Option A: Add sticky panel to Editions page (Recommended)
Add a sticky filter/search panel to the editions page similar to characters page.

**Pros:**
- Consistent UX across directory pages
- Easy to add search/filter in future
- Matches established pattern

**Cons:**
- Adds complexity to editions page

### Option B: Remove sticky panel from Characters page
Simplify characters page to match editions page.

**Pros:**
- Simpler implementation
- Less code duplication

**Cons:**
- Loses useful search/filter functionality
- Not ideal for large character lists

## Recommendation: Option A

Add a sticky panel to the editions page. Even if we don't need search/filter now, it:
1. Creates consistent UX
2. Prepares for future enhancements
3. Follows the same pattern users expect

## Implementation Details

### Editions Page Structure (after fix)

```
[Sticky Panel - Top 64px]
├── Search input (optional for future)
└── Filter buttons (optional for future)

[Grid]
└── Edition cards
```

### Characters Page (no changes needed)
```
[Sticky Panel - Top 64px]
├── Search input
└── Type filter buttons

[Grid]
└── Character cards
```

### Styling Requirements

1. **Panel styling**: Use same `.surface-panel` class
2. **Positioning**: `sticky top-[64px] z-10`
3. **Search input**: Same styling as characters page
4. **Filter buttons**: Same rounded-full styling
5. **Grid**: Already consistent (both use `grid grid-cols-1 md:grid-cols-2 gap-6`)

## Acceptance Criteria

- [x] Both pages have consistent header structure
- [x] Both pages use same panel styling
- [x] Both pages have consistent spacing/padding
- [x] Mobile responsiveness matches
- [x] No visual regressions
- [x] Search functionality works
- [x] Filter buttons work

**Status:** ✅ Complete - Implemented on March 10, 2026

## Files to Modify

1. `/home/openclaw/workspace/blood-clocktower-wiki/wiki/src/pages/cn/editions/index.astro`
2. `/home/openclaw/workspace/blood-clocktower-wiki/wiki/src/pages/en/editions/index.astro`

## Notes

- Keep the edition card styling as-is (it's already good)
- Don't add search/filter functionality yet - just the UI structure
- Ensure the panel doesn't overlap content on scroll
