const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { Worker } = require("node:worker_threads");
function readDocument(bytes, extension) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "document-worker.cjs"), {
      workerData: { bytes, extension },
      resourceLimits: {
        maxOldGenerationSizeMb: 192,
        maxYoungGenerationSizeMb: 32,
      },
    });
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(
      () =>
        finish(
          Error("Reading took too long. Try a smaller file or a TXT copy."),
        ),
      20000,
    );
    worker.once("message", (result) =>
      finish(result.error ? Error(result.error) : null, result.blocks),
    );
    worker.once("error", () =>
      finish(
        Error(
          "This document could not be read within the memory limit. Try a smaller file.",
        ),
      ),
    );
    worker.once("exit", () => {
      if (!settled)
        finish(Error("Document reading stopped. Try a smaller file."));
    });
  });
}
function createSyllabusService({
  directory,
  getState,
  commit,
  chooseFile,
  clock = () => Date.now(),
  extract = readDocument,
}) {
  let current = null,
    busy = false,
    generation = 0,
    lastImport = null;
  const folder = path.join(directory, "syllabus-sources");
  async function choose() {
    if (busy) throw Error("A document is already being read.");
    const file = await chooseFile();
    if (!file) return null;
    const extension = path.extname(file).slice(1).toLowerCase();
    if (!["pdf", "docx", "txt"].includes(extension))
      throw Error("Choose a PDF, DOCX or TXT file.");
    if (fs.statSync(file).size > 8 * 1024 * 1024)
      throw Error("Choose a file smaller than 8 MB.");
    const bytes = fs.readFileSync(file);
    const ticket = ++generation;
    current = null;
    busy = true;
    try {
      const blocks = await extract(bytes, extension);
      if (ticket !== generation) throw Error("Import cancelled.");
      current = {
        id: crypto.randomUUID(),
        filename: path.basename(file),
        hash: crypto.createHash("sha256").update(bytes).digest("hex"),
        blocks,
        at: clock(),
      };
      return { id: current.id, filename: current.filename, blocks };
    } finally {
      busy = false;
    }
  }
  function requireCurrent(id) {
    if (!current || current.id !== id || clock() - current.at > 30 * 60000)
      throw Error("This review expired. Choose the document again.");
    return current;
  }
  async function add({ id, context, rows }) {
    const doc = requireCurrent(id);
    if (!Array.isArray(rows) || !rows.length || rows.length > 150)
      throw Error("Select between 1 and 150 items.");
    const { syllabusCandidates } = await import("../src/syllabus-model.mjs");
    const { prepareTaskBatch } = await import("../src/batch-tasks.mjs");
    const { validateTaskDraft } = await import("../src/task-drafts.mjs");
    const { task } = await import("../src/domain.mjs");
    const candidates = new Map(
      syllabusCandidates(doc.blocks, context).map((c) => [c.id, c]),
    );
    const state = getState(),
      seen = new Set();
    const prepared = [];
    for (const row of rows) {
      if (
        !row ||
        !candidates.has(row.id) ||
        seen.has(row.id) ||
        row.confirmed !== true
      )
        throw Error("Confirm each selected item against its source.");
      seen.add(row.id);
      const draft = validateTaskDraft(row.draft, state);
      if (!draft.date && row.undated !== true)
        throw Error("Confirm no deadline for undated items.");
      const source = candidates.get(row.id);
      // Reuse duplicate semantics against fresh state and earlier selected candidates.
      const result = prepareTaskBatch([draft], {
        ...state,
        tasks: [...state.tasks, ...prepared.map((p) => p.task)],
      });
      if (!result.tasks.length) continue;
      const sourceRef = crypto.randomUUID();
      prepared.push({
        task: task({ ...draft, sourceRef }),
        source: {
          sourceRef,
          filename: doc.filename,
          hash: doc.hash,
          location: source.location,
          excerpt: source.excerpt,
          originalDate: source.date,
          acceptedDate: draft.date,
          method: "local-text-v1",
        },
      });
    }
    if (!prepared.length)
      throw Error("All selected tasks already exist. Nothing was added.");
    fs.mkdirSync(folder, { recursive: true });
    const written = [];
    try {
      for (const item of prepared) {
        const file = path.join(folder, item.source.sourceRef + ".json");
        fs.writeFileSync(file, JSON.stringify(item.source));
        written.push(file);
      }
      const next = {
        ...state,
        tasks: [...state.tasks, ...prepared.map((p) => p.task)],
      };
      commit(next);
    } catch (error) {
      for (const file of written)
        try {
          fs.unlinkSync(file);
        } catch {}
      throw error;
    }
    lastImport = {
      ticket: crypto.randomUUID(),
      tasks: prepared.map((p) => structuredClone(p.task)),
    };
    current = null;
    return {
      added: prepared.length,
      skipped: rows.length - prepared.length,
      undo: lastImport.ticket,
    };
  }
  function source(id) {
    if (!/^[a-f0-9-]{36}$/.test(id || ""))
      throw Error("Invalid source reference.");
    const file = path.join(folder, id + ".json");
    if (!fs.existsSync(file))
      throw Error(
        "This source excerpt is stored on the PC where it was imported.",
      );
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  function undo({ ticket }) {
    if (!lastImport || ticket !== lastImport.ticket)
      throw Error("This import can no longer be undone here.");
    const state = getState();
    if (
      lastImport.tasks.some(
        (t) =>
          JSON.stringify(state.tasks.find((x) => x.id === t.id)) !==
          JSON.stringify(t),
      )
    )
      throw Error(
        "An imported task changed. Review its details rather than removing later edits.",
      );
    const ids = new Set(lastImport.tasks.map((t) => t.id));
    commit({ ...state, tasks: state.tasks.filter((t) => !ids.has(t.id)) });
    for (const t of lastImport.tasks)
      try {
        fs.unlinkSync(path.join(folder, t.sourceRef + ".json"));
      } catch {}
    lastImport = null;
  }
  return {
    choose,
    add,
    source,
    undo,
    cancel: () => {
      generation++;
      current = null;
    },
  };
}
module.exports = { createSyllabusService, readDocument };
