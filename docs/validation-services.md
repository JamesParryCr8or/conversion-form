# Validation Services Spec: Address, Email, Phone, OTP

Reference spec supplied by James (last checked against source docs: 16 Oct 2026). The build plan in `to-do.md` §5–6 follows this.

## 0. Summary

| Service | Purpose | Provider | Runs where |
|---|---|---|---|
| Address validation | UK postcode lookup / address autocomplete | **Royal Mail portal has no address API**: use a licensed PAF provider | Server (key stays secret) |
| Email validation | Check deliverability before saving a lead | GoHighLevel Email ISV `POST /email/verify` | Server |
| Phone input + country codes | Country flag/dial-code picker, E.164 formatting | `intl-tel-input` (browser lib) | Browser, re-check on server |
| Phone OTP (2FA) | Prove the user controls the number | Twilio Verify v2 | Server |

**Rule for all four:** third-party calls go through the backend. Never expose API keys in front-end code.

---

## 1. Keys (per sub-account where relevant)

| Key | Where to get it | Notes |
|---|---|---|
| Address API key | Chosen PAF provider's dashboard | Pick a provider first (section 2) |
| `GHL_PIT_TOKEN` | GHL sub-account: Settings > Private Integrations. Scopes: `contacts.readonly`, `contacts.write` (send leads), `locations.readonly` (connection test), `lc-email.readonly` (email checks) | Sub-account token, not agency |
| `GHL_LOCATION_ID` | GHL sub-account settings | Verification charges bill to this location |
| `TWILIO_ACCOUNT_SID` | Twilio Console home (`AC...`) | |
| `TWILIO_API_KEY` | Twilio Console > API keys (`SK...`) | Use an API key rather than the main auth token |
| `TWILIO_API_SECRET` | Shown once when the API key is created | Save immediately |
| `TWILIO_VERIFY_SERVICE_SID` | Twilio Console > Verify > Services (`VA...`) | Create one service, reuse it |

`intl-tel-input` needs no key.

---

## 2. Address validation

Source: https://developer.royalmail.net/api

The Royal Mail API Library lists only Delivery Office Finder, Electronic Customs Declaration, Local Collect v3 and Tracking v2. **There is no PAF / address lookup API there.** Delivery Office Finder returns the delivery office for a postcode, not addresses.

| Option | Notes |
|---|---|
| Royal Mail PAF licence direct | Licence-based, aimed at large volumes |
| Licensed PAF resellers (Ideal Postcodes, getAddress.io, Loqate) | Per-lookup REST APIs, simple keys. Check current pricing/terms |

**Chosen for this project:** Royal Mail Address Finder API for UK (James has a key: `ROYAL_MAIL_ADDRESS_VALIDATION_API`; endpoint docs still needed) and Google Places API (New) for non-UK addresses, both behind the contract below. getAddress.io is the backup for UK.

### Provider-agnostic contract

```
GET /api/address/lookup?postcode=M1 1AA
-> 200 { "addresses": [ { "line1": "", "line2": "", "town": "", "county": "", "postcode": "", "uprn": "" } ] }

GET /api/address/suggest?q=10 downing
-> 200 { "suggestions": [ { "id": "", "label": "" } ] }

GET /api/address/retrieve?id=...
-> 200 { "address": { ... } }
```

Rules: normalise postcodes (uppercase, single space before final 3 chars); debounce autocomplete ~250 ms and cache by query; always allow manual entry; store structured address + UPRN.

---

## 2b. Sending leads to GHL (built)

On completion the server upserts a contact (`POST /contacts/upsert`, matched on email) with name, phone, address and tags `cr8or-form` plus the form slug, then adds a note with every answer (`POST /contacts/{id}/notes`). Names come from questions keyed `first_name` / `last_name`, or `full_name` / `name` split on the first space. Failures are logged and can be retried from the form's Results page. Sending runs after the visitor's response, so it never delays them.

## 3. Email validation (GoHighLevel)

Docs: https://marketplace.gohighlevel.com/docs/ghl/email-isv/verify-email
LLM spec: https://marketplace.gohighlevel.com/docs/llms/v3/email-isv.md

`POST https://services.leadconnectorhq.com/email/verify?locationId={GHL_LOCATION_ID}`

Headers:
```
Authorization: Bearer {GHL_PIT_TOKEN}
Version: v3
Content-Type: application/json
```

Body: `{ "type": "email", "verify": "abc@xyz.com" }` (`type` can also be `contact`, with `verify` = contactId).

Success (201) returns one of:
1. `{ address, result: deliverable|undeliverable|do_not_send|unknown|catch_all, risk: high|low|medium|unknown, reason: [], leadConnectorRecommendation: { isEmailValid } }`
2. Not processed: `{ verified: false, message, address }`
3. Recommendation only: `{ isEmailValid }`

Errors: 400, 401, 422 (`message` is a string array on 422).

```js
export async function verifyEmail(email, { pit, locationId }) {
  const url = `https://services.leadconnectorhq.com/email/verify?locationId=${locationId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${pit}`, Version: "v3", "Content-Type": "application/json" },
    body: JSON.stringify({ type: "email", verify: email }),
  });
  if (!res.ok) throw new Error(`GHL verify failed: ${res.status}`);
  const d = await res.json();
  if (d.verified === false) return { ok: true, status: "unverified", raw: d }; // fail open
  const result = d.result;
  const valid = d.leadConnectorRecommendation?.isEmailValid ?? d.isEmailValid;
  return {
    ok: valid !== false && !["undeliverable", "do_not_send"].includes(result),
    status: result ?? "unknown",
    risk: d.risk ?? "unknown",
    raw: d,
  };
}
```

| `result` | Action |
|---|---|
| `deliverable` | Accept |
| `catch_all`, `unknown` | Accept, flag lower confidence |
| `undeliverable`, `do_not_send` | Reject: "Please check your email address" |
| API error / not processed | Fail open, log it |

Charges come from the location wallet: verify **once at submit**, not per keystroke. Cheap regex check client-side first.

---

## 4. Phone input (intl-tel-input)

Reference: https://github.com/robinske/intl-tel-input-example · Library: https://github.com/jackocnr/intl-tel-input
**Pin the version and check the README**: option names changed between majors.

```js
import intlTelInput from "intl-tel-input";
import "intl-tel-input/build/css/intlTelInput.css";

const iti = intlTelInput(input, {
  initialCountry: "gb",
  countryOrder: ["gb", "ie", "us"],
  loadUtils: () => import("intl-tel-input/utils"),
  strictMode: true,
});

if (!iti.isValidNumber()) { /* show "Enter a valid phone number" */ }
const e164 = iti.getNumber(); // "+447700900123"
```

Rules: always send E.164; re-validate on server (`libphonenumber-js` `isValidPhoneNumber` or Twilio Lookup) before sending an OTP; default `initialCountry` to the market served.

---

## 5. Phone OTP (Twilio Verify v2)

Docs: https://www.twilio.com/docs/verify/api · Base: `https://verify.twilio.com/v2/` · Basic auth with API key SID / secret.
Channels: `sms`, `call`, `whatsapp`, `email` (+ passkeys, SNA, TOTP, push).

```js
import twilio from "twilio";
const client = twilio(API_KEY, API_SECRET, { accountSid: ACCOUNT_SID });
const verify = client.verify.v2.services(VERIFY_SERVICE_SID);

export const sendOtp = async (e164, channel = "sms") =>
  (await verify.verifications.create({ to: e164, channel })).status; // "pending"

export const checkOtp = async (e164, code) =>
  (await verify.verificationChecks.create({ to: e164, code })).status === "approved";
```

Raw REST:
```bash
curl -X POST "https://verify.twilio.com/v2/Services/$VA_SID/Verifications" \
  --data-urlencode "To=+447700900123" --data-urlencode "Channel=sms" -u $KEY:$SECRET
curl -X POST "https://verify.twilio.com/v2/Services/$VA_SID/VerificationCheck" \
  --data-urlencode "To=+447700900123" --data-urlencode "Code=123456" -u $KEY:$SECRET
```

Rules:
- `approved` = correct. A wrong code returns `pending`, not an error.
- Mark verified **server-side only** after `approved`.
- Rate limits: per number (e.g. 5 sends/hour), per IP, resend cooldown 30–60 s.
- Toll-fraud guard: restrict allowed countries; see https://www.twilio.com/docs/verify/preventing-toll-fraud
- Fallback to voice/WhatsApp if SMS fails.

---

## 6. Combined flow

```
1. Client: format checks (email regex, iti.isValidNumber)
2. Server: GHL verifyEmail()      -> reject undeliverable / do_not_send
3. Server: address lookup/select  -> store structured address
4. Server: Twilio sendOtp(e164)   -> show code input
5. Server: Twilio checkOtp()      -> approved => phone_verified = true
6. Create/update lead record
```

Columns: `email, email_status, email_risk, phone_e164, phone_verified, phone_verified_at, address_line1, address_line2, town, county, postcode, uprn`
