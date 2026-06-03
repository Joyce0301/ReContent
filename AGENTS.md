# AGENTS.md

This file governs the whole repository. Follow these instructions whenever you edit files under this project.

## Project Context

- This is a Next.js App Router project for the ReContent MVP.
- The stack is Next.js, React, TypeScript, Tailwind CSS, OpenNext for Cloudflare, and Wrangler.
- The product is a Chinese-facing AI content repurposing tool. Keep user-facing copy clear, concise, and natural in Chinese unless the surrounding UI is already English.

## Commands

- Install dependencies with `npm install`.
- Run the development server with `npm run dev`.
- Build with `npm run build`.
- Preview the Cloudflare build with `npm run preview`.
- Deploy/upload only when explicitly requested: `npm run deploy` or `npm run upload`.
- Generate Cloudflare environment types with `npm run cf-typegen` when bindings or Wrangler environment types change.

Prefer `npm` because this repository contains `package-lock.json`. Do not introduce another package manager lockfile unless the user explicitly asks.

## Development Standards

- Keep changes small and directly tied to the requested task.
- Prefer existing project patterns over new abstractions.
- Use TypeScript types for request bodies, API responses, platform keys, and shared data shapes.
- Avoid `any`; if it is unavoidable, keep it tightly scoped and explain why with a short comment.
- Keep server-side code in route handlers or server utilities. Do not expose secrets or provider keys to client components.
- Validate all external input in API routes before using it.
- Handle network and model-provider failures with useful user-facing error messages and safe server logs.
- Do not commit generated build artifacts such as `.next`, `.wrangler`, `tsconfig.tsbuildinfo`, or local environment files.

## Frontend Standards

- Client components must start with `"use client";`.
- Build UI with accessible semantic HTML and Tailwind utility classes.
- Keep interactions obvious: disabled states, loading states, error states, and copy feedback should be handled when relevant.
- Keep mobile layouts usable. Check responsive behavior when editing `app/page.tsx` or global styles.
- Do not add marketing-style landing pages unless requested; this project should open on the usable content repurposing workflow.
- Preserve the focused MVP flow: input content, select platforms, select tone, generate, edit or copy results.

## AI and Content Generation

- Preserve the existing fallback behavior: when no provider key is configured, the app should still work with mock output.
- Do not invent facts, metrics, citations, or sources in prompts or generated sample content.
- When changing prompts, keep the JSON response contract strict and update parsing/validation accordingly.
- If adding providers, keep provider selection explicit and avoid leaking provider-specific details into client state.

## Testing and Verification

- Before finishing code changes, run the narrowest useful verification command.
- For general code changes, run `npm run build` when feasible.
- For UI changes, also start `npm run dev` and visually check the affected page when feasible.
- If a verification command cannot be run or fails for reasons outside the change, report that clearly.

## Git Hygiene

- Do not revert or overwrite user changes unless the user explicitly asks.
- Do not run destructive Git commands such as `git reset --hard` or `git checkout --` without explicit approval.
- Keep secrets out of Git. Use `.env.local` or `.dev.vars` for local keys.
- Keep local agent/runtime state out of source control, including `.omx/`.

## Documentation

- Update `README.md` when behavior, setup, environment variables, or deployment steps change.
- Keep documentation practical and specific to this repository.
