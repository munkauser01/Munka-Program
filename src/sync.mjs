import { mergeThreeWay } from "./domain.mjs";
const kinds = ["projects", "terms", "courses", "tasks", "events", "habits"];
export class SyncClient {
  constructor(url) {
    const u = new URL(url);
    if (
      u.protocol !== "https:" &&
      !(
        u.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(u.hostname)
      )
    )
      throw Error("Use HTTPS for a remote sync service.");
    this.url = u.href.replace(/\/$/, "");
    this.token = "";
    this.user = null;
  }
  async request(path, method = "GET", body) {
    const r = await fetch(this.url + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: "Bearer " + this.token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error || "Synchronization failed.");
    return data;
  }
  async authenticate(mode, email, password) {
    const a = await this.request("/auth/" + mode, "POST", { email, password });
    this.token = a.token;
    this.user = a.user;
    return a;
  }
  async logout() {
    try {
      await this.request("/auth/logout", "POST", {});
    } finally {
      this.token = "";
    }
  }
  localRecords(s) {
    const result = [];
    for (const kind of kinds)
      for (const original of s[kind]) {
        const data = structuredClone(original);
        delete data._sync;
        let project =
          kind === "projects" && data.shared
            ? data.id
            : kind === "tasks" &&
                s.projects.some((p) => p.id === data.project && p.shared)
              ? data.project
              : "";
        if (project && kind === "tasks") {
          delete data.reminder;
          delete data.notifiedFor;
          delete data.course;
          delete data.dependencies;
        }
        result.push({ id: data.id, kind, project, data, deleted: 0 });
      }
    return result;
  }
  async preview(s) {
    const { records: remote } = await this.request("/records"),
      locals = this.localRecords(s),
      base = s.sync.base || {},
      uploads = [],
      downloads = [],
      conflicts = [],
      decisions = [];
    const localMap = new Map(locals.map((r) => [r.id, r])),
      remoteMap = new Map(remote.map((r) => [r.id, r]));
    for (const id of new Set([
      ...localMap.keys(),
      ...remoteMap.keys(),
      ...Object.keys(base),
    ])) {
      const l = localMap.get(id),
        r = remoteMap.get(id),
        b = base[id];
      if (!r && b?.project) {
        decisions.push({ id, kind: b.kind, remove: true });
        continue;
      }
      if (!r) {
        if (l) {
          uploads.push(l);
          decisions.push({ ...l, version: 0, upload: true });
        }
        continue;
      }
      if (!l) {
        if (b && !r.deleted) {
          if (JSON.stringify(r.data) !== JSON.stringify(b.data)) {
            const c = {
              id,
              title: r.data.title || r.data.name,
              field: "deleted",
              local: true,
              remote: false,
            };
            conflicts.push(c);
            decisions.push({ ...r, deleteConflict: conflicts.length - 1 });
          } else {
            uploads.push(r);
            decisions.push({ ...r, deleted: 1, upload: true });
          }
        } else {
          downloads.push(r);
          decisions.push({ ...r, remove: !!r.deleted });
        }
        continue;
      }
      if (r.deleted) {
        if (b && JSON.stringify(l.data) !== JSON.stringify(b.data)) {
          conflicts.push({
            id,
            title: l.data.title || l.data.name,
            field: "deleted",
            local: false,
            remote: true,
          });
          decisions.push({
            ...r,
            data: l.data,
            deleteConflict: conflicts.length - 1,
          });
        } else decisions.push({ ...r, remove: true });
        continue;
      }
      if (!b) {
        if (JSON.stringify(l.data) === JSON.stringify(r.data))
          decisions.push(r);
        else {
          const merged = mergeThreeWay({}, l.data, r.data);
          const indexes = merged.conflicts.map((c) => {
            conflicts.push({ ...c, id, title: l.data.title || l.data.name });
            return conflicts.length - 1;
          });
          decisions.push({
            ...r,
            data: merged.result,
            conflictIndexes: indexes,
            upload: r.role !== "viewer",
          });
          downloads.push(r);
        }
        continue;
      }
      const merged = mergeThreeWay(b.data, l.data, r.data);
      const indexes = merged.conflicts.map((c) => {
        conflicts.push({ ...c, id, title: l.data.title || l.data.name });
        return conflicts.length - 1;
      });
      const changed =
        JSON.stringify(merged.result) !== JSON.stringify(r.data) ||
        indexes.length > 0;
      if (changed && r.role === "viewer") {
        decisions.push(r);
        downloads.push(r);
        continue;
      }
      decisions.push({
        ...r,
        data: merged.result,
        conflictIndexes: indexes,
        upload: changed,
      });
      if (changed) uploads.push(l);
      if (JSON.stringify(l.data) !== JSON.stringify(r.data)) downloads.push(r);
    }
    return { uploads, downloads, conflicts, decisions };
  }
  async apply(s, preview, choices) {
    const next = structuredClone(s),
      writes = [];
    next.sync.base = {};
    for (const d of preview.decisions) {
      const r = structuredClone(d);
      for (const i of r.conflictIndexes || []) {
        const c = preview.conflicts[i];
        r.data[c.field] =
          choices[`conflict-${i}`] === "local" ? c.local : c.remote;
      }
      if (r.deleteConflict !== undefined) {
        const c = preview.conflicts[r.deleteConflict];
        r.deleted = Number(
          choices[`conflict-${r.deleteConflict}`] === "local"
            ? c.local
            : c.remote,
        );
        r.remove = !!r.deleted;
        r.upload = true;
      }
      if (r.upload)
        writes.push({
          id: r.id,
          kind: r.kind,
          project: r.project,
          version: r.version,
          data: r.data,
          deleted: r.deleted || 0,
        });
      next[r.kind] = next[r.kind].filter((x) => x.id !== r.id);
      if (!r.remove && !r.deleted) {
        const local = s[r.kind].find((x) => x.id === r.id);
        next[r.kind].push({
          ...r.data,
          ...(r.project && r.kind === "tasks"
            ? {
                reminder: local?.reminder || "",
                notifiedFor: local?.notifiedFor || "",
                course: local?.course || "",
                dependencies: local?.dependencies || [],
              }
            : {}),
          _sync: {
            role: r.role || "owner",
            owner: r.owner || this.user.id,
            project: r.project,
          },
        });
      }
      if (!r.remove)
        next.sync.base[r.id] = { ...r, owner: r.owner || this.user.id };
    }
    if (writes.length) {
      const result = await this.request("/records", "PUT", { records: writes });
      for (const { id, version } of result.saved)
        if (next.sync.base[id]) next.sync.base[id].version = version;
    }
    next.sync.pending = [];
    next.sync.conflicts = [];
    return next;
  }
  async publishProject(project, tasks) {
    const remote = (await this.request("/records")).records;
    const p = { ...project, shared: true };
    delete p._sync;
    const entries = [
      { id: p.id, kind: "projects", project: p.id, data: p },
      ...tasks.map((t) => {
        const data = { ...t };
        delete data._sync;
        delete data.reminder;
        delete data.notifiedFor;
        delete data.course;
        delete data.dependencies;
        return { id: t.id, kind: "tasks", project: p.id, data };
      }),
    ].map((r) => ({
      ...r,
      version: remote.find((x) => x.id === r.id)?.version || 0,
    }));
    await this.request("/records", "PUT", { records: entries });
  }
  invite(project, email, role) {
    return this.request("/invitations", "POST", { project, email, role });
  }
  accept(code) {
    return this.request("/invitations/accept", "POST", { code });
  }
  members(project) {
    return this.request("/members?project=" + encodeURIComponent(project));
  }
  removeMember(project, userId) {
    return this.request("/members", "DELETE", { project, userId });
  }
  history(id) {
    return this.request("/history?id=" + encodeURIComponent(id));
  }
}
