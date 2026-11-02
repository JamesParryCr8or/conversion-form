# Conversion Form — Build Plan

Perspective-style (one question per screen, mobile-first) form/funnel builder for CR8OR AI and 1–3 client sub-accounts. Every visitor gets a submission row the moment they start, data is pushed to the correct GoHighLevel sub-account, and conversions fire to Meta and Google.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `(?)` needs a decision

---

## 0. Decisions to lock first

- [x] **Hosting**: Vercel + **Turso** (hosted SQLite/libSQL, free tier). Local dev uses a plain SQLite file.
- [x] Use **Drizzle ORM** so switching SQLite → Postgres/Supabase later is a config change, not a rewrite.
- [x] Stack: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + Zod.
- [x] **Logins**: you (super admin) + client logins, each client limited to their own sub-account(s). See §3a.
- [x] **Image storage**: Vercel Blob.
- [ ] Future-proof for **self-serve customers** building their own funnels from templates (§8a). Not built at launch, but the data model and roles allow it from day one.
- [x] Email verification: **GHL Email ISV** `POST /email/verify` (server-side, once at submit). See [docs/validation-services.md](docs/validation-services.md).
- [x] **6-digit email code**: optional, per-form toggle (off by default).
- [x] **Email code sender: GHL.** We generate the code ourselves and send it through the sub-account's GHL Conversations API, so it comes from the client's own GHL email setup. Needs extra PIT scope `conversations/message.write`. Kept behind a sender adapter so Resend could be added later.
- [x] **Address provider**, behind our own `/api/address/*` contract so either can be swapped:
  - **UK → Royal Mail Address Finder API** (James has access; key in `ROYAL_MAIL_ADDRESS_VALIDATION_API`). Postcode → list of addresses, plus type-ahead if supported.
    - [ ] Get the exact endpoint docs / base URL for this API. It isn't listed on developer.royalmail.net, so the adapter needs the docs for the product the key belongs to.
    - Backup if needed: getAddress.io (licensed PAF reseller, same Royal Mail data).
  - **Outside UK → Google Places API (New)** autocomplete + place details.
  - Routing by the country selected on the form (default UK).
- [x] Phone input: `intl-tel-input` (v24+, version pinned) + server re-check with `libphonenumber-js`.
- [x] Phone OTP: **Twilio Verify v2**, authenticated with an API key (`SK...`) + secret, not the main auth token.
- [ ] Domains: one shared domain with `/f/[slug]`, plus optional custom domain per sub-account later.

---

## 1. Project setup

- [x] `git init`, `.gitignore`, `.env.example`
- [~] Scaffold Next.js 16 + TS + Tailwind 4 (done); shadcn/ui still to add
- [~] Drizzle + libSQL connection, schema, first migration applied locally (`local.db`). Still to do: create the Turso database + auth token and set `TURSO_*` env vars
- [ ] Create Vercel Blob store
- [ ] Env vars (platform defaults; sub-accounts can override in DB):
  - `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` (local dev: `file:local.db`)
  - `ENCRYPTION_KEY`, `AUTH_SECRET`
  - `BLOB_READ_WRITE_TOKEN` (Vercel Blob)
  - `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY`, `TWILIO_API_SECRET`, `TWILIO_VERIFY_SERVICE_SID`
  - `ROYAL_MAIL_ADDRESS_VALIDATION_API` (UK addresses)
  - `GOOGLE_MAPS_API_KEY` (international addresses; server key restricted to Places API, Google Cloud billing account required)
  - No secrets ever exposed to front-end code
- [ ] Lint/format (ESLint + Prettier), basic CI check
- [x] Delete placeholder `hello` file

---

## 2. Data model

- [ ] `users` — id, email, name, password hash / magic-link only, is_super_admin, created_at
- [ ] `memberships` — user_id, sub_account_id, role (`owner` / `editor` / `viewer`)
- [ ] `invites` — email, sub_account_id, role, token, expires_at
- [ ] `sub_accounts` — id, name, slug, timezone, branding (logo, colours, font), plan (for future self-serve)
- [ ] `sub_account_secrets` — encrypted at rest (AES-GCM with `ENCRYPTION_KEY`):
  - GHL Private Integration Token, GHL Location ID (PIT needs contacts scopes **plus `lc-email.readonly`** for email verification; verification charges bill to this location's wallet)
  - Meta Pixel ID, Meta CAPI access token, test event code
  - Google: GA4 measurement ID, GA4 API secret, Google Ads conversion ID/label, GTM container ID
  - Twilio: Account SID (`AC...`), API key (`SK...`), API secret, Verify Service SID (`VA...`), allowed OTP countries (fallback to platform default)
  - Address provider key (optional override)
  - Optional webhook URL (n8n etc.)
- [ ] `forms` — id, sub_account_id, name, slug, status (draft/published), theme, settings JSON, created_from_template_id
- [ ] `templates` — id, name, description, category, thumbnail, form JSON (same schema as export), visibility (`private` to a sub-account / `global` for all clients), created_by
- [ ] `share_links` — id, form_id or template_id, token, kind (`copy` = recipient can import a copy), expires_at, revoked
- [ ] `email_otps` — submission_id, email, code hash, attempts, expires_at (10 min), used_at
- [ ] `form_versions` — published snapshot of the question tree (so editing a live form doesn't break in-progress sessions)
- [ ] `questions` — id, form_id, key/slug (used in URLs), type, label, description, media (image/icon), options, validation, order, required
- [ ] `logic_rules` — question_id, conditions (JSON), action (jump to / skip / show / end screen)
- [ ] `submissions` — **id (UUID created on first view)**, form_id, form_version_id, status (started / partial / completed / verified), current_question_key, UTM + fbclid/gclid/fbp/fbc, IP, user agent, created/updated/completed timestamps
- [ ] `answers` — submission_id, question_key, value JSON, answered_at (upsert per question)
- [ ] `events_log` — submission_id, destination (meta/google/ghl/webhook), payload, response, status, retry count
- [ ] `verifications` — submission_id, channel (sms/call/whatsapp/email), target, status, attempts, sends_count, last_sent_at, expires_at
- [ ] Verification/contact columns on `submissions` (denormalised for quick filtering + GHL push):
  `email, email_status, email_risk, phone_e164, phone_verified, phone_verified_at, address_line1, address_line2, town, county, postcode, uprn`
- [ ] `email_checks` — email, result, risk, reason, raw JSON, checked_at (cache so the same email isn't re-billed)
- [ ] Field mapping table: form question → GHL standard field / custom field ID

---

## 3a. Auth & client logins

- [ ] Auth.js: email magic link + optional password (magic links sent via Resend or GHL, same sender as email OTP)
- [ ] Roles:
  - **Super admin** (you): everything, all sub-accounts, global templates
  - **Owner**: their sub-account's settings, credentials, users, forms, submissions
  - **Editor**: build/edit forms, view submissions; can't see or change credentials
  - **Viewer**: view submissions/reports only
- [ ] Invite flow: you invite a client by email → they set up login → land in their sub-account
- [ ] Sub-account switcher for users with multiple memberships
- [ ] **Data isolation**: every query scoped by sub_account_id via one server-side helper; tests that client A can never read client B's forms, submissions or secrets
- [ ] Secrets are write-only in the UI (shown masked, replace-only, never sent back to the browser)
- [ ] Super admin "view as client" for support
- [ ] Audit log: who changed credentials / published forms

## 3. Sub-account management (admin)

- [ ] Sub-account list + create/edit screen
- [ ] Credentials form with masked inputs, "test connection" buttons:
  - [ ] GHL: verify PIT + Location ID (fetch location, list custom fields) and confirm `lc-email.readonly` scope works
  - [ ] Meta: send a test CAPI event with test event code
  - [ ] Google: GA4 debug validation endpoint
  - [ ] Twilio: fetch the Verify service with the API key/secret
  - [ ] Address: test lookup of a known UK postcode (Royal Mail) + a non-UK address (Google)
- [ ] Pull GHL custom fields into a dropdown for field mapping
- [ ] Branding per sub-account (logo, colours, font) applied to its forms by default

---

## 4. Form renderer (public, the bit leads see)

- [x] Route `/f/[formSlug]` (custom domains later)
- [~] One-question-per-screen layout, Enter + tap navigation (done); smooth transitions still to do
- [x] Progress bar, back button
- [ ] Mobile-first, fast (target < 1s LCP, minimal JS on the public page)
- [x] Welcome screen, question screens, thank-you / end screens (multiple, chosen by logic), redirect-on-complete option
- [x] Hidden fields populated from URL params (UTMs, `fbclid`, `gclid`, any custom key)
- [ ] Prefill from URL params (`?name=James&email=...`)
- [ ] Accessibility: labels, focus states, ARIA, contrast

### 4a. Partial submissions + resume

- [x] Create `submission` row with unguessable id on first load (before any answer)
- [x] Store submission id in URL (`?sid=`). No cookie/localStorage, so it works in iframes
- [x] Autosave each answer on "next" (upsert into `answers`; failures repaired when the form completes)
- [x] Mark status `partial` once first answer is saved
- [ ] Push partials to GHL (create/update contact as soon as email or phone is captured), tag e.g. `form-partial`
- [ ] Optional: abandoned-lead webhook after X minutes without completion

### 4b. Question deep links

- [x] Each question addressable: `/f/[formSlug]?sid=<id>&q=<question-key>`
- [x] Update URL on each step (history.replaceState) so refresh works
- [x] Resume link: reloads existing answers and jumps to `q` (or where they left off)
- [x] Guard: if `q` is unreachable via logic, fall back to the right question
- [ ] Generate resume links for use in SMS/email follow-ups from GHL

### 4c. Iframe embedding (key requirement)

- [x] Public form routes (`/f/*`) embeddable: no `X-Frame-Options`, `Content-Security-Policy: frame-ancestors *`; every other route is `'none'`
  - Default: any site (`*`) so clients can embed anywhere
  - Optional per-form "allowed domains" list that locks `frame-ancestors` to those origins
  - Admin/editor/login routes stay **un-embeddable** (`frame-ancestors 'none'`) to prevent clickjacking
- [x] **No reliance on cookies or localStorage inside the iframe** (Safari/Chrome block or partition them in third-party frames). The submission id lives in the URL (`?sid=`) and is handed to the parent via postMessage so it survives a refresh
- [x] Auto-resize: form posts its height to the parent (`postMessage`), and a tiny `embed.js` resizes the iframe so there's no inner scrollbar
- [x] `embed.js` snippet that clients paste (`public/embed.js`): creates the iframe, **passes the parent page's URL params** (UTMs, `fbclid`, `gclid`) and the parent URL/referrer into the form, and handles resize
- [ ] Plain `<iframe src>` fallback code for builders that block scripts (GHL funnels, Wix, Squarespace, WordPress)
- [x] Parent ↔ form events via postMessage (`form:loaded`, `form:started`, `form:step`, `form:completed`) so the host page can react or fire its own tracking
- [x] Redirect-on-complete breaks out to the **top window** ("open calendar" later) (`window.top.location`) via postMessage, with an allow-listed origin check
- [ ] Tracking inside the iframe: Meta Pixel / GA4 run in the iframe, and the server-side CAPI event is the reliable backup if the browser blocks third-party scripts. Pass `fbp`/`fbc`/`gclid` from the parent via embed.js where available
- [ ] Mobile: `viewport` meta, no 100vh traps, keyboard doesn't cover inputs when embedded
- [ ] Embed modes: inline, full-width, popup/modal (button or timed), slide-in
- [ ] Embed code generator in the form's Share tab (copy button + live preview)
- [ ] Verify: Twilio/Google Places/intl-tel-input dropdowns still work in an iframe, and `autocomplete` works
- [ ] Test the embed on a plain HTML page, WordPress, a GHL funnel and Safari/iOS

**Still open in §4/§4c:**
- [ ] Per-form "allowed domains" for `frame-ancestors` (needs a request-time proxy; currently any site can embed)
- [ ] Unknown form slug shows the not-found UI but returns HTTP 200 (streaming); fix when adding caching
- [ ] Browser-test the renderer + iframe (Chrome extension wasn't connected; API flow is tested)
- [ ] Rate limiting on `/api` routes, bot protection (Turnstile + honeypot)
- [ ] Abandoned-lead webhook, push partials to GHL (§10)

---

## 5. Question types / blocks (plugin-style)

Each block = a self-contained module: `{ type, editorSchema, Renderer, EditorPanel, validate(), toGhl() }`, registered in a block registry so new ones are drop-in.

- [ ] Block registry + interface
- [x] Short text, long text
- [ ] Email (with verification, see §6)
- [x] **Phone — intl-tel-input** (pinned at 29.5.10; option names checked against its type definitions)
  - [x] Options: `initialCountry: "gb"` (per-form default), `countryOrder: ["gb","ie","us"]`, `loadUtils: () => import("intl-tel-input/utils")`, `strictMode: true`
  - [x] Wrap as a React component (`PhoneInput.tsx`, init/destroy on mount/unmount, loaded client-side only)
  - [x] Submit `iti.getNumber()` (E.164); client uses the same libphonenumber-js check as the server
  - [x] Server re-validates with `libphonenumber-js` before saving (also enforces the per-question country allow-list). Still needed: same check before sending an OTP
- [x] Single choice (buttons / cards with image or icon)
- [x] Multiple choice
- [ ] Image choice grid
- [x] Dropdown
- [ ] Number / currency / slider
- [ ] Date picker (locale-aware formatting via `Intl.DateTimeFormat`)
- [x] Yes / No
- [x] Rating / scale
- [ ] **Address (UK PAF lookup)**, built against our own contract so the provider can be swapped:
  - [ ] `GET /api/address/lookup?postcode=` → `{ addresses: [{ line1, line2, town, county, postcode, uprn }] }`
  - [ ] `GET /api/address/suggest?q=` → `{ suggestions: [{ id, label }] }`
  - [ ] `GET /api/address/retrieve?id=` → `{ address }`
  - [ ] **Royal Mail Address Finder adapter (UK)**: postcode → addresses, type-ahead + retrieve if the API supports it; map into our shape incl. UPRN (blocked on endpoint docs)
  - [ ] **Google Places (New) adapter (non-UK)**: Autocomplete + Place Details, mapped into our `{ line1, line2, town, county, postcode, country }` shape; use **session tokens** so a lookup is billed as one session, not per keystroke
  - [ ] Country switch on the address block: UK shows "Enter postcode → pick address"; other countries show type-ahead
  - [ ] Field-level toggles per form: UK only / UK + international
  - [ ] Normalise postcode (uppercase, single space before final 3 chars)
  - [ ] Debounce autocomplete ~250 ms + cache by query
  - [ ] Manual-entry fallback always available
  - [ ] Store structured address + UPRN
- [x] Consent / checkbox (GDPR / TCPA wording)
- [x] Statement / info screen (no input)
- [ ] Calendar embed (GHL calendar) as an end step
- [x] Hidden field
- [ ] File upload (later)

---

## 6. Verification

Full reference: [docs/validation-services.md](docs/validation-services.md). All third-party calls go through our server routes; keys never reach the browser.

### Phone OTP (Twilio Verify v2)
- [ ] Twilio client using API key + secret + `accountSid` (per sub-account, fallback to platform default)
- [ ] One Verify Service (`VA...`) per Twilio account, reused
- [ ] `POST /api/verify/phone/send` → server re-validates E.164, then `verifications.create({ to, channel })` → `pending`
- [ ] `POST /api/verify/phone/check` → `verificationChecks.create({ to, code })`; **only `approved` = success** (a wrong code returns `pending`, not an error)
- [ ] Mark `phone_verified` + `phone_verified_at` server-side only, after `approved`
- [ ] Code input screen (6-digit, `autocomplete="one-time-code"`, resend button with 30–60 s cooldown)
- [ ] Fallback channel: offer voice call / WhatsApp if SMS doesn't arrive
- [ ] Rate limits: per number (e.g. 5 sends/hour), per IP, resend cooldown
- [ ] Toll-fraud guard: country allow-list per sub-account (default UK only); enable Twilio Fraud Guard / programmable rate limits
- [ ] Per-form toggle: required / optional / off

### Email: in-field validation (browser, free)
- [ ] Live format check as they type (after first blur, so it doesn't nag mid-typing): red message / green tick
- [ ] Typo suggestions: "Did you mean james@gmail.com?" one-tap fix (gmial.com, hotmial.co.uk, .con, etc.)
- [ ] Block obvious junk: missing domain, spaces, double @, `test@test.com`
- [ ] `type="email"`, `inputmode="email"`, `autocomplete="email"` for mobile keyboards/autofill
- [ ] Next button stays disabled until the format is valid

### Email: deliverability check (GHL Email ISV, server)
- [ ] Server: `POST https://services.leadconnectorhq.com/email/verify?locationId=…` with headers `Authorization: Bearer <PIT>`, `Version: v3`, body `{ type: "email", verify: email }`
- [ ] Handle all 3 response shapes (full result / `verified:false` / `isEmailValid` only) + errors 400/401/422
- [ ] Decision table:
  - `deliverable` → accept
  - `catch_all`, `unknown` → accept, flag lower confidence
  - `undeliverable`, `do_not_send` → reject: "Please check your email address"
  - API error / not processed → **fail open** (don't block), log it
- [ ] Call **once** (when leaving the email step / on submit), never per keystroke: each check costs from the location wallet. Cache results in `email_checks`.
- [ ] Store `email_status` + `email_risk`; push to GHL as tag/field

### Email: 6-digit code (optional, per-form toggle, off by default)
- [ ] Only offered after the GHL deliverability check passes
- [ ] Generate a random 6-digit code server-side; store **hash only** in `email_otps`, 10-minute expiry, max 5 attempts
- [ ] Sender adapter: `sendEmailCode(to, code, subAccount)` → GHL Conversations API (contact is upserted first, which partial submissions already do)
- [ ] Branded email template per sub-account (logo, colours)
- [ ] Code screen (same component as phone OTP), resend with 30–60 s cooldown, rate limits per email + IP
- [ ] On success: `email_verified = true`, `email_verified_at`, tag in GHL

### Error states to handle
- [ ] Invalid email · undeliverable email · invalid phone · wrong code · expired code · too many attempts · provider down (fail open for email/address, clear message for OTP)

---

## 7. Conditional logic

- [ ] Rule model: IF (question) (operator) (value) [AND/OR ...] THEN (jump to question / end screen / skip)
- [ ] Operators: equals, not equals, contains, greater/less than, is answered, is empty, any of
- [ ] Conditions on hidden fields / URL params too (e.g. `utm_source = facebook`)
- [ ] Logic engine shared by renderer + editor preview (pure TS function, unit-tested)
- [ ] Answer piping: use earlier answers in later labels (`Thanks {{first_name}}`)
- [ ] Editor: logic panel per question + simple flow view showing branches
- [ ] Validation: detect dead ends / loops before publishing

---

## 8. Visual editor (admin)

- [ ] Three-pane layout: question list (drag to reorder) · live preview · settings panel
- [ ] Add question from block palette
- [ ] Inline edit labels/descriptions directly in the preview
- [ ] Fast media: drag-drop / paste image upload, auto-resize + WebP, icon picker (Lucide set + emoji)
- [ ] Theme editor: colours, font, button style, background image, logo
- [ ] Mobile / desktop preview toggle
- [ ] Duplicate form, duplicate question, form templates
- [ ] Draft vs published; publish creates a `form_version`
- [ ] Undo/redo, autosave drafts
- [ ] Field mapping tab: each question → GHL field

---

## 8a. Templates, sharing, import/export

### Funnel JSON format (the foundation for all of this)
- [x] Versioned schema: `{ schemaVersion: 1, form: { name, settings, theme }, questions: [...], logic: [...], endScreens: [...], media: [...] }`
- [x] Zod schema shared by export, import, templates and share links (`src/lib/funnel/schema.ts`)
- [x] Uses question **keys**, not database IDs, so it's portable
- [x] **Never includes secrets or sub-account data**: no tokens, pixel IDs, location IDs, GHL field mappings or submissions
- [ ] Images referenced by URL (Vercel Blob); on import, optionally copy them into the new account's storage
- [x] Migration function per schema version so old exports keep importing

### Export / import
- [ ] Export: "Download JSON" button on any form
- [ ] Import: upload or paste JSON → validate → preview → create as a new draft form in the chosen sub-account
- [ ] On import: fresh IDs, slug conflict handling, unknown block types reported clearly (not silently dropped)
- [ ] After import, prompt to set up field mapping + tracking for that sub-account

### Sharing
- [ ] **Public form link** for leads to fill in: `/f/[slug]` + copy button + QR code + embed code (iframe / popup script)
- [ ] **Share-a-copy link**: send a link to another account/client; they can preview it and click "Import into my account" (`share_links`, revocable, optional expiry)
- [ ] Preview-only link (no saving) for showing a client a draft

### Templates
- [ ] "Save as template" from any form (private to that sub-account)
- [ ] Super admin can publish templates globally (visible to all clients)
- [ ] Template gallery: thumbnail, category, preview, "Use this template"
- [~] Starter templates: lead gen (done, `src/lib/funnel/templates/lead-gen.json`); quote request, quiz funnel, booking qualifier still to do

### Future: self-serve customers (not at launch)
- [ ] Sign-up page that creates a user + sub-account
- [ ] Onboarding: connect GHL (PIT + location), Meta, Google, Twilio, with test buttons
- [ ] Pick a template → edit → publish
- [ ] Plans / limits per sub-account (forms, submissions, verifications), billing (Stripe or GoCardless)
- [ ] Usage metering for paid checks (GHL email checks, Twilio OTPs)

---

## 9. Tracking integrations

### Meta
- [ ] Browser Pixel loaded per form from sub-account config
- [ ] Events: `PageView`, `ViewContent` (start), custom `QuestionAnswered` (optional), `Lead` (complete or on contact captured — configurable), `CompleteRegistration` (verified)
- [ ] **Conversions API** server-side with the same `event_id` for deduplication
- [ ] Send hashed email/phone/name, `fbp`, `fbc` (built from `fbclid`), IP, user agent
- [ ] Test event code support
- [ ] Consent handling (don't fire until consent if required)

### Google
- [ ] GA4 via gtag (or GTM container if set)
- [ ] Google Ads conversion on complete, with Enhanced Conversions (hashed email/phone)
- [ ] GA4 Measurement Protocol server-side backup
- [ ] Capture + store `gclid`, `gbraid`, `wbraid`

### General
- [ ] Per-form choice of which step fires the "Lead" event
- [ ] `events_log` with retry on failure
- [ ] Debug view per submission: which events fired, responses

---

## 10. GoHighLevel delivery

- [ ] GHL API client using sub-account PIT + Location ID
- [ ] Upsert contact (match on email/phone), map standard + custom fields
- [ ] Tags: form name, `partial` / `completed` / `phone-verified` / `email-verified`
- [ ] Attribution: UTMs, source, ad IDs into custom fields
- [ ] Optional: create opportunity in chosen pipeline/stage
- [ ] Optional: add note with full Q&A transcript
- [ ] Retry queue + failure alerts
- [ ] Optional generic webhook per form (n8n)

---

## 11. Submissions dashboard

- [ ] Table per form: status, answers, verification, source, timestamps
- [ ] Filter by status (partial / completed / verified), date, sub-account
- [ ] Submission detail: answers, event log, resume link, "resend to GHL"
- [ ] Funnel drop-off per question (views → answers per step)
- [ ] CSV export

---

## 12. Security & compliance

- [ ] Encrypt secrets at rest; never send them to the browser
- [ ] Bot protection: Cloudflare Turnstile (invisible) + honeypot
- [ ] Rate limits on submission + verification endpoints
- [ ] Unguessable submission IDs (UUID v4 / nanoid) so resume links can't be enumerated
- [ ] GDPR: consent field, privacy link, data deletion per submission
- [ ] Backups (Turso / Litestream)

---

## 13. Launch

- [ ] Build first real form for CR8OR AI end-to-end
- [ ] Test: partial save, resume via link, deep link to a question, logic branches, phone OTP (correct, wrong, expired, resend cooldown, blocked country), email check (each `result` value + API down), address lookup + manual fallback, Meta test events, GA4 debug, GHL contact created in right location
- [ ] Set up sub-account #2 and confirm data isolation (nothing leaks into the wrong location)
- [ ] Deploy + custom domain
- [ ] Embed options: direct link, iframe embed, popup script (see §4c)

---

## Suggested build order

1. Setup + data model + funnel JSON schema (§1–2, §8a schema)
2. Auth + client logins + data isolation (§3a)
3. Renderer with 3–4 basic blocks + partial saves + deep links + **iframe-safe headers/resize from day one** (§4, §4c, §5 basics)
4. Sub-accounts + GHL delivery (§3, §10)
5. Phone block (intl-tel-input) + Twilio Verify + email in-field + GHL email verify + email code + address lookup (§5, §6)
6. Meta Pixel + CAPI, Google (§9)
7. Conditional logic (§7)
8. JSON import/export + share links (§8a). Until the editor exists, forms are written as JSON and imported.
9. Visual editor + templates (§8, §8a)
10. Dashboard, security hardening, launch (§11–13)

## Later / nice-to-have

- [ ] A/B test form variants
- [ ] Self-serve customer sign-up and billing (see §8a)
- [ ] AI form generator ("make me a solar lead form")
- [ ] Multi-language forms
- [ ] Move to Supabase if volume or features need it
