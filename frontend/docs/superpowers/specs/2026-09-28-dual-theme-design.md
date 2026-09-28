# Docket — Dual-Theme (Dark Mode) & Visual Audit Design

**Date:** 2026-09-28
**Status:** Approved for implementation planning
**Scope:** Add a dark theme alongside Docket's existing "Warm Desk" light theme, with a toggle,
system-preference default, and persisted choice — plus a bounded visual audit for contrast and
hardcoded (non-token) colors that would silently break in dark mode. Explicitly **not** a redesign:
the existing light theme, typography, layout, spacing, and all shipped functional behavior
(task edit-mode permissions, optimistic concurrency, backend features) are unchanged.

This spec is downstream of a design-reference exploration during brainstorming (Linear's product
design language, from `frontend/design-md/linear.app/DESIGN.md`) and the project's third-party
`frontend/.agents/skills/design-taste-frontend` skill, whose generically-applicable quality-bar
rules (contrast, hardcoded-color hygiene, consistent shape/spacing) inform §4 — its
landing-page/marketing-specific rules (heroes, bento grids, GSAP scroll-hijack, testimonials) do
not apply to this app and are not used here, per that skill's own §13 ("Out of Scope: dashboards /
dense product UI").

**Important context this spec corrects for:** an earlier brainstorming pass on this same topic
assumed the codebase still had its original oxblood-accent light theme. Between that assumption
and this spec being written, a separate, already-shipped redesign (not part of this session)
replaced it with the "Warm Desk" theme verified below. This spec designs *from* Warm Desk as the
existing baseline, not from the stale oxblood assumption.

---

## 1. Current state (verified against `frontend/src/styles/tokens.css`, 2026-09-28)

Docket's light theme ("Warm Desk — soft paper + deep teal signal"):

```
--bg:              #f3f1ec   (warm paper background)
--bg-accent:       #e8e4db
--bg-glow:         rgba(15, 118, 110, 0.07)
--surface:         #fffefb
--surface-raised:  #f7f5f0
--surface-inset:   #efece5
--border:          #e4dfd4
--border-strong:   #d4cdc0
--text-primary:    #1c1917
--text-secondary:  #57534e
--text-muted:      #a8a29e

--accent:          #0f766e   (deep teal)
--accent-hover:    #0d5f59
--accent-soft:     rgba(15, 118, 110, 0.12)
--accent-contrast: #ffffff

--success:  #3f6212
--warning:  #b45309
--danger:   #b91c1c
--info:     #1d4ed8

--font-sans: "Outfit", system-ui, sans-serif        (self-hosted via @fontsource)
--font-mono: "JetBrains Mono", ui-monospace, ...     (self-hosted via @fontsource)

--radius-sm: 8px, --radius-md: 14px, --radius-lg: 18px
--shadow-soft, --shadow-elevated, --shadow-focus (accent-tinted)
--content-max: 880px
```

Text scale, spacing scale, motion tokens (`--ease-*`, `--duration-*`) are shared across both
themes and do not change in this pass.

**A hardcoded, non-token color already exists in `global.css`'s body background gradient:**
`rgba(180, 83, 9, 0.04)` (an orange glow, independent of any token). This is exactly the class of
issue §4's audit exists to catch — it must become a token (or be removed) so it can have a
theme-appropriate value, rather than silently persisting as a fixed light-mode-only tint under a
dark canvas.

## 2. Theming mechanism

- Dark values are added as an override block, `:root[data-theme="dark"] { ... }`, in
  `tokens.css`, alongside the existing `:root` (light) block. No component's CSS changes — every
  component already consumes `var(--*)`, so the override block is the only new surface.
- A `ThemeProvider` (new, `src/theme/ThemeContext.tsx`) exposes `theme: "light" | "dark"` and
  `setTheme`, sets the `data-theme` attribute on `document.documentElement`, and persists the
  choice to `localStorage` under the key `docket-theme`. On first visit (no stored value), it
  defaults to the OS preference via `window.matchMedia("(prefers-color-scheme: dark)")`.
- `index.html` gets a small inline `<script>` (before the app's root script tag) that reads
  `localStorage`/`prefers-color-scheme` synchronously and sets `data-theme` on `<html>` before
  React mounts. This is the standard fix for the flash-of-wrong-theme problem on page load — without
  it, the page would paint in the default theme for one frame before React's effect corrects it.
- A toggle control is added to `AppShell`'s topbar (`frontend/src/components/AppShell.tsx`),
  rendered as a small icon button (sun/moon) next to the existing nav items, calling
  `setTheme` from the new context.

## 3. Dark token values

Design intent: Linear's *structural* density (near-black canvas, charcoal panels, hairline
borders) grafted onto Docket's *own* palette identity — the teal accent and warm undertone are
kept, not replaced, matching the "don't change what's already shipped" instruction this spec
follows. The canvas leans warm (a near-black with a brown/amber undertone), not Linear's cool
blue-black, so the app still reads as "Docket" in dark mode, not "Linear."

```
--bg:              #171310   (warm near-black canvas)
--bg-accent:       #1f1a14
--bg-glow:         rgba(45, 212, 191, 0.08)   (teal glow, brighter to read against dark canvas)
--surface:         #1c1814   (warm charcoal panel)
--surface-raised:  #221d17
--surface-inset:   #14110d
--border:          #2e2820   (warm hairline)
--border-strong:   #3d352a
--text-primary:    #f5f1e8   (warm off-white, not pure white)
--text-secondary:  #b8ad9c
--text-muted:      #7d7263

--accent:          #2dd4bf   (brighter/more saturated teal — dark-mode accents need to lighten
                               to hold contrast against a near-black surface; this is the same
                               reason --accent-hover already differs from --accent in light mode)
--accent-hover:    #5eead4   (brightens further on hover, inverse of light mode's darken-on-hover,
                               matching how hover states read on dark UIs generally)
--accent-soft:     rgba(45, 212, 191, 0.16)
--accent-contrast: #0b1a17   (near-black text on the bright teal accent — white text would fail
                               contrast against a light, saturated teal button)

--success: #84cc16   (brighter lime — the light theme's #3f6212 olive would read muddy on near-black)
--warning: #fb923c
--danger:  #f87171
--info:    #60a5fa

--shadow-soft:     0 1px 0 rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.4)
--shadow-elevated: 0 12px 40px rgba(0, 0, 0, 0.5)
--shadow-focus:    0 0 0 3px var(--accent-soft)   (mechanism unchanged, uses the dark accent-soft)
```

Typography (`--font-sans`, `--font-mono`), the text/spacing/radius scales, and motion tokens are
unchanged — this is a palette swap, not a typography or layout change, per the approved design.

Every value above must pass WCAG AA (4.5:1 body text, 3:1 large text/UI components) against the
surface it's paired with — verify during implementation with actual contrast checks, not by eye.

## 4. Visual audit scope (the "improve it" half of this pass)

Bounded to two checks, both required for dual-theme correctness anyway (not open-ended polish):

1. **Hardcoded, non-token colors.** Grep every `.module.css` and `global.css` for literal `#`/`rgb`/`rgba`
   colors that aren't `var(--*)` references or pure structural values (e.g. `transparent`,
   `currentColor`). Each hit is either converted to an existing token, promoted to a new token (if
   it's a real, reused value with no home yet — e.g. the `rgba(180, 83, 9, 0.04)` orange glow in
   §1), or left with a written justification if it's genuinely theme-invariant (rare — most colors
   aren't). This is required: any hardcoded color silently fails to adapt when `data-theme="dark"`
   is set.
2. **Contrast audit.** For every text/background and button/background pairing across both
   themes, verify WCAG AA. Pay particular attention to: `--text-muted` against `--surface-inset`
   (the lowest-contrast pairing in the system), the status/priority pill components' backgrounds
   (built with `rgba()` opacity mixes against a variable canvas), and focus rings.

No layout, typography, spacing, or IA changes. No changes to functional behavior in
`ProjectSettingsPage.tsx`, `TaskDrawer.tsx`'s edit-mode logic, `taskPermissions.ts`, or any API
layer file — those are out of scope regardless of what the audit finds; if the audit surfaces a
non-visual bug in one of those files, it gets logged as a follow-up, not fixed in this pass.

## 5. Testing

- Manual verification in both themes via the dev server — every screen (Dashboard, Project
  Tasks/Members/Settings tabs, TaskDrawer, ConfirmDialog, auth screens) checked in light and dark,
  including the toggle itself and the no-flash-on-reload behavior. This is required by this
  project's own standards regardless of this spec (CLAUDE.md: "start the dev server and use the
  feature in a browser before reporting complete").
- A test for the theme toggle/context: renders, clicking flips `document.documentElement`'s
  `data-theme` attribute, and the choice persists to `localStorage` (mirroring this codebase's
  existing `bun:test` + Testing Library conventions).
- No new automated visual-regression tooling — not requested, and would be scope creep for a
  token-level change.

## 6. Explicitly out of scope

- Any change to the light theme's existing values, typography, or layout — it stays exactly as
  shipped.
- Any functional/behavioral change (task permissions, optimistic concurrency, backend features,
  routing, IA).
- Dialog focus-trap/Escape-to-close and responsive breakpoints — still deferred from the prior
  feature's final review, unchanged by this pass.
- Landing-page-specific guidance from the `design-taste-frontend` skill (heroes, bento grids,
  GSAP scroll effects, marquees, testimonials, image-asset strategy) — inapplicable to this
  product app, per that skill's own stated scope.
