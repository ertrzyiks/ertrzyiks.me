// Local-only review UI for the inspection trail (see
// src/modules/email-processing/queues/extract-action-items/inspectionLog.ts). Reads every JSON
// file `WORKER_INSPECTION_DIR` accumulates (one per extract-action-items run — see worker.ts),
// and serves a single-page UI to browse them and flag ones whose action items are wrong.
//
// Flagging a run doesn't just note "this was wrong" — it writes a new fixture (the same
// `EvalFixture` shape eval/fixtures.ts's hand-picked fixtures use) into eval/reviewed-fixtures.json,
// with `expect` set to whatever the reviewer says the extraction *should* have produced.
// eval/reviewedFixtures.eval.test.ts then runs the real extractor against every one of those —
// expected to fail (red) the moment it's added, since the whole point is "the current prompt got
// this wrong"; it turns green once a later prompt change fixes it. See that file's header and
// eval/reviewedFixtures.ts's for the rest of the loop.
//
// Never deployed, never imported by src/** — a standalone dev tool in the same vein as
// scripts/release-worker.mjs, just interactive instead of one-shot. Reuses Fastify (already a
// dependency for server.ts) rather than pulling in a separate static-site/UI toolchain for what's
// a few hundred lines of vanilla HTML/JS.
//
// Usage (defaults to WORKER_INSPECTION_DIR's own default, `./audit`, when no flag/env var is
// given, so this reads from wherever a default-config worker run already wrote to):
//   npm run review
//   npm run review -- --dir ./audit --port 4600
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Fastify from "fastify";
import type { ActionItem, CalendarEvent } from "../src/modules/email-processing/queues/extract-action-items/actionItem.js";
import type { EmailContent } from "../src/modules/email-processing/queues/extract-action-items/gmail.js";
import type { StoredInspectionRecord } from "../src/modules/email-processing/queues/extract-action-items/inspectionLog.js";
import type { ItemExpectation } from "../eval/fixtures.js";
import { reviewedFixturesPath, type ReviewedFixture } from "../eval/reviewedFixtures.js";

function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

// Same default as worker.ts's own WORKER_INSPECTION_DIR fallback, so `npm run review` with no
// flags/env vars just works against wherever a worker run with no overrides already wrote to.
const inspectionDir = readArg("--dir") ?? process.env.WORKER_INSPECTION_DIR ?? "./audit";

const port = Number(readArg("--port") ?? process.env.REVIEW_PORT ?? 4600);

interface Run {
  file: string;
  recordedAt: string;
  emailId: string;
  email: EmailContent;
  actionItems?: ActionItem[];
  events?: CalendarEvent[];
  error?: string;
}

async function loadRuns(dir: string): Promise<Run[]> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((name) => name.endsWith(".json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const runs = await Promise.all(
    files.map(async (file) => {
      const raw = await readFile(join(dir, file), "utf8");
      const record = JSON.parse(raw) as StoredInspectionRecord;
      return { file, ...record };
    }),
  );

  // Newest first — that's almost always what you want to review, and matches how the file
  // timestamps in the name already sort.
  return runs.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

async function loadReviewedFixtures(): Promise<ReviewedFixture[]> {
  try {
    return JSON.parse(await readFile(reviewedFixturesPath, "utf8")) as ReviewedFixture[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function saveReviewedFixtures(fixtures: ReviewedFixture[]): Promise<void> {
  await mkdir(join(reviewedFixturesPath, ".."), { recursive: true });
  await writeFile(reviewedFixturesPath, `${JSON.stringify(fixtures, null, 2)}\n`, "utf8");
}

interface FlagRequestBody {
  sourceFile?: string;
  email?: EmailContent;
  expect?: { count: number; items: ItemExpectation[] };
}

const app = Fastify({ logger: false });

app.get("/", async (_request, reply) => {
  reply.type("text/html").send(PAGE_HTML);
});

app.get("/api/runs", async (_request, reply) => {
  const [runs, reviewedFixtures] = await Promise.all([
    loadRuns(inspectionDir),
    loadReviewedFixtures(),
  ]);
  const reviewedSourceFiles = new Set(
    reviewedFixtures.map((fixture) => fixture.reviewSourceFile).filter(Boolean),
  );
  reply.send({
    runs: runs.map((run) => ({ ...run, reviewed: reviewedSourceFiles.has(run.file) })),
  });
});

app.get("/api/reviewed-fixtures", async (_request, reply) => {
  reply.send({ fixtures: await loadReviewedFixtures() });
});

// Flags one run as wrong: appends (or, re-flagging the same run, replaces) a fixture in
// reviewed-fixtures.json. Body carries the reviewer's corrected `expect` — the extraction that
// was actually produced isn't needed here, it's already sitting in the source inspection file.
app.post<{ Body: FlagRequestBody }>("/api/flag", async (request, reply) => {
  const { sourceFile, email, expect } = request.body ?? {};
  if (!sourceFile || !email || !expect || !Array.isArray(expect.items)) {
    return reply.code(400).send({ error: "sourceFile, email, and expect are required" });
  }

  const fixtures = await loadReviewedFixtures();
  const withoutThisRun = fixtures.filter((fixture) => fixture.reviewSourceFile !== sourceFile);

  const fixture: ReviewedFixture = {
    name: `reviewed-${email.id}-${randomUUID().slice(0, 8)}`,
    rule: `Flagged via \`npm run review\` — extraction for email ${email.id} was wrong`,
    email,
    expect,
    reviewSourceFile: sourceFile,
    reviewedAt: new Date().toISOString(),
  };

  await saveReviewedFixtures([...withoutThisRun, fixture]);
  reply.code(201).send({ fixture });
});

// Undoes a flag — the reviewer clicked wrong, or the model's already fixed since. Removes the
// fixture rather than leaving a stale "expected" entry pointed at a rejected correction.
app.delete<{ Params: { sourceFile: string } }>("/api/flag/:sourceFile", async (request, reply) => {
  const fixtures = await loadReviewedFixtures();
  const remaining = fixtures.filter(
    (fixture) => fixture.reviewSourceFile !== decodeURIComponent(request.params.sourceFile),
  );
  await saveReviewedFixtures(remaining);
  reply.code(204).send();
});

app.listen({ port, host: "127.0.0.1" }).then(() => {
  console.log(`Inspection review UI: http://127.0.0.1:${port}`);
  console.log(`Reading from: ${inspectionDir}`);
  console.log(`Flagged fixtures written to: ${reviewedFixturesPath}`);
});

const PAGE_HTML = String.raw`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Inspection review</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 0 0 4rem; }
  header { padding: 1rem 1.5rem; border-bottom: 1px solid #8884; position: sticky; top: 0; background: Canvas; z-index: 1; }
  header h1 { font-size: 1.1rem; margin: 0; }
  header p { margin: 0.25rem 0 0; opacity: 0.7; font-size: 0.85rem; }
  main { max-width: 860px; margin: 1.5rem auto; padding: 0 1.5rem; }
  .run { border: 1px solid #8884; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1rem; }
  .run.reviewed { opacity: 0.55; }
  .run-head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; }
  .run-head h2 { font-size: 0.95rem; margin: 0; }
  .meta { font-size: 0.8rem; opacity: 0.65; }
  .body-toggle { cursor: pointer; color: #4a9eff; font-size: 0.85rem; user-select: none; }
  .email-body { white-space: pre-wrap; background: #8881; border-radius: 6px; padding: 0.75rem; margin: 0.5rem 0; font-size: 0.85rem; display: none; }
  .email-body.open { display: block; }
  ul.items { margin: 0.5rem 0; padding-left: 1.25rem; }
  ul.items.rejected { opacity: 0.6; }
  ul.items.rejected strong { text-decoration: line-through; }
  .error { color: #e5484d; }
  .actions { margin-top: 0.75rem; display: flex; gap: 0.5rem; }
  button { font: inherit; padding: 0.4rem 0.8rem; border-radius: 6px; border: 1px solid #8884; background: transparent; cursor: pointer; }
  button.primary { background: #e5484d; color: white; border-color: #e5484d; }
  button.ghost { opacity: 0.7; }
  .flag-panel { margin-top: 0.75rem; border-top: 1px dashed #8884; padding-top: 0.75rem; }
  .flag-item { display: grid; grid-template-columns: 1fr 1fr 140px auto; gap: 0.5rem; margin-bottom: 0.5rem; align-items: center; }
  .flag-item input, .flag-item select { font: inherit; padding: 0.3rem 0.5rem; border-radius: 4px; border: 1px solid #8884; background: Field; color: FieldText; }
  .badge { display: inline-block; font-size: 0.75rem; padding: 0.1rem 0.5rem; border-radius: 999px; background: #8882; margin-left: 0.5rem; }
  .badge.reviewed { background: #3a3; color: white; }
  .empty { opacity: 0.6; padding: 2rem; text-align: center; }
</style>
</head>
<body>
<header>
  <h1>Inspection review</h1>
  <p>Real extract-action-items runs, newest first. Flag a wrong extraction to add it to <code>eval/reviewed-fixtures.json</code> — see the task-manager README's "Inspection log" section.</p>
</header>
<main id="app"><p class="empty">Loading…</p></main>
<script>
const app = document.getElementById("app");
let runs = [];

async function load() {
  const res = await fetch("/api/runs");
  const data = await res.json();
  runs = data.runs;
  render();
}

function fmtDate(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function render() {
  if (runs.length === 0) {
    app.innerHTML = '<p class="empty">No inspection files found yet. Run the worker with WORKER_INSPECTION_DIR set, then reload.</p>';
    return;
  }
  app.innerHTML = runs.map(runHtml).join("");
  runs.forEach((run, i) => {
    const card = document.getElementById("run-" + i);
    card.querySelector(".body-toggle")?.addEventListener("click", () => {
      card.querySelector(".email-body").classList.toggle("open");
    });
    card.querySelector(".flag-open")?.addEventListener("click", () => openFlagPanel(run, i));
    card.querySelector(".unflag")?.addEventListener("click", () => unflag(run));
  });
}

function itemsHtml(items) {
  if (!items || items.length === 0) return "<p><em>No action items extracted.</em></p>";
  return "<ul class=\"items\">" + items.map(it =>
    "<li><strong>" + escapeHtml(it.title) + "</strong>" +
    (it.description ? " — " + escapeHtml(it.description) : "") +
    (it.dueDate ? " <em>(due " + escapeHtml(it.dueDate) + ")</em>" : "") +
    "</li>"
  ).join("") + "</ul>";
}

function eventsHtml(events) {
  if (!events || events.length === 0) return "<p><em>No events extracted.</em></p>";
  return "<ul class=\"items\">" + events.map(ev => {
    const when = ev.startTime
      ? escapeHtml(ev.date) + " " + escapeHtml(ev.startTime) + (ev.endTime ? "–" + escapeHtml(ev.endTime) : "")
      : escapeHtml(ev.date);
    return "<li><strong>" + escapeHtml(ev.title) + "</strong>" +
      (ev.description ? " — " + escapeHtml(ev.description) : "") +
      " <em>(" + when + ")</em></li>";
  }).join("") + "</ul>";
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function runHtml(run, i) {
  const subject = escapeHtml(run.email?.subject ?? "(no subject)");
  const from = escapeHtml(run.email?.from ?? "");
  return '<div class="run' + (run.reviewed ? ' reviewed' : '') + '" id="run-' + i + '">' +
    '<div class="run-head"><h2>' + subject + (run.reviewed ? '<span class="badge reviewed">flagged for review</span>' : '') + '</h2>' +
    '<span class="meta">' + fmtDate(run.recordedAt) + '</span></div>' +
    '<div class="meta">From: ' + from + ' &middot; email id: ' + escapeHtml(run.emailId) + '</div>' +
    '<span class="body-toggle">Show email body ▾</span>' +
    '<div class="email-body">' + escapeHtml(run.email?.body ?? "") + '</div>' +
    (run.error
      ? '<p class="error">Extraction failed: ' + escapeHtml(run.error) + '</p>'
      : itemsHtml(run.actionItems) + '<p class="meta">Events:</p>' + eventsHtml(run.events)) +
    '<div class="actions">' +
    (run.reviewed
      ? '<button class="ghost unflag">Unflag</button>'
      : '<button class="flag-open">This is wrong…</button>') +
    '</div>' +
    '<div class="flag-panel-slot"></div>' +
    '</div>';
}

function openFlagPanel(run, i) {
  const card = document.getElementById("run-" + i);
  const slot = card.querySelector(".flag-panel-slot");
  const initialItems = (run.actionItems && run.actionItems.length > 0)
    ? run.actionItems.map(it => ({ titleContains: it.title, descriptionContains: "", dueDate: it.dueDate ? "present" : "absent" }))
    : [];

  let items = initialItems;

  function renderPanel() {
    slot.innerHTML =
      '<div class="flag-panel">' +
      '<p>What should the extraction have produced for this email?</p>' +
      '<div class="flag-items"></div>' +
      '<button type="button" class="add-item ghost">+ Add expected item</button>' +
      '<div class="actions">' +
      '<button type="button" class="primary save-flag">Save as failing test case</button>' +
      '<button type="button" class="ghost cancel-flag">Cancel</button>' +
      '</div></div>';

    const list = slot.querySelector(".flag-items");
    list.innerHTML = items.map((it, idx) =>
      '<div class="flag-item" data-idx="' + idx + '">' +
      '<input placeholder="title contains…" class="title" value="' + escapeHtml(it.titleContains) + '" />' +
      '<input placeholder="description contains… (optional)" class="desc" value="' + escapeHtml(it.descriptionContains) + '" />' +
      '<select class="due">' +
      '<option value="">no due date assertion</option>' +
      '<option value="present"' + (it.dueDate === "present" ? " selected" : "") + '>due date present</option>' +
      '<option value="absent"' + (it.dueDate === "absent" ? " selected" : "") + '>due date absent</option>' +
      '</select>' +
      '<button type="button" class="ghost remove-item">✕</button>' +
      '</div>'
    ).join("") || '<p class="meta">No items expected (i.e. this email should produce zero action items).</p>';

    list.querySelectorAll(".flag-item").forEach(row => {
      const idx = Number(row.dataset.idx);
      row.querySelector(".title").addEventListener("input", e => { items[idx].titleContains = e.target.value; });
      row.querySelector(".desc").addEventListener("input", e => { items[idx].descriptionContains = e.target.value; });
      row.querySelector(".due").addEventListener("change", e => { items[idx].dueDate = e.target.value; });
      row.querySelector(".remove-item").addEventListener("click", () => { items.splice(idx, 1); renderPanel(); });
    });

    slot.querySelector(".add-item").addEventListener("click", () => {
      items.push({ titleContains: "", descriptionContains: "", dueDate: "" });
      renderPanel();
    });
    slot.querySelector(".cancel-flag").addEventListener("click", () => { slot.innerHTML = ""; });
    slot.querySelector(".save-flag").addEventListener("click", () => saveFlag(run, items, slot));
  }

  renderPanel();
}

async function saveFlag(run, items, slot) {
  const cleanItems = items
    .filter(it => it.titleContains && it.titleContains.trim().length > 0)
    .map(it => {
      const expectation = { titleContains: it.titleContains.trim() };
      if (it.descriptionContains && it.descriptionContains.trim().length > 0) {
        expectation.descriptionContains = it.descriptionContains.trim();
      }
      if (it.dueDate) expectation.dueDate = it.dueDate;
      return expectation;
    });

  const body = {
    sourceFile: run.file,
    email: run.email,
    expect: { count: cleanItems.length, items: cleanItems },
  };

  const res = await fetch("/api/flag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    alert("Failed to save: " + (await res.text()));
    return;
  }
  slot.innerHTML = "";
  await load();
}

async function unflag(run) {
  await fetch("/api/flag/" + encodeURIComponent(run.file), { method: "DELETE" });
  await load();
}

load();
</script>
</body>
</html>`;
