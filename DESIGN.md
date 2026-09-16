---
name: Executive Intelligence Interface
colors:
  surface: '#faf9fd'
  surface-dim: '#dbd9dd'
  surface-bright: '#faf9fd'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f3f7'
  surface-container: '#efedf1'
  surface-container-high: '#e9e7eb'
  surface-container-highest: '#e3e2e6'
  on-surface: '#1a1b1e'
  on-surface-variant: '#424654'
  inverse-surface: '#2f3033'
  inverse-on-surface: '#f1f0f4'
  outline: '#737785'
  outline-variant: '#c3c6d6'
  surface-tint: '#0856cf'
  primary: '#0041a2'
  on-primary: '#ffffff'
  primary-container: '#0b57d0'
  on-primary-container: '#ced9ff'
  inverse-primary: '#b2c5ff'
  secondary: '#006970'
  on-secondary: '#ffffff'
  secondary-container: '#97f1fa'
  on-secondary-container: '#006f77'
  tertiary: '#6f3a00'
  on-tertiary: '#ffffff'
  tertiary-container: '#914d00'
  on-tertiary-container: '#ffd1ae'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2ff'
  primary-fixed-dim: '#b2c5ff'
  on-primary-fixed: '#001847'
  on-primary-fixed-variant: '#0040a1'
  secondary-fixed: '#97f1fa'
  secondary-fixed-dim: '#7ad4dd'
  on-secondary-fixed: '#002022'
  on-secondary-fixed-variant: '#004f54'
  tertiary-fixed: '#ffdcc3'
  tertiary-fixed-dim: '#ffb77d'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6e3900'
  background: '#faf9fd'
  on-background: '#1a1b1e'
  surface-variant: '#e3e2e6'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-sm: 1rem
  gutter-lg: 2rem
  margin: 2rem
  margin-sm: 1rem
  margin-lg: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system delivers an authoritative, high-clarity competitive intelligence platform designed for startup founders, venture executives, and corporate strategists. The interface prioritizes signal over noise, translating high-velocity market shifts into clear, actionable intelligence.

The visual direction combines analytical discipline with an editorial aesthetic:
- **Tone:** Objective, decisive, precise, and unobtrusive.
- **Visual Movement:** Editorial Minimalism merged with restrained corporate utility. Information density is managed through deliberate white space, disciplined hierarchy, and hair-line border architecture rather than heavy fills or visual embellishments.
- **Interaction Ethos:** Swift, fluid, and predictable. Transitions operate strictly within a 150ms window to reinforce operational speed and immediate responsiveness.

## Colors

The color palette is rooted in functional utility and high-contrast legibility, using targeted color accents strictly for semantic hierarchy and delta tracking.

### Light Mode Architecture
- **Primary (`#0B57D0`):** System focus, key CTAs, and active navigational pivots.
- **Secondary (`#007A82`):** Strategic signals, cohort clusters, and secondary intelligence streams.
- **Tertiary (`#D97706`):** Moderate shifts, watchlists, and mid-tier priority notifications.
- **Neutral Surface Hierarchy:**
  - Canvas Base: `#FFFFFF`
  - Subtle Recessed Surface: `#F8F9FA`
  - Container / Card Surface: `#FFFFFF`
  - Card Hover / Sub-layer: `#F1F3F4`
  - Dividers and Outlines: `#E8EAED`
  - Secondary Text / Meta: `#5F6368`
  - Primary Text / Headings: `#202124`

### Semantic Indicators
- **Positive Delta / Additions:** `#188038` (Light) / `#81C995` (Dark)
- **Critical / Threat Alert:** `#D93025` (Light) / `#F28B82` (Dark)
- **Warning / Medium Alert:** `#D97706` (Light) / `#FDD663` (Dark)
- **Informational Metric:** `#1A73E8` (Light) / `#8AB4F8` (Dark)

### Dark Mode Architecture
- Canvas Background: `#131314`
- Elevated Container: `#1E1F22`
- Interactive Hover Surface: `#282A2D`
- Structural Hairline Borders: `#3C4043`
- Primary Typography: `#E8EAED`
- Secondary Typography: `#9AA0A6`

## Typography

The typographic hierarchy distinguishes between executive summary moments and dense analytical tables:
- **Headings (Plus Jakarta Sans):** Selected for its geometric balance and contemporary presence, serving as an accessible surrogate for modern editorial geometric sans-serifs. Retains clarity at larger scales without losing precision.
- **Body & Data Tables (Inter):** Highly calibrated for micro-reading, tabular density, and long-form operational briefings.
- **Numerical & Code Diffs (JetBrains Mono):** Reserved for technical tracking, metric changes, Git diffs, and exact API change feeds.

Letter spacing is tightened slightly across large headings to avoid loose display tracking and expanded across small labels to preserve scannability in data-dense tables.

## Layout & Spacing

The layout is anchored on an 8pt base grid system optimized for responsive, data-intensive software.

### Structure
- **Desktop (1200px+):** 12-column responsive fluid grid with max-width containment at `1440px`. Gutters set to `1.5rem` (`24px`), page outer margins set to `2rem` (`32px`) or `3rem` (`48px`) on wide monitors.
- **Tablet (768px - 1199px):** 8-column layout with `1rem` (`16px`) gutters and `1.5rem` (`24px`) margins. Multi-column radar feeds stack into unified two-column split panes.
- **Mobile (< 768px):** 4-column layout with `1rem` (`16px`) gutters and margins. Information blocks reflow linearly into vertical priority order; complex comparison matrices switch to swipeable snapshot cards.

Vertical rhythm adheres strictly to multiples of `4px` and `8px`. Dense analytical toolbars use compact `space-xs` (`4px`) and `space-sm` (`8px`) vertical distributions to maximize vertical viewport efficiency.

## Elevation & Depth

This system avoids expressive drop shadows in favor of low-contrast hairline outlines and subtle tonal depth.

- **Base Layer (Elevation 0):** Pure background surfaces (`#FFFFFF` in light, `#131314` in dark).
- **Surface Layer (Elevation 1):** Primary cards, feed modules, and data tables. Defined by a crisp 1px border (`#E8EAED` in light, `#3C4043` in dark) and an ultra-subtle, non-directional resting shadow: `0 1px 2px 0 rgba(60, 64, 67, 0.08)`.
- **Raised/Hover Layer (Elevation 2):** Applied to active cards on mouse-over, quick-view panes, or interactive chips: `0 2px 6px 0 rgba(60, 64, 67, 0.12)`.
- **Floating Layer (Elevation 3):** Dropdown menus, modal dialogs, and flyout intelligence sheets: `0 8px 24px -4px rgba(60, 64, 67, 0.16)`.
- **Borders & Dividers:** Always crisp 1px solid. Outlines define component structures rather than depth, keeping cognitive focus entirely on content analysis.

## Shapes

The design system maintains a refined, professional shape profile that reinforces precision:
- **Base Components (Inputs, Buttons, Badges):** `rounded-md` (`0.25rem` / `4px`) or `rounded-lg` (`0.5rem` / `8px`). Small radii retain a structured, technical aesthetic.
- **Structural Containers (Cards, Panels, Modals):** Standardized at `rounded-lg` (`0.5rem` / `8px`) with hard 1px outline boundaries.
- **Status Tags & Semantic Badges:** Compact pills with fully rounded borders (`9999px`) used only when tagging discrete categorical attributes to create visual contrast against square metric cards.

## Components

### Buttons
- **Primary:** Background `#0B57D0`, text `#FFFFFF`, border none, height `36px`, padding `0 16px`. Hover: `#0842A0`. Active transition `150ms ease-in-out`.
- **Secondary / Outlined:** Background `transparent`, border `1px solid #DADCE0`, text `#3C4043`. Hover: background `#F8F9FA`, border `#BDC1C6`.
- **Tertiary / Ghost:** Text `#1A73E8`, zero background or border. Hover: `#F1F3F4`.

### Cards & Intelligence Panels
- Container: Surface background with a 1px border (`#E8EAED`).
- Header: Minimal padding (`16px 20px`), border-bottom `1px solid #F1F3F4`, housing title, timestamp, and priority badge.
- Body: `20px` internal padding with structured key-value listings or typography blocks.

### Badges & Status Chips
- **High Severity / Immediate Threat:** Background `#FCE8E6`, text `#C5221F`, border `1px solid #FAD2CF`.
- **Medium Priority / Shift Detected:** Background `#FEF7E0`, text `#B06000`, border `1px solid #FEEFC3`.
- **Positive Diff / Feature Added:** Background `#E6F4EA`, text `#137333`, border `1px solid #CEEAD6`.
- **Format:** Height `20px`, padding `2px 8px`, font size `11px`, font weight `600`, tracking `0.02em`.

### Form Fields & Inputs
- Standard height `36px`. Background `#FFFFFF` (Dark: `#1E1F22`), border `1px solid #DADCE0` (Dark: `#3C4043`).
- Focus State: Border color `#0B57D0`, with a companion outer halo `box-shadow: 0 0 0 2px rgba(11, 87, 208, 0.2)`.

### Competitor Diff & Timeline Feeds
- Left-aligned chronological rail: `2px solid #E8EAED`.
- Diff insertion markers: Solid green dot (`#188038`) for product updates, amber (`#D97706`) for pricing model changes, and red (`#D93025`) for executive team departures.
- Inline code / metric changes formatted in `JetBrains Mono` with soft tinted pill backgrounds.
