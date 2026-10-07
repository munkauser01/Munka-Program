import { syllabusCandidates } from "./syllabus-model.mjs";
export function openSyllabus({
  bridge,
  getState,
  refresh,
  drawer,
  field,
  select,
  esc,
  closeDrawer,
  toast,
}) {
  if (!bridge.syllabus) {
    toast("Syllabus files can be read in the Windows app.");
    return;
  }
  const el = drawer(
    "Import a syllabus",
    `<p>Read a PDF, Word document or text file on this PC, then review possible assignments beside their source.</p><p class="muted small">Up to 8 MB and 100 PDF pages. No upload or AI prompt is used. Scanned PDFs need a readable text layer. Tables and complex layouts may need manual correction.</p><div class="drawer-footer"><button class="primary">Choose document</button></div>`,
    async () => {
      const button = el.querySelector(".primary");
      button.disabled = true;
      button.textContent = "Reading document…";
      try {
        const doc = await bridge.syllabus("choose");
        if (!el.isConnected) {
          await bridge.syllabus("cancel");
          return;
        }
        if (doc) context(doc);
      } finally {
        button.disabled = false;
        button.textContent = "Choose document";
      }
    },
  );
  function context(doc) {
    drawer(
      "Check the document context",
      `<p>${esc(doc.filename)}</p>${select("Destination course", "course", "", [["", "Personal / no course"], ...getState().courses.map((c) => [c.id, c.name])])}${field("Year for dates without a year", "year", "", "number", 'min="2000" max="2100" placeholder="Leave blank if unsure"')}${select(
        "Numeric date order",
        "dateOrder",
        "MDY",
        [
          ["MDY", "Month / day"],
          ["DMY", "Day / month"],
        ],
      )}<p class="muted small">The chosen year is a suggestion for review. It will not be assumed from your PC clock. Times are left blank.</p><div class="drawer-footer"><button class="primary">Find possible tasks</button></div>`,
      (form) => review(doc, Object.fromEntries(form)),
    );
  }
  function review(doc, settings) {
    const candidates = syllabusCandidates(doc.blocks, settings);
    const el = drawer(
      "Review syllabus tasks",
      `<p>${esc(doc.filename)} · ${candidates.length} possible items. Nothing is selected automatically.</p><div class="syllabus-workspace"><section class="syllabus-candidates" aria-label="Possible tasks">${candidates.map((c, i) => `<fieldset class="syllabus-item"><legend>Item ${i + 1} · ${esc(c.location)}</legend><label class="checkline"><input type="checkbox" name="pick-${i}">Add this item</label>${field("Title", "title-" + i, c.title, "text", 'required maxlength="500"')}<div class="form-grid">${field("Deadline", "date-" + i, c.date, "date")}${select("Type", "kind-" + i, c.kind, ["Task", "Assignment", "Exam", "Personal"])}</div>${c.warning ? `<p class="small syllabus-warning">${esc(c.warning)}</p>` : ""}<label class="checkline"><input type="checkbox" name="undated-${i}">Keep without a deadline</label><label class="checkline"><input type="checkbox" name="confirm-${i}">I checked this task and date against the source</label><button type="button" class="quiet" data-source-index="${i}">Read source · ${esc(c.location)}</button></fieldset>`).join("") || "<p>No assignment-like passages were found. Review the extracted text, then use Paste tasks for anything you want to add.</p>"}</section><aside class="syllabus-source" aria-label="Source text"><h3>Source text</h3><p id="syllabus-location">${esc(doc.filename)}</p><pre id="syllabus-excerpt">${esc(doc.blocks.map((b) => b.location + "\n" + b.text).join("\n\n"))}</pre><p class="muted small">Only selected source excerpts are retained locally with imported tasks. The original file is not copied. Excerpts are not included in cloud sync or normal planner backups.</p></aside></div><p class="batch-summary" id="syllabus-count" role="status">Select items you want to add.</p><div class="drawer-footer"><button type="button" id="syllabus-back">Back</button><button class="primary" ${!candidates.length ? "disabled" : ""}>Add selected tasks</button></div>`,
      async (form) => {
        const rows = candidates.flatMap((c, i) =>
          form.has("pick-" + i)
            ? [
                {
                  id: c.id,
                  confirmed: form.has("confirm-" + i),
                  undated: form.has("undated-" + i),
                  draft: {
                    title: form.get("title-" + i),
                    date: form.get("date-" + i) || "",
                    time: "",
                    kind: form.get("kind-" + i),
                    course: settings.course,
                    notes: "",
                  },
                },
              ]
            : [],
        );
        const result = await bridge.syllabus("add", {
          id: doc.id,
          context: settings,
          rows,
        });
        await refresh();
        closeDrawer();
        toast(
          `${result.added} tasks added · ${result.skipped} duplicates skipped`,
          async () => {
            try {
              await bridge.syllabus("undo", { ticket: result.undo });
              await refresh();
              toast("Import undone.");
            } catch (error) {
              toast(error.message);
            }
          },
        );
      },
    );
    el.classList.add("syllabus-drawer");
    el.querySelector("#syllabus-back").onclick = () => context(doc);
    el.querySelectorAll("[data-source-index]").forEach(
      (button) =>
        (button.onclick = () => {
          const c = candidates[Number(button.dataset.sourceIndex)];
          el.querySelector("#syllabus-location").textContent = c.location;
          el.querySelector("#syllabus-excerpt").textContent = c.excerpt;
        }),
    );
    const update = () => {
      const form = new FormData(el.querySelector("form"));
      let count = 0;
      candidates.forEach((_, i) => {
        const picked = form.has("pick-" + i);
        if (picked) count++;
        el.querySelectorAll(
          `[name="title-${i}"],[name="date-${i}"],[name="kind-${i}"],[name="confirm-${i}"],[name="undated-${i}"]`,
        ).forEach((input) => (input.disabled = !picked));
        const undated = el.querySelector(`[name="undated-${i}"]`),
          date = el.querySelector(`[name="date-${i}"]`);
        if (picked && undated.checked) {
          date.value = "";
          date.disabled = true;
        }
      });
      el.querySelector("#syllabus-count").textContent =
        `${count} selected · check the source for every selected task`;
    };
    el.querySelector("form").addEventListener("change", update);
    update();
  }
}
