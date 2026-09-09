import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
test("daily and weekly reminders retain local time across daylight-saving changes", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import { initialState, task, complete } from './src/domain.mjs';
    const cases = [
      ['2026-03-07T09:00:00-05:00', 'Daily'],
      ['2026-10-31T09:00:00-04:00', 'Daily'],
      ['2026-03-01T09:00:00-05:00', 'Weekly'],
      ['2026-10-25T09:00:00-04:00', 'Weekly'],
    ];
    const results = cases.map(([reminder, recurrence]) => {
      const state = initialState();
      const item = task({ title: 'Study', date: reminder.slice(0,10), reminder, recurrence });
      state.tasks.push(item); complete(state, item.id);
      const next = state.tasks[1];
      return { hour: new Date(next.reminder).getHours(), elapsed: (new Date(next.reminder)-new Date(reminder))/3600000, date: next.date };
    });
    console.log(JSON.stringify(results));
  `,
    ],
    {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, TZ: "America/New_York" },
      encoding: "utf8",
      windowsHide: true,
    },
  );
  const results = JSON.parse(output);
  assert.deepEqual(
    results.map((r) => r.hour),
    [9, 9, 9, 9],
  );
  assert.deepEqual(
    results.map((r) => r.elapsed),
    [23, 25, 167, 169],
  );
  assert.deepEqual(
    results.map((r) => r.date),
    ["2026-03-08", "2026-11-01", "2026-03-08", "2026-11-01"],
  );
});
