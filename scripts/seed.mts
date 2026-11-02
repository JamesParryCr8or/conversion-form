/**
 * Seeds the CR8OR AI sub-account and publishes the lead-gen starter template as a live form.
 * Idempotent. Run: npm run db:seed
 */
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "../src/db";
import { parseFunnel } from "../src/lib/funnel/io";
import template from "../src/lib/funnel/templates/lead-gen.json";

const SUB_ACCOUNT_SLUG = "cr8or-ai";
const FORM_SLUG = "lead-gen-starter";

const parsed = parseFunnel(template);
if (!parsed.ok) throw new Error(`Template invalid:\n${parsed.errors.join("\n")}`);

let [account] = await db.select().from(schema.subAccounts).where(eq(schema.subAccounts.slug, SUB_ACCOUNT_SLUG)).limit(1);
if (!account) {
  [account] = await db
    .insert(schema.subAccounts)
    .values({ id: nanoid(), name: "CR8OR AI", slug: SUB_ACCOUNT_SLUG })
    .returning();
  console.log("Created sub-account", account.slug);
}

const [existing] = await db.select().from(schema.forms).where(eq(schema.forms.slug, FORM_SLUG)).limit(1);
if (existing) {
  console.log(`Form "${FORM_SLUG}" already exists (${existing.status}). Nothing to do.`);
} else {
  const formId = nanoid();
  const versionId = nanoid();
  await db.insert(schema.forms).values({
    id: formId,
    subAccountId: account.id,
    name: parsed.funnel.form.name,
    slug: FORM_SLUG,
    status: "published",
    draft: parsed.funnel,
    publishedVersionId: versionId,
  });
  await db.insert(schema.formVersions).values({ id: versionId, formId, version: 1, funnel: parsed.funnel });
  console.log(`Published form "${FORM_SLUG}" -> /f/${FORM_SLUG}`);
}
