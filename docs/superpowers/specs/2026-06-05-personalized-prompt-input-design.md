# Personalized Prompt Input Design

- Date: 2026-06-05
- Project: ReContent
- Status: Approved in brainstorming, pending implementation plan

## Summary

Add one optional global free-text input to the existing repurpose workflow so users can layer personalized style guidance on top of the system prompt and existing tone presets. The new input will live under the existing "语气风格" section, use an Apple-inspired light gray visual treatment that still fits the current product, and apply to all requested platforms in a single generation request.

## Goals

- Let users add lightweight, natural-language style guidance such as "更像创始人发言" or "更有故事感".
- Keep the current workflow simple and one-screen.
- Preserve existing system prompt authority, platform rules, and JSON output constraints.
- Improve the visual quality of the left input panel with a light gray Apple-inspired control surface.

## Non-Goals

- No per-platform personalized instructions in this iteration.
- No advanced prompt builder, collapsible settings center, or multi-field tuning system.
- No change to result rendering structure or platform output schema.
- No attempt to let user input override system-level constraints.

## User Experience

### Placement

The new input appears inside the existing right-hand card of the left input panel, directly below the current "语气风格" chip group. This keeps all generation-control settings grouped together:

- `tone` remains the preset style selector.
- `customInstruction` becomes the free-form fine-tuning field.

This field is optional and always visible.

### Content Design

The field should include:

- Title: `个性化要求`
- Optional marker
- Helper text explaining that users can describe desired style, tone, or audience direction
- A multi-line input sized for short instructions
- 2-3 small example prompts shown as static hints below the field

Suggested examples:

- `更像创始人发言`
- `更故事化一点`
- `更适合创业者受众`

### Visual Direction

The left-side primary control surface should shift from the current dark treatment toward a light gray Apple-inspired panel:

- Soft light gray background with subtle gradient depth
- Rounded cards and pill controls with glass-like restraint
- Thin cool-gray borders and gentle inset highlights
- Retain blue accent usage for primary action and selected state clarity
- Preserve enough overall contrast so the page still feels related to the current result surface

The goal is not to mimic apple.com literally, but to borrow its calm, refined, low-noise visual language while fitting the existing product.

## Functional Behavior

### Frontend

In `app/page.tsx`:

- Add `customInstruction` state.
- Pass the value and setter into `InputPanel`.
- Include `customInstruction` in the request body sent to `/api/repurpose`.

In `app/components/recontent/input-panel.tsx`:

- Add a new optional textarea under the tone section.
- Add helper copy and static examples.
- Update styling of the left panel and nested cards to the new light gray direction.

### Backend

In `app/api/repurpose/route.ts`:

- Extend `RequestBody` with optional `customInstruction?: string`.
- Trim the value before use.
- If empty after trimming, ignore it completely.
- If present, append it to the prompt as additional user preference guidance.

The prompt hierarchy must remain:

1. System prompt and platform formatting rules
2. Existing tone preset
3. User-provided personalized guidance

The personalized guidance must never replace or weaken:

- JSON-only output requirement
- Platform-specific formatting rules
- Non-fabrication requirement

## Prompt Design

The current prompt structure should remain intact. The new field should be added as a short extra requirement inside the shared generation instructions.

Recommended wording shape:

- `附加个性化要求：${customInstruction}`
- Follow with a note that this guidance is supplemental and must not conflict with platform constraints or factual integrity

If the field is absent, no extra prompt line is added.

## Validation Rules

`customInstruction` should be treated as optional but bounded.

Recommended constraints:

- Trim leading and trailing whitespace
- Maximum length: 300 characters

Validation behavior:

- Frontend: light guidance only, plus optional character count or native max-length behavior
- Backend: enforce limit authoritatively
- Over-limit requests return `400`

Suggested backend error message:

- `个性化要求过长，请精简后重试`

## Error Handling

- Empty field: behave exactly like today
- Whitespace-only field: treat as empty
- Over-limit field: reject with `400`
- Model/provider errors: continue through existing error handling path

This keeps the new feature low-risk and predictable.

## Testing Scope

### Frontend

- The new field renders in the correct section.
- Helper copy and example hints are visible.
- Request submission includes `customInstruction` when populated.
- Empty submission does not send meaningful custom guidance content.

### Backend

- Request body accepts missing `customInstruction`.
- Prompt does not include the extra line when the field is empty.
- Prompt includes the extra line when the field is provided.
- Over-limit input returns the expected `400` error.

### Regression Coverage

- Existing tone-only flow still works.
- Existing multi-platform JSON result shape remains unchanged.
- Mock and model-backed generation paths continue to return valid results.

## Implementation Notes

- Keep the change scoped to the current repurpose flow.
- Follow current component boundaries rather than introducing a new form architecture.
- Favor a minimal API change over broad prompt refactoring.
- If the light gray visual refresh spreads beyond the left panel, keep the result area aligned enough that the product still feels cohesive.

## Acceptance Criteria

- Users can enter one optional personalized guidance string for a generation run.
- The field is displayed below "语气风格".
- The field applies globally to all selected platforms.
- The backend incorporates the value only as supplemental prompt guidance.
- Empty input preserves current behavior exactly.
- The left input panel uses the approved light gray Apple-inspired visual treatment.
- Existing generation and result behaviors remain intact.
