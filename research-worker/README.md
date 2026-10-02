# Optional voluntary research backend (not yet deployed)

The public link remains **https://bitcoinforu2-ui.github.io/paycheck-audit/#peers**. It must never change. The application processes original payslips and attendance documents locally. A separate voluntary checkbox authorizes a one-time transfer of *rounded selected monthly metrics only* to a dedicated Cloudflare Worker.

## Security and privacy
- This feature is **disabled by default** in `research-config.mjs`. Keep it disabled until the backend is provisioned, privacy reviewed and tested.
- Host on a separate Cloudflare Worker over HTTPS (the visible user URL remains GitHub Pages). Set the CORS allowlist exactly to the GitHub Pages origin; CORS alone is not authentication.
- Create Cloudflare Turnstile widget for hostname `bitcoinforu2-ui.github.io`; protect ingestion with the corresponding Worker-only `TURNSTILE_SECRET`. A valid captcha is required every time.
- Store only role-comparability category and monthly metrics rounded **in the browser** (hourly to 5 NIS; major payroll components to 500 NIS). No names, identity numbers, source files, OCR text, free text or exact salaries are accepted.
- D1 stores consent version and purpose with the contribution. A receipt secret allows the participant to revoke their contribution. Never publish or log the receipt.
- Admin research output requires a secret `ADMIN_API_TOKEN` and shows only descriptive groups with at least **10 submitted contributions** for the same payslip month and job-similarity class. This is not proof of 10 distinct employees. Do not use the output as a public salary benchmark or individual underpayment finding.
- No third-party analytics; do not log POST bodies. Configure a retention and incident response policy and perform legal/privacy review before enabling production. If an archive is already exported, deletion from D1 does not delete that export.

## Setup actions needing Cloudflare account access
1. Create D1 database: `npx wrangler d1 create paycheck-research`; obtain database UUID.
2. Configure dedicated Worker project, not the site's root `wrangler.toml`, with:
   ```toml
   name = "paycheck-research-api"
   main = "research-worker/index.mjs"
   compatibility_date = "2026-10-02"
   [[d1_databases]]
   binding = "RESEARCH_DB"
   database_name = "paycheck-research"
   database_id = "<UUID from Cloudflare>"
   ```
3. Run `npx wrangler d1 execute paycheck-research --remote --file=research-worker/schema.sql`.
4. Set secrets on **the dedicated Worker**: `npx wrangler secret put TURNSTILE_SECRET` and `npx wrangler secret put ADMIN_API_TOKEN`. Use an independently generated long API token, not a person's password.
5. Deploy and confirm `POST /v1/contribute` rejects unconfigured, invalid consent, invalid captcha, unknown fields, and oversized requests. Confirm receipt deletion using `DELETE /v1/revoke`; confirm admin summary rejects missing/incorrect bearer tokens and outputs no cohort smaller than 10 contributions.
6. Only after verification, set `RESEARCH_API_URL` and the *public* Turnstile site key in `research-config.mjs`, run browser and security checks, then deploy the unchanged GitHub Pages URL. No user data is collected before this switch.

The first two coworkers can still use the existing optional **manual** file-sharing comparison. Automatic pooled research cannot claim meaningful cohort-level comparisons from just two or three submissions, and this deployment does not automatically modify salary-audit rules based on incoming samples. Improvements require reviewed analysis and regression testing.
