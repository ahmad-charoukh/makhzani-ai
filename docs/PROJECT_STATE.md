# MAKHZANI state

- Checkout: `/workspace/sites/makhzani-ai`; Sites project identity lives in `.openai/hosting.json`.
- React/Vinext + TypeScript strict, D1/SQLite/Drizzle, R2. Trusted dispatcher authentication with server RBAC.
- Implemented: scoped products, images, scanning/labels/QR, warehouse stock ledger, FEFO, expiry, counts with compare-and-set, atomic transfers, damage/returns, supplier payments, purchases/partial receipt, dashboards, audits, stock suggestions, deterministic assistant/voice drafts, limited offline drafts, CSV/print.
- Security: server membership checks, price redaction, prepared SQL, bounded bodies, image signatures, minute request limits, origin checking, immutable ledger/audit, negative quantity constraints.
- Verified so far: 46 unit/database/API tests passing, strict TypeScript and lint pass, first production build passes. Browser sign-in page renders without app errors.
- Pending before full master-spec acceptance: full EN/TR translation, actual auth browser E2E, mobile viewport E2E, configured OCR/LLM/WhatsApp adapters, full offline cold-start/sync, date-range reports/XLSX, image thumbnail derivatives, custom granular permissions/unit conversions, standalone PostgreSQL/S3/Docker, backups and load testing.
- Preview is stopped after the failed publication attempt. Next: resolve the migration boundary with platform diagnostics before another deployment.
- Commands: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`. Local migrations: see README.

## Publication blocker

- Source commit tested: 60157c05f30861a1fbf3587a482adc8a1b6c9768.
- Saved version: appgprj_6ab026e0585c8191b6b0e4e954ae6772~appgver_3a78937edb30819194dbc38fcae3057c (version 1).
- Deployment: appgdep_6ab0c173702c8191a57c4377d7e6ca95. Terminal status: failed; error `incomplete input: SQLITE_ERROR`.
- Live database overview returned zero visible bindings and tables after failure; this does not prove no migration statements were applied. Applied/unapplied boundary is unknown. Do not rewrite attempted migrations or retry the same deployment until the platform provides the exact failed migration and applied boundary.
- Suspected cause, unverified: platform SQL statement splitting of SQLite trigger bodies. All three migrations pass clean local Wrangler/D1 application and SQLite integration tests. Preserve transactional guards; do not remove protections merely to deploy.
- Final checks: 46 tests pass, TypeScript strict passes, lint passes without warnings, production build passes with code-split scanner/chart modules. Browser checks cover the logged-out desktop page only. Full signed-in E2E and mobile device tests remain pending.
- Source has been pushed to the Site source repository. No successful live URL exists.
