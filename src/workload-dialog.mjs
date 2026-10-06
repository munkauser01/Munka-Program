import { dateKey } from "./domain.mjs";
import { activePlannerTasks } from "./planner-selectors.mjs";
import { compareTasks } from "./task-order.mjs";
import {
  workload,
  applyDayPlan,
  undoDayPlan,
  duration,
  effort,
} from "./workload.mjs";

export function workloadSummary(state, esc) {
  const w = workload(state);
  return `<section class="workload-summary" aria-label="Today's work plan"><div><h2>Your work plan</h2><p>${w.open.length ? `${w.open.length} planned · ${duration(w.minutes)} estimated${w.unknown ? ` · ${w.unknown} without estimates` : ""}` : "Choose what fits today. Deadlines stay where they are."}</p>${w.capacity !== null ? `<p class="${w.over ? "urgent" : "muted"} small">${w.over ? `${duration(w.minutes - w.capacity)} over your available task time` : `${duration(Math.max(0, w.capacity - w.minutes))} left after known estimates`}${w.unknown ? " · total is incomplete" : ""}</p>` : ""}</div><button data-action="day-plan">Plan your day</button></section>`;
}
export function openDayPlan({
  getState,
  save,
  drawer,
  field,
  esc,
  closeDrawer,
  toast,
}) {
  const state = getState(),
    day = dateKey(),
    revision = state.revision;
  const tasks = activePlannerTasks(state)
    .filter((t) => t.status !== "Done" && t._sync?.role !== "viewer")
    .sort(
      (a, b) =>
        Number(b.planDate === day) - Number(a.planDate === day) ||
        compareTasks(a, b),
    );
  if (tasks.length > 1000) {
    toast(
      "Use task details to plan work in a workspace with more than 1,000 open tasks.",
    );
    return;
  }
  const el = drawer(
    "Plan your day",
    `<div class="batch-body"><p>Pick work for today and estimate the time you want to spend. Moving work here never changes its deadline.</p>${field("Time available for tasks today (minutes)", "capacity", state.preferences.dayBudgets?.[day] ?? "", "number", 'min="0" max="1440" step="1" placeholder="For example, 120"')}<p class="muted small">After classes, meetings and breaks. Leave blank if you are unsure. This is your task budget, not the length of the calendar day.</p><label class="field"><span>Find a task</span><input type="search" id="plan-search" placeholder="Search this list"></label><div class="plan-tasks">${tasks.map((t, i) => `<fieldset class="plan-task" data-plan-title="${esc(t.title.toLowerCase())}"><legend class="sr-only">${esc(t.title)}</legend><label class="checkline"><input type="checkbox" name="pick-${i}" ${t.planDate === day ? "checked" : ""}><span>${esc(t.title)}<small>${t.date ? "Due " + esc(t.date) : "No deadline"}${t.planDate && t.planDate !== day ? " · Planned " + esc(t.planDate) : ""}</small></span></label>${field("Estimate (minutes)", "estimate-" + i, t.estimateMinutes ?? "", "number", 'min="1" max="1440" step="1" placeholder="Not sure"')}</fieldset>`).join("") || "<p>Add a task first, then return to plan your day.</p>"}</div></div><p id="plan-total" class="batch-summary" role="status" aria-live="polite"></p><div class="drawer-footer"><button type="button" id="cancel-plan">Cancel</button><button class="primary">Save day plan</button></div>`,
    async (form) => {
      const entries = tasks.map((t, i) => ({
        id: t.id,
        selected: form.has("pick-" + i),
        estimate: form.get("estimate-" + i),
      }));
      const change = applyDayPlan(
        getState(),
        day,
        entries,
        form.get("capacity"),
        revision,
      );
      if (!(await save())) return;
      closeDrawer();
      toast("Day plan saved. Deadlines unchanged.", async () => {
        try {
          undoDayPlan(getState(), change);
          await save();
        } catch (error) {
          toast(error.message);
        }
      });
    },
  );
  el.classList.add("batch-drawer");
  el.querySelector("#cancel-plan").onclick = closeDrawer;
  el.querySelector("#plan-search").oninput = (e) =>
    el
      .querySelectorAll("[data-plan-title]")
      .forEach(
        (row) =>
          (row.hidden = !row.dataset.planTitle.includes(
            e.target.value.toLowerCase(),
          )),
      );
  const update = () => {
    try {
      const f = new FormData(el.querySelector("form")),
        selected = tasks.map((_, i) => i).filter((i) => f.has("pick-" + i));
      const values = selected.map((i) => effort(f.get("estimate-" + i))),
        minutes = values.reduce((a, b) => a + (b || 0), 0),
        unknown = values.filter((v) => v === null).length;
      const budget = f.get("capacity"),
        over = budget !== "" && minutes > Number(budget);
      el.querySelector("#plan-total").textContent =
        `${selected.length} selected · ${duration(minutes)} known${unknown ? ` · ${unknown} need estimates` : ""}${over ? " · Over your available time" : ""}`;
      el.querySelector("#plan-total").classList.toggle("urgent", over);
    } catch (error) {
      el.querySelector("#plan-total").textContent = error.message;
    }
  };
  el.querySelector("form").addEventListener("input", update);
  update();
}
