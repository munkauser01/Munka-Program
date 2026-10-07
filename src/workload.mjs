import { dateKey, validDate } from "./domain.mjs";
import { activePlannerTasks } from "./planner-selectors.mjs";
import { compareTasks } from "./task-order.mjs";

export function effort(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 1440)
    throw Error(
      "Choose an estimate between 1 and 1,440 minutes, or leave it blank.",
    );
  return n;
}
export function workload(state, day = dateKey()) {
  const planned = activePlannerTasks(state)
    .filter((t) => t.planDate === day)
    .sort(compareTasks);
  const open = planned.filter((t) => t.status !== "Done");
  const minutes = open.reduce((sum, t) => sum + (t.estimateMinutes || 0), 0);
  const unknown = open.filter((t) => !t.estimateMinutes).length;
  const capacity = state.preferences.dayBudgets?.[day] ?? null;
  return {
    planned,
    open,
    minutes,
    unknown,
    capacity,
    over: capacity !== null && minutes > capacity,
  };
}
export function applyDayPlan(state, day, entries, capacity, expected) {
  if (!validDate(day) || !Array.isArray(entries) || entries.length > 1000)
    throw Error("Choose a valid day and task list.");
  const budget = capacity === "" ? null : Number(capacity);
  if (
    budget !== null &&
    (!Number.isInteger(budget) || budget < 0 || budget > 1440)
  )
    throw Error("Available time must be between 0 and 1,440 minutes.");
  if (state.revision !== expected)
    throw Error(
      "Your planner changed. Close this review and open it again before saving.",
    );
  const ids = new Set(),
    changes = entries.map((entry) => {
      const t = state.tasks.find((t) => t.id === entry.id);
      if (!t || t._sync?.role === "viewer" || ids.has(t.id))
        throw Error(
          "A selected task is no longer editable. Reopen this review.",
        );
      ids.add(t.id);
      return {
        t,
        estimateMinutes: effort(entry.estimate),
        planDate: entry.selected
          ? day
          : t.planDate === day
            ? ""
            : t.planDate || "",
      };
    });
  const before = changes.map(({ t }) => ({
    id: t.id,
    planDate: t.planDate || "",
    estimateMinutes: t.estimateMinutes ?? null,
  }));
  const oldBudget = state.preferences.dayBudgets?.[day] ?? null;
  for (const change of changes)
    Object.assign(change.t, {
      planDate: change.planDate,
      estimateMinutes: change.estimateMinutes,
      updatedAt: new Date().toISOString(),
    });
  state.preferences.dayBudgets = {
    ...state.preferences.dayBudgets,
    [day]: budget,
  };
  return {
    day,
    before,
    oldBudget,
    after: changes.map(({ t }) => ({
      id: t.id,
      planDate: t.planDate,
      estimateMinutes: t.estimateMinutes,
    })),
    budget,
  };
}
export function undoDayPlan(state, change) {
  if (
    (state.preferences.dayBudgets?.[change.day] ?? null) !== change.budget ||
    change.after.some((a) => {
      const t = state.tasks.find((t) => t.id === a.id);
      return (
        !t ||
        t._sync?.role === "viewer" ||
        t.planDate !== a.planDate ||
        t.estimateMinutes !== a.estimateMinutes
      );
    })
  )
    throw Error("This plan changed again. Open Plan your day to adjust it.");
  for (const before of change.before)
    Object.assign(
      state.tasks.find((t) => t.id === before.id),
      before,
      { updatedAt: new Date().toISOString() },
    );
  state.preferences.dayBudgets[change.day] = change.oldBudget;
}
export const duration = (minutes) =>
  `${Math.floor(minutes / 60) ? Math.floor(minutes / 60) + "h " : ""}${minutes % 60 || !minutes ? (minutes % 60) + "m" : ""}`.trim();
