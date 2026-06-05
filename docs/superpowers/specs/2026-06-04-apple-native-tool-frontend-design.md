# ReContent Apple-like Native Tool Frontend Design

Date: 2026-06-04
Status: Draft for review

## Goal

Upgrade the current ReContent frontend from a dark SaaS-style utility panel into an Apple-like native content tool: calm, premium, editorial, and immediately usable.

The product should remain a working single-page tool, not a landing page. The redesign should preserve the existing workflow while changing the visual language, hierarchy, and reading experience.

## Design Direction

Chosen direction: Native Tool minimalism with editorial output emphasis.

This means:

- Keep the app as a real working tool with input controls on the left and output on the right.
- Avoid heavy card stacking, startup-style chip emphasis, and dashboard density.
- Make the generated content area feel like a premium reading surface rather than a debug panel or response container.
- Borrow Apple-like interface qualities: restrained surfaces, careful typography, soft hierarchy, generous spacing, and minimal ornament.

## Product Principles

1. Immediate usability over marketing composition
2. Reading quality over card quantity
3. Calm hierarchy over bright emphasis
4. Native-feeling controls over decorative chips
5. Fewer visible boundaries, stronger typography

## Scope

This redesign covers:

- [app/page.tsx](/Users/juice/Desktop/vibe%20coding/ReContent/app/page.tsx)
- [app/layout.tsx](/Users/juice/Desktop/vibe%20coding/ReContent/app/layout.tsx)
- [app/globals.css](/Users/juice/Desktop/vibe%20coding/ReContent/app/globals.css)

This redesign does not change:

- API behavior
- platform generation logic
- URL extraction logic
- AI provider logic

## Current Problems

The current UI feels like a dark MVP dashboard:

- The interface is card-heavy and section-heavy.
- The visual weight is spread too evenly across inputs and outputs.
- The generated results are presented like utility boxes rather than polished content.
- Selection chips and controls feel more startup/SaaS than native or premium.
- The “MVP” framing and badge language make the product feel more like a prototype than a refined tool.

## Target Experience

The user should feel:

- this is a refined writing/content tool
- the workflow is obvious and efficient
- the result is the main artifact
- the interface is quiet enough to let the content breathe

The visual reference is not Apple product marketing hero composition. It is closer to an Apple-made productivity interface: restrained, editorial, and high quality.

## Information Architecture

The page remains a single screen with two primary zones:

1. Left column: input and controls
2. Right column: generated output

The right column becomes the dominant visual surface.

### Header

The header should be simplified:

- `ReContent` becomes the primary heading
- supporting copy becomes shorter and more product-like
- remove the current MVP badge and prototype-like framing

The header should signal polish, not demo status.

### Left Column

The left side remains the control area, containing:

- input mode segmented control
- source content input
- platform selection
- tone selection
- primary generate button
- inline error state

It should feel efficient and native, not crowded or attention-seeking.

### Right Column

The right side becomes the main content canvas.

Instead of rendering all platform outputs as equally weighted stacked cards:

- show one active platform as the main reading surface
- show the other platforms as lighter switching controls or secondary tabs
- treat the selected output like a finished content artifact

## Layout Strategy

Keep a two-column layout on desktop, but rebalance the proportions and internal spacing:

- left column: narrower and more compact
- right column: visually larger and more breathable

On smaller screens:

- preserve a logical reading order
- input first, result second
- the result surface must still feel premium rather than collapsing into generic stacked cards

## Component Redesign

### 1. Input Mode Switch

Replace the current pill-style toggle with a segmented-control treatment closer to macOS:

- cleaner shape
- lower contrast resting state
- softer active state
- less emoji-heavy presentation

The control should read as mode switching, not as playful toggle chips.

### 2. Source Input

The textarea and URL field should feel like quiet writing/import surfaces:

- larger inner padding
- lighter borders
- reduced contrast chrome
- more refined placeholder tone

The input should feel closer to a drafting surface than a form control.

### 3. Platform Selection

Keep the capsule structure, but redesign the state language:

- reduce startup-style outlined-chip feel
- use softer state shifts
- sharpen typography and spacing
- make active vs inactive states feel system-like

### 4. Tone Selection

Tone controls should visually align with platform controls, but remain secondary in weight:

- same family of controls
- quieter contrast than the primary action

### 5. Primary Action

The generate button should become a single restrained primary action:

- cleaner silhouette
- more native Apple-like emphasis
- less “CTA”
- slightly larger, but not loud

### 6. Result Navigation

Platform switching for results should move to a compact selector near the output header.

It should:

- avoid rendering three equally large result blocks
- let one platform remain in focus
- keep multi-platform generation clear without clutter

### 7. Result Surface

This is the centerpiece of the redesign.

Chosen output style: Editorial Pane.

Design rules:

- minimize heavy container framing
- increase typography quality
- give the active result larger line height and more whitespace
- make the output feel like a polished reading/editing surface
- keep copy actions small and quiet

For platform-specific output:

- LinkedIn should feel like a composed long-form post
- X/Twitter should feel compact and thread-like while preserving calm reading rhythm
- Xiaohongshu should support title + body hierarchy with stronger editorial separation

### 8. Empty State

The empty output state should feel like a waiting reading canvas, not a dashed placeholder box.

It should signal readiness without looking like a developer scaffold.

### 9. Error State

Errors should stay inline with the workflow but become more integrated:

- more intentional placement
- less raw system-alert appearance
- clear but restrained visual treatment

## Visual Language

### Color

Use a darker neutral base, less blue-leaning than the current palette.

Guidelines:

- base background: charcoal/neutral near-black
- primary text: soft Apple-like white, not harsh pure white
- secondary text: 2-3 disciplined gray tiers
- accent: one restrained blue for focus and action states only

Avoid:

- large saturated blue surfaces
- too many accent outlines
- purple or neon cues

### Surface Treatment

Do not use heavy glassmorphism or decorative floating cards.

Instead:

- subtle background elevation differences
- very light borders
- soft corners
- minimal shadowing

The result should feel precision-made, not effect-driven.

### Typography

Typography should carry more of the hierarchy than borders or fills.

Guidelines:

- use large type sparingly
- reserve larger scale for the product title and active result emphasis
- keep labels and control headings small and quiet
- use generous line-height for output content
- improve paragraph spacing so generated results feel intentionally typeset

### Spacing

Spacing is a primary quality lever.

Guidelines:

- larger vertical breathing room between major sections
- tighter, more disciplined spacing within controls
- much more comfortable reading rhythm inside the output surface

## Interaction Notes

- Hover states should be restrained and subtle.
- Focus states should be crisp and accessible.
- Transitions should be short and quiet, not animated for effect.
- Copy actions should stay available but visually secondary.

## Accessibility

The redesign must preserve or improve:

- keyboard accessibility
- visible focus states
- readable contrast in dark mode
- sensible text sizing for long-form output

The editorial direction must not reduce readability.

## Implementation Notes

Expected refactor direction:

- keep the feature in one page for now if possible
- small UI extraction is acceptable if it meaningfully clarifies the page
- prioritize result-area restructuring first, since that is the main chosen design priority

Recommended order:

1. establish color, spacing, and layout foundation
2. redesign header and left-side controls
3. restructure output into active-platform reading surface
4. refine empty and error states
5. polish spacing, typography, and platform-specific result presentation

## Verification

The redesign should be considered successful if:

1. The page still supports the existing full workflow without extra explanation.
2. The result area clearly feels more premium and editorial than before.
3. The page no longer reads like a generic AI dashboard.
4. The interface feels calmer, lighter, and more Apple-like without becoming a landing page.
5. Desktop and mobile both preserve clarity and reading quality.

## Risks

### Risk: too editorial, not enough tool

If the result area becomes too presentation-heavy, the page may lose usability.

Mitigation:

- keep controls efficient and explicit
- preserve clear platform switching
- keep copy action visible

### Risk: too little structure

If borders and surfaces are removed too aggressively, the page may feel unfinished.

Mitigation:

- use typography and spacing first
- keep just enough surface separation to guide scanning

### Risk: “Apple-like” becoming imitation

The goal is not to mimic Apple’s homepage layout literally.

Mitigation:

- keep the product’s real tool workflow
- borrow qualities, not brand-specific gimmicks

