# Marketing Campaigns

Approved scope: personal campaigns containing a brief and multiple single-platform drafts. Keep independent creation and existing history. No team collaboration, scheduling, bulk generation, or automatic publishing.

The workspace gains a campaign list, a create/edit form, and a detail view with paginated drafts. A brief contains name, goal, audience, key message, CTA, and text or URL source material. Starting content pre-fills the source and attaches the campaign ID. Opening old history restores its campaign association. Changes to the brief do not rewrite saved drafts.

The server resolves campaign ownership from the authenticated session before generation, filtering drafts, or linking a saved draft. It includes the saved brief in both normal and conservative model attempts, as untrusted context subordinate to source facts and output rules. Standalone requests keep their current behavior.

MySQL stores campaigns and nullable draft campaign IDs. A composite foreign key enforces same-owner association. An idempotent, locked migration uses the existing MySQL connection helper and matches existing identity column collation. Deployment runs the migration in an isolated ECS task before updating the service, stopping on failure. No live database changes during local implementation.

Verification covers ownership, malformed/oversized input, migration reruns, brief propagation during retry, standalone drafts, save/load association, UI navigation, and desktop/mobile layout. Local preview uses a separate local database and mock generation without production credentials.
