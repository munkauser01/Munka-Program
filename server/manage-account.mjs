// Administrator-only CLI. Credentials arrive on standard input, never in command arguments.
import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function manageAccount(dbPath, { email, password, reset = false }) {
  email = String(email || "")
    .trim()
    .toLowerCase();
  if (
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ||
    email.length > 254 ||
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 1024 ||
    typeof reset !== "boolean"
  )
    throw Error(
      "Supply an email address and a password of 12–1024 characters.",
    );
  if (!existsSync(dbPath))
    throw Error("Start the service once to initialize its database.");
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA busy_timeout=5000");
  try {
    const existing = db
      .prepare("SELECT id FROM users WHERE email=?")
      .get(email);
    if (existing && !reset)
      throw Error(
        "Account exists. Set reset to true only to replace its password and revoke its sessions.",
      );
    if (!existing && reset)
      throw Error("Account not found. Nothing was changed.");
    const salt = randomBytes(16).toString("hex"),
      hash = scryptSync(password, salt, 64).toString("hex");
    db.exec("BEGIN IMMEDIATE");
    try {
      if (existing) {
        db.prepare("UPDATE users SET salt=?,password=? WHERE id=?").run(
          salt,
          hash,
          existing.id,
        );
        db.prepare("DELETE FROM sessions WHERE userId=?").run(existing.id);
      } else
        db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(
          randomUUID(),
          email,
          salt,
          hash,
        );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return {
      ok: true,
      action: existing ? "password-reset" : "account-created",
    };
  } finally {
    db.close();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.stdin.isTTY)
      throw Error(
        "Use the private account-input helper; credentials must be supplied on standard input.",
      );
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
      if (Buffer.byteLength(input) > 8192)
        throw Error("Account input is too large.");
    }
    const result = manageAccount(
      process.env.MUNKA_DB || "work/sync.sqlite",
      JSON.parse(input),
    );
    input = "";
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(
      error.message.startsWith("Account") ||
        error.message.startsWith("Supply") ||
        error.message.startsWith("Start") ||
        error.message.startsWith("Use")
        ? error.message
        : "Account setup failed. Check the database location and input format.",
    );
    process.exitCode = 1;
  }
}
