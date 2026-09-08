import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  task,
  complete,
  runRules,
  csvPreview,
  parseCSV,
  parseICS,
  validateBackup,
  mergeThreeWay,
  isQuiet,
  addDays,
  exportCSV,
  blocked,
  overlaps,
} from "../src/domain.mjs";
test("recurrence preserves history and produces only one next occurrence", () => {
  const s = initialState(),
    t = task({
      title: "Read",
      date: "2026-09-08",
      recurrence: "Weekly",
      subtasks: [{ title: "Chapter 1", done: true }],
    });
  s.tasks.push(t);
  complete(s, t.id);
  assert.equal(s.tasks.length, 2);
  assert.equal(s.tasks[1].date, "2026-09-15");
  assert.equal(s.tasks[1].subtasks[0].done, false);
  complete(s, t.id);
  complete(s, t.id);
  assert.equal(s.tasks.length, 2);
});
test("date-only task has no implicit timed reminder", () => {
  const t = task({ title: "Paper", date: "2026-09-08" });
  assert.equal(t.reminder, "");
  assert.throws(() => task({ title: "bad", date: "2026-02-30" }));
  assert.throws(() => task({ title: "bad", time: "09:00" }));
});
test("automation runs only once and respects pause", () => {
  const s = initialState(),
    t = task({ title: "Paper" });
  s.rules.push({
    id: "a",
    name: "Set priority",
    enabled: true,
    trigger: "created",
    action: "priority",
    value: "High",
  });
  runRules(s, "created", t);
  runRules(s, "created", t);
  assert.equal(t.priority, "High");
  assert.equal(s.logs.length, 1);
  s.preferences.automationPaused = true;
  const t2 = task({ title: "Second" });
  runRules(s, "created", t2);
  assert.equal(t2.priority, "Normal");
});
test("CSV handles embedded newlines and quoted commas; invalid rows block import", () => {
  const text =
    'title,date,notes\r\n"Essay, first draft",2026-09-08,"two\nlines"\r\nMissing,wrong,';
  const p = csvPreview(text);
  assert.equal(p[0].data.title, "Essay, first draft");
  assert.equal(p[0].data.notes, "two\nlines");
  assert.ok(p[1].error);
  assert.throws(() => parseCSV('a\n"unclosed'));
  assert.match(exportCSV([task({ title: "=SUM(A1)" })]), /\x27=SUM/);
});
test("backup validation rejects unsupported versions and duplicate IDs", () => {
  const s = initialState();
  s.tasks.push(task({ title: "Task" }));
  assert.equal(validateBackup(s).version, 1);
  assert.throws(() => validateBackup({ ...s, version: 99 }));
  s.tasks.push({ ...s.tasks[0] });
  assert.throws(() => validateBackup(s));
});
test("three-way merge keeps independent changes and exposes same-field conflicts", () => {
  const b = { title: "A", notes: "B" },
    l = { title: "Local", notes: "B" },
    r = { title: "A", notes: "Remote" };
  assert.deepEqual(mergeThreeWay(b, l, r).result, {
    title: "Local",
    notes: "Remote",
  });
  assert.equal(
    mergeThreeWay(b, l, { title: "Other", notes: "B" }).conflicts.length,
    1,
  );
});
test("quiet hours cross midnight and end exclusively", () => {
  const p = { quietEnabled: true, quietStart: "22:00", quietEnd: "08:00" };
  assert.equal(isQuiet(p, new Date("2026-09-08T23:00")), true);
  assert.equal(isQuiet(p, new Date("2026-09-09T07:59")), true);
  assert.equal(isQuiet(p, new Date("2026-09-09T08:00")), false);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});
test("calendar import UTC, all-day, escaped descriptions and unsupported recurrence", () => {
  const events = parseICS(
    "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:123\nSUMMARY:Study\\, reading\nDTSTART:20260908T150000Z\nDTEND:20260908T160000Z\nEND:VEVENT\nEND:VCALENDAR",
  );
  assert.equal(events[0].title, "Study, reading");
  assert.equal(events[0].start, "2026-09-08T15:00:00.000Z");
  assert.throws(() =>
    parseICS(
      "BEGIN:VEVENT\nSUMMARY:Class\nDTSTART:20260908\nRRULE:FREQ=WEEKLY\nEND:VEVENT",
    ),
  );
});
test("dependencies only indicate blocking and sessions do not move deadlines", () => {
  const s = initialState(),
    a = task({ title: "Outline" }),
    b = task({ title: "Essay", date: "2026-09-10", dependencies: [a.id] });
  s.tasks.push(a, b);
  assert.equal(blocked(s, b), true);
  complete(s, a.id);
  assert.equal(blocked(s, b), false);
  assert.equal(b.date, "2026-09-10");
  assert.equal(
    overlaps(
      { start: "2026-09-08T10:00", end: "2026-09-08T11:00" },
      { start: "2026-09-08T10:30", end: "2026-09-08T11:30" },
    ),
    true,
  );
});
