# Marketing Campaigns Implementation Plan

**Goal:** Organize multiple generated drafts under an owner-scoped marketing brief.

**Architecture:** Reuse the current workspace, authentication, draft persistence, and generation workflow. Add a campaigns module, optional draft association, and an explicit pre-deployment migration.

**Tech Stack:** Next.js, React, MySQL/mysql2, Vitest, existing ECS deployment.

1. Add campaign types, bounded validation, owner-scoped store and API. Test create, update, missing/foreign IDs and malformed input.
2. Add nullable campaign draft association and filtering. Preserve standalone behavior, validate owners before writes, test both paths.
3. Resolve campaign briefs on the server and carry them through every generation attempt. Test normal and conservative prompts.
4. Add list/form/detail views inside the workspace; prefill sources and preserve association on history restoration. Test navigation, saving and failure states.
5. Add an idempotent MySQL migration using the existing pool, package it in the image, and run it as an ECS pre-deployment task. Test migration reruns and task failure handling.
6. Run targeted tests, required repurpose tests, lint and production build. Verify with a separate local MySQL database and browser at desktop/mobile widths; leave a working preview URL.
