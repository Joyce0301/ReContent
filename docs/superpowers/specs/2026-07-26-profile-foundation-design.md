# ReContent Profile Foundation Design

## Goal

Add a protected personal profile page that lets a signed-in ReContent user
inspect their existing account information and move between the profile and
workspace. This is the first isolated step toward avatar uploads, but it does
not add S3, Lambda, or database schema changes.

## Scope

This phase includes:

- Make the existing account identity area in the workspace header navigate to
  `/profile`.
- Add a protected `/profile` route.
- Display the current user's display name and email address.
- Display the current session expiry as account/session information.
- Provide a clear route back to `/workspace`.
- Keep the existing logout action available.
- Redirect unauthenticated visitors to `/auth`.
- Show the existing authentication-service-unavailable fallback when database
  configuration or session storage cannot be reached.
- Add focused tests for rendering, navigation, authentication redirects, and
  the unavailable state.

This phase explicitly excludes:

- Avatar selection or upload UI, including file inputs, drag-and-drop targets,
  upload buttons, presigned requests, or interactive upload placeholders.
- S3 buckets, presigned requests, Lambda functions, or IAM changes.
- Aurora/MySQL schema migrations.
- Editing the display name, email address, or password.
- A new profile API route.
- Changes to registration, login, logout, or session-cookie behavior.

## Existing Foundations

The current session contract already exposes:

- `user.id`
- `user.email`
- `user.displayName`
- `expiresAt`

The workspace server page resolves the current session and already handles
three relevant states:

1. A valid session renders the protected workspace.
2. No session redirects to `/auth`.
3. Database configuration or session-storage failure renders
   `AuthServiceUnavailable`.

The profile page will follow this established server-side pattern instead of
introducing a second authentication path.

Missing, invalid, or unverifiable session tokens currently resolve to no
session and redirect to `/auth`. A missing production session secret does not
currently surface as `AuthServiceUnavailable`; this phase preserves that
existing behavior.

## User Experience

### Workspace entry point

Only the avatar, display name, and email subgroup in the workspace account pill
becomes a `Link` to `/profile`. The logout button remains a sibling of that link
inside the outer account container. The implementation must not nest a button
inside a link or allow a logout click to trigger profile navigation.

The profile link has an accessible name that identifies it as the current
user's account, a visible keyboard focus treatment, and the same recognizable
avatar/name/email presentation as today.

### Profile page

The profile page uses the existing light ReContent visual language and contains:

- A compact ReContent/product header.
- A back-to-workspace action.
- The current avatar initial as a placeholder.
- Display name.
- Email address.
- Session expiry information presented in a user-readable format.
- A logout action.
- A static avatar placeholder that says avatar upload will be added next.

The avatar placeholder is informational only. It must not contain a file input,
button, drag-and-drop target, upload event handler, avatar URL field, database
column read, or presign/API call.

### Responsive behavior

On desktop, account identity and account details may sit in a two-column
composition. On mobile, they stack vertically. Long display names and email
addresses must wrap or truncate without widening the viewport, navigation and
logout controls may wrap without overlap, and interactive targets must remain
at least 44 pixels tall.

## Architecture

`app/profile/page.tsx` is a server component. It calls the existing
`getAuthSession()` helper and applies the same error handling used by
`app/workspace/page.tsx`.

The route has no client-side data fetch and no profile-specific API endpoint.
All displayed data comes from the authenticated server session. The displayed
expiry is `AuthSession.expiresAt` from the signed session payload; this phase
accepts the existing session contract and does not introduce a second expiry
source.

```text
GET /profile
  -> getAuthSession()
  -> valid session: render profile from session data
  -> no session: redirect /auth
  -> auth unavailable: render AuthServiceUnavailable
```

Presentation may be kept in the page component while it remains small. A
dedicated profile component should only be introduced if it materially improves
testability or keeps the server route focused.

## Data and Privacy

No new personal data is collected. The page displays only data that is already
loaded for the authenticated workspace.

The page must not expose:

- Password hashes.
- Session IDs.
- The signed session cookie.
- Database connection details.
- Internal user IDs in visible UI.

The session expiry may be displayed, but the underlying session token must
remain HTTP-only and inaccessible to client code.

## Failure Handling

- Missing, invalid, or unverifiable session: redirect to `/auth`.
- Database configuration or session storage unavailable: reuse
  `AuthServiceUnavailable`.
- Missing display name should continue to be rejected by the existing session
  resolver, which results in no session and a redirect to `/auth`, rather than
  an avatar-initial fallback in the profile UI.
- Session expiry formatting must use a deterministic fallback if a valid
  `expiresAt` value cannot be formatted.

## Testing

Add `app/profile/page.test.tsx` for the protected server route and
`app/components/recontent/header.test.tsx` for the account navigation boundary.
The server-page test mocks `getAuthSession()` and `next/navigation`'s
`redirect()` behavior so it can verify all route states without a real
database.

Add focused coverage for:

- A valid session renders display name, email, and session information.
- No session redirects to `/auth`.
- Database configuration or session-storage failure renders the unavailable
  fallback.
- An invalid `expiresAt` value renders deterministic fallback text without
  crashing the page.
- The workspace avatar/name/email subgroup links to `/profile`, has an
  accessible name, and is keyboard focusable.
- The logout button is a sibling action and is not nested inside the profile
  link.
- The profile page links back to `/workspace`.
- Logout remains independently operable.
- Rendered output does not contain a sentinel internal user ID, session ID,
  signed token, or cookie value.
- No file input, upload button, drag-and-drop target, or avatar upload request
  exists in this phase.
- Existing workspace generation behavior remains covered by
  `app/page.test.tsx`.

Before the phase is considered complete, run:

```bash
npx vitest run \
  app/profile/page.test.tsx \
  app/components/recontent/header.test.tsx \
  app/page.test.tsx \
  app/lib/auth/*.test.ts \
  app/api/auth/**/*.test.ts
npm run build
```

## Rollout

This phase is backward compatible because it adds one route and one navigation
link without changing persisted data or authentication contracts.

After this phase is merged and deployed successfully, the next isolated phase
can add avatar metadata columns and authenticated avatar upload APIs. S3 and
Lambda infrastructure remains a later phase so failures there cannot affect the
first profile-page release.
