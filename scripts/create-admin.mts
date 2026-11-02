/**
 * Creates (or resets the password of) a super admin who can sign in to /admin.
 * Run in your own terminal:   npm run admin:create
 * The password is typed hidden and never printed or stored in plain text.
 */
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "../src/db";
import { hashPassword } from "../src/server/crypto";

if (!process.stdin.isTTY) {
  console.error("This needs an interactive terminal (run it yourself with: npm run admin:create).");
  process.exit(1);
}

function ask(prompt: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    let value = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(value);
        }
        if (ch === "\u0003") process.exit(130); // Ctrl-C
        if (ch === "\u007f" || ch === "\b") {
          if (value.length) {
            value = value.slice(0, -1);
            if (!hidden) process.stdout.write("\b \b");
          }
        } else {
          value += ch;
          if (!hidden) process.stdout.write(ch);
        }
      }
    };
    process.stdin.on("data", onData);
  });
}

const email = (await ask("Admin email: ")).trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  console.error("That doesn't look like an email address.");
  process.exit(1);
}

const password = await ask("Choose a password (12+ characters, hidden): ", true);
if (password.length < 12) {
  console.error("Too short. Use at least 12 characters (a few random words works well).");
  process.exit(1);
}
if ((await ask("Type it again: ", true)) !== password) {
  console.error("Those didn't match. Nothing was changed.");
  process.exit(1);
}

const passwordHash = await hashPassword(password);
const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);

if (existing) {
  await db.update(schema.users).set({ passwordHash, isSuperAdmin: true }).where(eq(schema.users.id, existing.id));
  console.log(`\nUpdated the password for ${email}.`);
} else {
  await db.insert(schema.users).values({ id: nanoid(), email, passwordHash, isSuperAdmin: true });
  console.log(`\nCreated admin ${email}.`);
}
console.log("You can now sign in at /admin/login.");
process.exit(0);
