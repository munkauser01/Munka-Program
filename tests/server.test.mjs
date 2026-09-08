import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../server/server.mjs";
test("service enforces privacy, roles, invitation recipient, and optimistic concurrency", async () => {
  const dir = mkdtempSync(join(tmpdir(), "munka-test-"));
  const server = createServer({
    dbPath: join(dir, "test.sqlite"),
    allowRegistration: true,
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function req(path, method = "GET", body, token) {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json() };
  }
  try {
    const a = (
        await req("/auth/register", "POST", {
          email: "owner@example.test",
          password: "correct horse battery",
        })
      ).data,
      b = (
        await req("/auth/register", "POST", {
          email: "viewer@example.test",
          password: "correct horse battery",
        })
      ).data,
      c = (
        await req("/auth/register", "POST", {
          email: "outsider@example.test",
          password: "correct horse battery",
        })
      ).data;
    let r = await req(
      "/records",
      "PUT",
      {
        records: [
          {
            id: "p",
            kind: "projects",
            project: "p",
            version: 0,
            data: { id: "p", name: "Shared", shared: true },
          },
          {
            id: "t",
            kind: "tasks",
            project: "p",
            version: 0,
            data: { id: "t", title: "Shared task" },
          },
          {
            id: "private",
            kind: "tasks",
            project: "",
            version: 0,
            data: { id: "private", title: "Private task" },
          },
        ],
      },
      a.token,
    );
    assert.equal(r.status, 200);
    assert.equal(
      (await req("/records", "GET", null, b.token)).data.records.length,
      0,
    );
    const invite = (
      await req(
        "/invitations",
        "POST",
        { project: "p", email: "viewer@example.test", role: "viewer" },
        a.token,
      )
    ).data;
    assert.equal(
      (await req("/invitations/accept", "POST", { code: invite.code }, c.token))
        .status,
      403,
    );
    assert.equal(
      (await req("/invitations/accept", "POST", { code: invite.code }, b.token))
        .status,
      200,
    );
    const visible = (await req("/records", "GET", null, b.token)).data.records;
    assert.equal(visible.length, 2);
    assert.ok(!visible.some((r) => r.id === "private"));
    assert.equal(
      (
        await req(
          "/records",
          "PUT",
          {
            records: [
              {
                id: "t",
                kind: "tasks",
                project: "p",
                version: 1,
                data: { id: "t", title: "Unauthorized" },
              },
            ],
          },
          b.token,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          "/records",
          "PUT",
          {
            records: [
              {
                id: "t",
                kind: "tasks",
                project: "p",
                version: 0,
                data: { id: "t", title: "Stale" },
              },
            ],
          },
          a.token,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await req(
          "/members",
          "DELETE",
          { project: "p", userId: b.user.id },
          a.token,
        )
      ).status,
      200,
    );
    assert.equal(
      (await req("/records", "GET", null, b.token)).data.records.length,
      0,
    );
    assert.equal((await req("/records")).status, 401);
  } finally {
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
