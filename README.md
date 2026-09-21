# MAKHZANI AI — مخزني

An Arabic-first inventory application with durable stock ledger, role checks, products/images/barcodes, batches, counts, transfers, suppliers and purchase receiving.

## Runtime and setup

Node 24+, pnpm 11.25.0. React/TypeScript, Vinext, Tailwind/shadcn/Radix, Drizzle schema, Cloudflare D1 and R2. This checkout targets Sites Workers; it is **not a PostgreSQL/standalone Next.js build**. Authentication is dispatch-owned ChatGPT sign-in, not passwords managed by this app. Deploy only behind the trusted dispatcher that sets authenticated identity headers.

```sh
corepack enable
pnpm install
pnpm build
pnpm db:migrate
pnpm dev
```

For managed Work preview, use `sites-preview start <absolute-project-path>` instead of starting the server manually. The local preview does not simulate real sign-in. API integration tests simulate only the trusted identity boundary and execute real application handlers against SQLite.

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm format
pnpm build
```

`pnpm db:generate` creates future migrations. Existing deployed migrations are immutable. `pnpm db:migrate` applies pending migrations to local D1, never production. Production migrations are applied through the Sites deployment pipeline.

## Using the app

Sign in, name your business, add products, then receive stock. Add warehouses and suppliers as required. Purchase orders progress from draft to sent to confirmed; receiving posts stock atomically, including partial deliveries. Employee roles cannot access purchasing costs, suppliers, purchases, reports, user administration or settings. The owner manages memberships by verified account email; platform site access must also permit those members before they can reach the application.

All quantity calculations use integer thousandths. Money uses integer hundredths. Outgoing stock uses earliest expiry then oldest receipt, skipping expired batches. Negative balances and stale counts are rejected within the database. Ledger and audit updates/deletes are blocked by triggers. Input, origin, tenant ownership, image signatures, size and request rate are checked server-side.

CSV exports paginate through the full dataset and neutralize spreadsheet formulas. Print supports PDF through the browser. Scanning uses ZXing; manual/USB entry works in the search field. Camera and voice depend on browser permissions and hardware. Product images are resized/compressed before upload.

## Current limits — read before commercial rollout

- This is a working implementation under verification, **not a completed production certification** of the entire master specification.
- Primary UI is Arabic RTL. English/Turkish currently change direction, speech language and welcome copy; full translation remains unfinished.
- Deterministic assistant and draft confirmation work. Cloud/local LLM, invoice OCR and official WhatsApp have provider interfaces only, no configured production adapters.
- Offline support retains an in-session stock snapshot and local movement drafts; offline cold-start inventory and background sync are not implemented. Reconnect requires explicit review. Clear device data after using a shared device.
- Purchase API accepts multiple items; the create form supports multiple items. Product selection currently uses the loaded inventory page.
- Reports currently cover 30-day movements, stock valuation, reorder estimates and CSV/print; custom date ranges, native XLSX and full supplier/loss analytics are pending.
- No automatic backups/restore drill, external penetration test, production load test, hardware camera test, or full signed-in mobile/desktop browser E2E has been completed.
- No standalone Docker/PostgreSQL deployment or S3 driver yet. Migration is possible but requires a separate adapter and PostgreSQL transaction/trigger port, not merely changing a URL.
- Units are custom labels with thousandth precision; packaging conversion factors, per-member permission overrides and negative-stock privileges are not implemented.

See `docs/PROJECT_STATE.md` for evidence and next steps. Demo fixtures only run in local/test databases and never seed production automatically. Dependency licenses are recorded in `docs/DEPENDENCIES.json`; retained shadcn source carries its original license notices.
