const profiles = {
  college: {
    name: "College",
    detail: "Courses, assignments and study time.",
    kind: "Assignment",
  },
  school: {
    name: "High school",
    detail: "Classes, homework and activities.",
    kind: "Assignment",
  },
  work: {
    name: "Work & projects",
    detail: "Deadlines, projects and focused work.",
    kind: "Task",
  },
  personal: {
    name: "Everyday life",
    detail: "Routines, appointments and everything else.",
    kind: "Personal",
  },
};
export function onboardingDefaults(profile, focus) {
  if (!profiles[profile] || !["school", "projects", "balance"].includes(focus))
    throw Error("Choose a profile and a focus.");
  return {
    profile,
    focus,
    defaultTaskKind: profiles[profile].kind,
    onboardingVersion: 1,
  };
}
export function openOnboarding({
  getState,
  save,
  drawer,
  esc,
  closeDrawer,
  toast,
  bridge,
}) {
  const desktopOverlays = bridge?.capabilities?.overlays !== false;
  let profile = getState().preferences.profile || "college",
    focus = getState().preferences.focus || "balance";
  function first() {
    const el = drawer(
      "Make Munka yours",
      `<div class="welcome-brand"><img src="../assets/munka.png" alt="Munka hanging monkey"><span>Welcome to Munka</span></div><p>A couple of choices, then you can get going. What does your day look like?</p><div class="welcome-choices" role="group" aria-label="Your everyday life">${Object.entries(
        profiles,
      )
        .map(
          ([key, p]) =>
            `<button type="button" data-profile="${key}" aria-pressed="${profile === key}"><strong>${p.name}</strong><span>${p.detail}</span></button>`,
        )
        .join(
          "",
        )}</div><p class="small muted">You can change this later in Settings.</p><div class="drawer-footer"><button type="button" id="welcome-skip">Skip for now</button><button class="primary">Continue</button></div>`,
      () => second(),
    );
    el.classList.add("welcome-drawer");
    el.querySelectorAll("[data-profile]").forEach(
      (button) =>
        (button.onclick = () => {
          profile = button.dataset.profile;
          el.querySelectorAll("[data-profile]").forEach((b) =>
            b.setAttribute("aria-pressed", String(b === button)),
          );
        }),
    );
    el.querySelector("#welcome-skip").onclick = async () => {
      getState().preferences.onboardingVersion = 1;
      if (await save()) closeDrawer();
    };
  }
  function second() {
    const p = getState().preferences;
    const el = drawer(
      "A little focus goes a long way",
      `<div class="welcome-brand"><img src="../assets/munka.png" alt=""><span>Your Munka, your pace</span></div><p>What would you most like help keeping track of?</p><div class="welcome-choices" role="group" aria-label="Planning focus">${[
        ["school", "Schoolwork", "Keep assignments and exams in view."],
        [
          "projects",
          "Bigger projects",
          "Keep project work beside daily tasks.",
        ],
        [
          "balance",
          "A bit of everything",
          "Bring school, work and daily life together.",
        ],
      ]
        .map(
          ([id, title, detail]) =>
            `<button type="button" data-focus="${id}" aria-pressed="${focus === id}"><strong>${title}</strong><span>${detail}</span></button>`,
        )
        .join(
          "",
        )}</div><div class="welcome-settings" ${desktopOverlays ? '' : 'hidden'}><label class="checkline"><input type="checkbox" name="widget" ${p.widget ? "checked" : ""}>Keep tasks visible on my desktop</label><label class="checkline"><input type="checkbox" name="projects" ${p.widgetProjects ? "checked" : ""}>Show the project overlay too</label><label class="checkline"><input type="checkbox" name="privacy" ${p.privacy ? "checked" : ""}>Hide task names on desktop overlays</label></div><p class="small muted">${profiles[profile].kind === "Assignment" ? "New tasks will start as assignments." : "New tasks will start as " + profiles[profile].kind.toLowerCase() + " tasks."} ${desktopOverlays ? 'Desktop visibility is optional.' : 'Your plans stay on this device.'} Your existing tasks and deadlines stay as they are.</p><div class="drawer-footer"><button type="button" id="welcome-back">Back</button><button class="primary">Start planning</button></div>`,
      async (form) => {
        Object.assign(
          getState().preferences,
          onboardingDefaults(profile, focus),
          desktopOverlays ? {
            widget: form.has("widget"),
            widgetProjects: form.has("projects"),
            privacy: form.has("privacy"),
          } : {},
        );
        if (await save()) {
          closeDrawer();
          toast("Your planner is ready.");
        }
      },
    );
    el.classList.add("welcome-drawer");
    el.querySelector("#welcome-back").onclick = first;
    el.querySelectorAll("[data-focus]").forEach(
      (button) =>
        (button.onclick = () => {
          focus = button.dataset.focus;
          el.querySelectorAll("[data-focus]").forEach((b) =>
            b.setAttribute("aria-pressed", String(b === button)),
          );
          const projectToggle = el.querySelector("[name=projects]");
          if (projectToggle) projectToggle.checked = focus !== "school";
        }),
    );
  }
  first();
}
