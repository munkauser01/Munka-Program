import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const digest = (s) => createHash("sha256").update(s).digest("hex");
export function createServer({
  dbPath = "work/sync.sqlite",
  allowRegistration = false,
} = {}) {
  mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,password TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,userId TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,owner TEXT NOT NULL,kind TEXT NOT NULL,project TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL,data TEXT NOT NULL,deleted INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS members(project TEXT NOT NULL,userId TEXT NOT NULL,role TEXT NOT NULL,PRIMARY KEY(project,userId));
CREATE TABLE IF NOT EXISTS invitations(code TEXT PRIMARY KEY,project TEXT NOT NULL,email TEXT NOT NULL,role TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY,recordId TEXT NOT NULL,version INTEGER NOT NULL,data TEXT NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL);
`);
  const attempts = new Map();
  const validKinds = [
    "tasks",
    "courses",
    "terms",
    "projects",
    "events",
    "habits",
  ];
  const membership = (project, user) =>
    db
      .prepare("SELECT role FROM members WHERE project=? AND userId=?")
      .get(project, user)?.role;
  const projectOwner = (id) =>
    db
      .prepare(
        "SELECT owner FROM records WHERE id=? AND kind='projects' AND deleted=0",
      )
      .get(id)?.owner;
  const canRead = (r, user) =>
    r.project
      ? projectOwner(r.project) === user || !!membership(r.project, user)
      : r.owner === user;
  const canWrite = (r, user) =>
    r.project
      ? projectOwner(r.project) === user ||
        ["owner", "editor"].includes(membership(r.project, user))
      : r.owner === user;
  const fail = (status, message) => {
    const e = Error(message);
    e.status = status;
    throw e;
  };
  function authorizeProject(project, user, role = "owner") {
    const p = db
      .prepare(
        "SELECT * FROM records WHERE id=? AND kind='projects' AND deleted=0",
      )
      .get(project);
    if (!p || (p.owner !== user && membership(project, user) !== role))
      fail(403, "You do not have permission to manage this project.");
    return p;
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type",
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    try {
      let body = {};
      if (["POST", "PUT", "DELETE"].includes(req.method)) {
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 2_000_000) fail(413, "Request too large.");
        }
        try {
          body = JSON.parse(raw || "{}");
        } catch {
          fail(400, "Invalid JSON.");
        }
      }
      const url = new URL(req.url, "http://localhost");
      let result;
      if (url.pathname === "/health") {
        result = { ok: true };
      } else if (
        ["/auth/login", "/auth/register"].includes(url.pathname) &&
        req.method === "POST"
      ) {
        const key = req.socket.remoteAddress,
          rate = attempts.get(key) || { count: 0, start: Date.now() };
        if (Date.now() - rate.start > 600000) {
          rate.count = 0;
          rate.start = Date.now();
        }
        rate.count++;
        attempts.set(key, rate);
        if (rate.count > 30)
          fail(429, "Too many sign-in attempts. Try again later.");
        const email = String(body.email || "")
            .trim()
            .toLowerCase(),
          password = String(body.password || "");
        if (
          !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ||
          password.length < 12 ||
          password.length > 1024
        )
          fail(
            400,
            "Use an email address and a password of at least 12 characters.",
          );
        let user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
        if (url.pathname.endsWith("register")) {
          if (!allowRegistration)
            fail(
              403,
              "Registration is closed. Ask the server owner for access.",
            );
          if (user) fail(409, "An account already exists.");
          const salt = randomBytes(16).toString("hex");
          user = {
            id: randomUUID(),
            email,
            salt,
            password: scryptSync(password, salt, 64).toString("hex"),
          };
          db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(
            user.id,
            email,
            salt,
            user.password,
          );
        } else if (
          !user ||
          !timingSafeEqual(
            Buffer.from(user.password, "hex"),
            scryptSync(password, user.salt, 64),
          )
        )
          fail(401, "Email or password is incorrect.");
        const token = randomBytes(32).toString("base64url");
        db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
          digest(token),
          user.id,
          Date.now() + 7 * 86400000,
        );
        result = { token, user: { id: user.id, email: user.email } };
      } else {
        const token = req.headers.authorization?.replace(/^Bearer /, ""),
          session = token
            ? db
                .prepare("SELECT * FROM sessions WHERE token=? AND expires>?")
                .get(digest(token), Date.now())
            : null;
        if (!session) fail(401, "Sign in to continue.");
        const user = session.userId;
        if (url.pathname === "/auth/logout") {
          db.prepare("DELETE FROM sessions WHERE token=?").run(digest(token));
          result = { ok: true };
        } else if (url.pathname === "/records" && req.method === "GET") {
          result = {
            records: db
              .prepare("SELECT * FROM records")
              .all()
              .filter((r) => canRead(r, user))
              .map((r) => ({
                ...r,
                data: JSON.parse(r.data),
                role: r.project
                  ? membership(r.project, user) || "owner"
                  : "owner",
              })),
          };
        } else if (url.pathname === "/records" && req.method === "PUT") {
          if (!Array.isArray(body.records) || body.records.length > 10000)
            fail(400, "Invalid records.");
          db.exec("BEGIN IMMEDIATE");
          try {
            const saved = [];
            for (const incoming of body.records) {
              if (
                !incoming.id ||
                typeof incoming.id !== "string" ||
                !validKinds.includes(incoming.kind) ||
                typeof incoming.data !== "object" ||
                !incoming.data
              )
                fail(400, "Invalid record.");
              const old = db
                .prepare("SELECT * FROM records WHERE id=?")
                .get(incoming.id);
              if (old && !canWrite(old, user))
                fail(403, "This project is read-only.");
              if (old && old.kind !== incoming.kind)
                fail(400, "Record type cannot change.");
              if ((old?.version || 0) !== incoming.version)
                fail(409, "A record changed since preview. Synchronize again.");
              const project = String(incoming.project || "");
              if (
                project &&
                project !== incoming.id &&
                !["owner", "editor"].includes(membership(project, user))
              ) {
                const p = db
                  .prepare(
                    "SELECT * FROM records WHERE id=? AND kind='projects'",
                  )
                  .get(project);
                if (!p || p.owner !== user) fail(403, "Project access denied.");
              }
              if (
                old?.project &&
                old.project !== project &&
                membership(old.project, user) !== "owner"
              )
                fail(
                  403,
                  "Only an owner can move shared records out of a project.",
                );
              if (incoming.kind === "projects" && old && old.owner !== user)
                fail(403, "Only the owner can edit project settings.");
              const data = JSON.stringify(incoming.data);
              if (data.length > 200000) fail(413, "Record too large.");
              const version = (old?.version || 0) + 1;
              db.prepare(
                "INSERT INTO records VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET project=excluded.project,version=excluded.version,data=excluded.data,deleted=excluded.deleted",
              ).run(
                incoming.id,
                old?.owner || user,
                incoming.kind,
                project,
                version,
                data,
                incoming.deleted ? 1 : 0,
              );
              if (incoming.kind === "projects" && incoming.deleted) {
                db.prepare(
                  "UPDATE records SET deleted=1,version=version+1 WHERE project=? AND id<>?",
                ).run(incoming.id, incoming.id);
                db.prepare("DELETE FROM members WHERE project=?").run(
                  incoming.id,
                );
                db.prepare("DELETE FROM invitations WHERE project=?").run(
                  incoming.id,
                );
              }
              db.prepare(
                "INSERT INTO history(recordId,version,data,actor,at) VALUES(?,?,?,?,?)",
              ).run(incoming.id, version, data, user, new Date().toISOString());
              saved.push({ id: incoming.id, version });
            }
            db.exec("COMMIT");
            result = { saved };
          } catch (e) {
            db.exec("ROLLBACK");
            throw e;
          }
        } else if (url.pathname === "/invitations" && req.method === "POST") {
          authorizeProject(body.project, user);
          if (!["editor", "viewer"].includes(body.role) || !body.email)
            fail(400, "Choose an email and valid role.");
          db.prepare("INSERT OR IGNORE INTO members VALUES(?,?,?)").run(
            body.project,
            user,
            "owner",
          );
          const code = randomBytes(24).toString("base64url");
          db.prepare("INSERT INTO invitations VALUES(?,?,?,?,?)").run(
            digest(code),
            body.project,
            String(body.email).toLowerCase(),
            body.role,
            Date.now() + 7 * 86400000,
          );
          result = { code };
        } else if (
          url.pathname === "/invitations/accept" &&
          req.method === "POST"
        ) {
          const invite = db
              .prepare("SELECT * FROM invitations WHERE code=? AND expires>?")
              .get(digest(String(body.code)), Date.now()),
            email = db
              .prepare("SELECT email FROM users WHERE id=?")
              .get(user).email;
          if (!invite || invite.email !== email)
            fail(
              403,
              "Invitation is invalid, expired, or for another account.",
            );
          db.prepare(
            "INSERT INTO members VALUES(?,?,?) ON CONFLICT(project,userId) DO UPDATE SET role=excluded.role",
          ).run(invite.project, user, invite.role);
          db.prepare("DELETE FROM invitations WHERE code=?").run(
            digest(String(body.code)),
          );
          result = { project: invite.project };
        } else if (url.pathname === "/members" && req.method === "GET") {
          const project = url.searchParams.get("project");
          authorizeProject(project, user);
          result = {
            members: db
              .prepare(
                "SELECT members.userId,members.role,users.email FROM members JOIN users ON users.id=members.userId WHERE project=?",
              )
              .all(project),
          };
        } else if (url.pathname === "/members" && req.method === "DELETE") {
          if (body.userId !== user) authorizeProject(body.project, user);
          if (membership(body.project, body.userId) === "owner")
            fail(400, "Owners cannot leave without deleting the project.");
          db.prepare("DELETE FROM members WHERE project=? AND userId=?").run(
            body.project,
            body.userId,
          );
          result = { ok: true };
        } else if (url.pathname === "/history" && req.method === "GET") {
          const id = url.searchParams.get("id"),
            record = db.prepare("SELECT * FROM records WHERE id=?").get(id);
          if (!record || !canRead(record, user)) fail(403, "Access denied.");
          result = {
            history: db
              .prepare(
                "SELECT version,data,actor,at FROM history WHERE recordId=? ORDER BY id DESC LIMIT 100",
              )
              .all(id)
              .map((x) => ({ ...x, data: JSON.parse(x.data) })),
          };
        } else fail(404, "Not found.");
      }
      res.writeHead(200);
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(e.status || 500);
      res.end(
        JSON.stringify({
          error: e.status
            ? e.message
            : "The service could not complete the request.",
        }),
      );
    }
  });
  server.on("close", () => db.close());
  return server;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT || 4319);
  createServer({
    dbPath: process.env.MUNKA_DB || "work/sync.sqlite",
    allowRegistration: process.env.MUNKA_ALLOW_REGISTRATION === "true",
  }).listen(port, process.env.HOST || "127.0.0.1", () =>
    console.log(`Munka sync listening on ${port}`),
  );
}
