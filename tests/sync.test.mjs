import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../server/server.mjs";
import { SyncClient } from "../src/sync.mjs";
import { initialState, task, validateBackup } from "../src/domain.mjs";
test("revoked editors remove even shared tasks they originally created", async () => {
  const dir = mkdtempSync(join(tmpdir(), "munka-revoke-"));
  const server = createServer({
    dbPath: join(dir, "db.sqlite"),
    allowRegistration: true,
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const owner = new SyncClient(url),
      editor = new SyncClient(url);
    await owner.authenticate(
      "register",
      "owner@example.test",
      "twelve characters long",
    );
    await editor.authenticate(
      "register",
      "editor@example.test",
      "twelve characters long",
    );
    await owner.publishProject(
      { id: "shared-project", name: "Study group" },
      [],
    );
    const invitation = await owner.invite(
      "shared-project",
      "editor@example.test",
      "editor",
    );
    await editor.accept(invitation.code);
    let state = initialState();
    state = await editor.apply(state, await editor.preview(state), {});
    state.tasks.push(
      task({ title: "Editor contribution", project: "shared-project" }),
    );
    state = await editor.apply(state, await editor.preview(state), {});
    await owner.removeMember("shared-project", editor.user.id);
    state.tasks[0].notes = "Offline edit after access was removed";
    const preview = await editor.preview(state);
    assert.equal(preview.uploads.length, 0);
    state = await editor.apply(state, preview, {});
    assert.equal(state.projects.length, 0);
    assert.equal(state.tasks.length, 0);
  } finally {
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
test("two PCs merge independent edits, surface conflicts, and synchronize deletion", async () => {
  const dir = mkdtempSync(join(tmpdir(), "munka-sync-"));
  const server = createServer({
    dbPath: join(dir, "db.sqlite"),
    allowRegistration: true,
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const a = new SyncClient(url),
      b = new SyncClient(url);
    await a.authenticate(
      "register",
      "student@example.test",
      "twelve characters long",
    );
    await b.authenticate(
      "login",
      "student@example.test",
      "twelve characters long",
    );
    let sa = initialState(),
      sb = initialState();
    sa.tasks.push(task({ title: "Essay", notes: "Original" }));
    sa = await a.apply(sa, await a.preview(sa), {});
    sb = await b.apply(sb, await b.preview(sb), {});
    assert.equal(sb.tasks[0].title, "Essay");
    sa.tasks[0].notes = "PC A notes";
    sb.tasks[0].title = "PC B title";
    sa = await a.apply(sa, await a.preview(sa), {});
    const preview = await b.preview(sb);
    assert.equal(preview.conflicts.length, 0);
    sb = await b.apply(sb, preview, {});
    assert.equal(sb.tasks[0].title, "PC B title");
    assert.equal(sb.tasks[0].notes, "PC A notes");
    sa = await a.apply(sa, await a.preview(sa), {});
    sa.tasks[0].title = "A title";
    sb.tasks[0].title = "B title";
    sa = await a.apply(sa, await a.preview(sa), {});
    const conflict = await b.preview(sb);
    assert.equal(conflict.conflicts.length, 1);
    sb = await b.apply(sb, conflict, { "conflict-0": "remote" });
    assert.equal(sb.tasks[0].title, "A title");
    validateBackup(sb);
    sb.tasks = [];
    sb = await b.apply(sb, await b.preview(sb), {});
    sa = await a.apply(sa, await a.preview(sa), {});
    assert.equal(sa.tasks.length, 0);
  } finally {
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
