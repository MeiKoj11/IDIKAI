/*
  spanish-tenses-app.js
  ----------------------
  spanish-tenses.html — an all-tenses overview for one reference verb,
  grouped by mood (Indicative / Subjunctive / Imperative) and roughly
  laid out along a past-present-future timeline, minus Infinitive and
  Participles. Every tile is small by default; clicking one brings a
  full 6-person table to the front in an overlay (click outside, the
  Close button, or Escape shrinks it back — no page navigation).

  Also hosts "Test me": pick which tenses to be quizzed on, then a
  card-style local quiz (no AI call) — every person can come up,
  weighted a bit toward yo/tú, verbs a 70/30 regular/irregular mix,
  graded via SpanishConjugator's existing case+accent-insensitive
  normalizeForMatch.
*/

const TENSES_REF_VERB_KEY = "spanishTenses.refVerb";

// Grid layout: mood -> time-ordered rows of tense keys.
const TENSES_GRID_GROUPS = [
  {
    mood: "Indicative",
    rows: [
      { label: "Past", tenses: ["imperfect", "preterite", "pluperfect"] },
      { label: "Present", tenses: ["present", "presentPerfect"] },
      { label: "Future", tenses: ["future", "futurePerfect"] },
      { label: "Conditional", tenses: ["conditional", "conditionalPerfect"] },
    ],
  },
  {
    mood: "Subjunctive",
    rows: [
      { label: "Past", tenses: ["subjImperfect", "subjPluperfect"] },
      { label: "Present", tenses: ["subjPresent", "subjPresentPerfect"] },
      { label: "Future", tenses: ["subjFuture"] },
    ],
  },
  {
    mood: "Imperative",
    rows: [{ label: "Commands", tenses: ["imperativeAffirmative", "imperativeNegative"] }],
  },
];

let selectedVerbInfinitive = "hablar";

function currentTensesVerb() {
  return SpanishConjugator.findVerb(selectedVerbInfinitive) || SpanishConjugator.VERBS[0];
}

function personsForTense(tense) {
  return SpanishConjugator.IMPERATIVE_TENSE_KEYS.includes(tense)
    ? SpanishConjugator.IMPERATIVE_PERSON_KEYS
    : SpanishConjugator.PERSON_KEYS;
}

function tenseTileForm(verb, tense) {
  const persons = personsForTense(tense);
  const previewPerson = persons.includes("yo") ? "yo" : "tu";
  return SpanishConjugator.conjugate(verb, tense, previewPerson);
}

function renderTensesGrid() {
  const grid = document.getElementById("tenses-grid");
  if (!grid) return;
  grid.innerHTML = "";
  const verb = currentTensesVerb();

  TENSES_GRID_GROUPS.forEach((group) => {
    const moodSection = document.createElement("section");
    moodSection.className = `tenses-mood-section tenses-mood-${group.mood.toLowerCase()}`;

    const moodHeading = document.createElement("h2");
    moodHeading.className = "tenses-mood-heading";
    moodHeading.textContent = group.mood;
    moodSection.appendChild(moodHeading);

    group.rows.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "tenses-row";

      const rowLabel = document.createElement("span");
      rowLabel.className = "tenses-row-label";
      rowLabel.textContent = row.label;
      rowEl.appendChild(rowLabel);

      const tilesWrap = document.createElement("div");
      tilesWrap.className = "tenses-row-tiles";

      row.tenses.forEach((tense) => {
        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = "tenses-tile";
        tile.dataset.tense = tense;

        const title = document.createElement("span");
        title.className = "tenses-tile-title";
        title.textContent = SpanishConjugator.ALL_TENSE_LABELS[tense] || tense;
        tile.appendChild(title);

        const preview = document.createElement("span");
        preview.className = "tenses-tile-preview";
        preview.textContent = tenseTileForm(verb, tense) || "";
        tile.appendChild(preview);

        tile.addEventListener("click", () => openTenseOverlay(tense));
        tilesWrap.appendChild(tile);
      });

      rowEl.appendChild(tilesWrap);
      moodSection.appendChild(rowEl);
    });

    grid.appendChild(moodSection);
  });
}

function openTenseOverlay(tense) {
  const verb = currentTensesVerb();
  const backdrop = document.getElementById("tenses-overlay-backdrop");
  const title = document.getElementById("tenses-overlay-title");
  const table = document.getElementById("tenses-overlay-table");
  if (!backdrop || !title || !table) return;

  title.textContent = `${verb.infinitive} — ${SpanishConjugator.ALL_TENSE_LABELS[tense] || tense}`;
  table.innerHTML = "";

  personsForTense(tense).forEach((person) => {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.textContent = SpanishConjugator.PERSON_LABELS[person];
    tr.appendChild(th);

    const td = document.createElement("td");
    if (tense === "subjImperfect") {
      // Show both interchangeable -ra/-se forms together, same as the
      // usual reference-chart convention.
      const ra = SpanishConjugator.conjugate(verb, "subjImperfect", person);
      const se = SpanishConjugator.conjugate(verb, "subjImperfectSe", person);
      td.textContent = se ? `${ra} / ${se}` : ra || "—";
    } else {
      td.textContent = SpanishConjugator.conjugate(verb, tense, person) || "—";
    }
    tr.appendChild(td);
    table.appendChild(tr);
  });

  backdrop.hidden = false;
}

function closeTenseOverlay() {
  const backdrop = document.getElementById("tenses-overlay-backdrop");
  if (backdrop) backdrop.hidden = true;
}

function populateTensesVerbSelect() {
  const select = document.getElementById("tenses-verb-select");
  if (!select) return;
  select.innerHTML = "";
  SpanishConjugator.VERBS.slice()
    .sort((a, b) => a.infinitive.localeCompare(b.infinitive))
    .forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.infinitive;
      opt.textContent = `${v.infinitive} — ${v.english}`;
      select.appendChild(opt);
    });

  const stored = localStorage.getItem(TENSES_REF_VERB_KEY);
  selectedVerbInfinitive = stored && SpanishConjugator.findVerb(stored) ? stored : "hablar";
  select.value = selectedVerbInfinitive;

  select.addEventListener("change", () => {
    selectedVerbInfinitive = select.value;
    localStorage.setItem(TENSES_REF_VERB_KEY, selectedVerbInfinitive);
    closeTenseOverlay();
    renderTensesGrid();
  });
}

// ---------------------------------------------------------------------
// Test mode
// ---------------------------------------------------------------------

let tensesTestSession = null;

function populateTestCheckboxes() {
  const wrap = document.getElementById("tenses-test-checkboxes");
  if (!wrap) return;
  wrap.innerHTML = "";
  TENSES_GRID_GROUPS.forEach((group) => {
    const groupWrap = document.createElement("div");
    groupWrap.className = "tenses-test-group";
    const heading = document.createElement("p");
    heading.className = "tenses-test-group-heading";
    heading.textContent = group.mood;
    groupWrap.appendChild(heading);

    group.rows.forEach((row) => {
      row.tenses.forEach((tense) => {
        const label = document.createElement("label");
        label.className = "tenses-test-checkbox";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = tense;
        label.appendChild(input);
        label.appendChild(document.createTextNode(SpanishConjugator.ALL_TENSE_LABELS[tense] || tense));
        groupWrap.appendChild(label);
      });
    });
    wrap.appendChild(groupWrap);
  });
}

function selectedTestTenses() {
  const wrap = document.getElementById("tenses-test-checkboxes");
  if (!wrap) return [];
  return Array.from(wrap.querySelectorAll("input[type=checkbox]:checked")).map((i) => i.value);
}

// Every person can come up; yo/tú just show up a bit more often.
const TEST_PERSON_WEIGHTS = { yo: 0.24, tu: 0.24, el: 0.15, nosotros: 0.13, vosotros: 0.11, ellos: 0.13 };
const TEST_IMPERATIVE_PERSON_WEIGHTS = { tu: 0.32, el: 0.22, nosotros: 0.16, vosotros: 0.12, ellos: 0.18 };

function weightedPick(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [key, w] of entries) {
    r -= w;
    if (r <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

// 70% regular / 30% irregular — reuses the data's own "irregular: true"
// split (17 of 52 verbs) rather than inventing a new classification.
function pickTestVerb() {
  const irregular = SpanishConjugator.VERBS.filter((v) => v.irregular);
  const regular = SpanishConjugator.VERBS.filter((v) => !v.irregular);
  const pool = Math.random() < 0.3 && irregular.length ? irregular : regular;
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickTestPerson(tense) {
  const weights = SpanishConjugator.IMPERATIVE_TENSE_KEYS.includes(tense) ? TEST_IMPERATIVE_PERSON_WEIGHTS : TEST_PERSON_WEIGHTS;
  return weightedPick(weights);
}

function buildTestQuestion(tenses, guard) {
  const safeGuard = guard || 0;
  const tense = tenses[Math.floor(Math.random() * tenses.length)];
  const verb = pickTestVerb();
  const person = pickTestPerson(tense);
  const answer = SpanishConjugator.conjugate(verb, tense, person);
  if (!answer && safeGuard < 20) return buildTestQuestion(tenses, safeGuard + 1);
  return { tense, verb, person, answer };
}

function startTensesTest() {
  const tenses = selectedTestTenses();
  if (!tenses.length) return;
  tensesTestSession = { tenses, correct: 0, total: 0, current: null };
  document.getElementById("tenses-test-setup").hidden = true;
  document.getElementById("tenses-test-quiz").hidden = false;
  nextTestQuestion();
}

function nextTestQuestion() {
  if (!tensesTestSession) return;
  tensesTestSession.current = buildTestQuestion(tensesTestSession.tenses);
  const { verb, tense, person } = tensesTestSession.current;
  document.getElementById("tenses-test-prompt").textContent =
    `${verb.infinitive} (${verb.english}) — ${SpanishConjugator.ALL_TENSE_LABELS[tense] || tense}, ${SpanishConjugator.PERSON_LABELS[person]}`;
  const input = document.getElementById("tenses-test-input");
  input.value = "";
  input.disabled = false;
  document.getElementById("tenses-test-feedback").hidden = true;
  document.getElementById("tenses-test-check-btn").hidden = false;
  document.getElementById("tenses-test-next-btn").hidden = true;
  updateTestScore();
  input.focus();
}

function updateTestScore() {
  const score = document.getElementById("tenses-test-score");
  if (score && tensesTestSession) score.textContent = `Score: ${tensesTestSession.correct} / ${tensesTestSession.total}`;
}

function checkTestAnswer() {
  if (!tensesTestSession || !tensesTestSession.current) return;
  const input = document.getElementById("tenses-test-input");
  const typed = input.value.trim();
  if (!typed) return;

  const { tense, verb, person, answer } = tensesTestSession.current;
  const acceptable = [answer];
  if (tense === "subjImperfect") {
    const alt = SpanishConjugator.conjugate(verb, "subjImperfectSe", person);
    if (alt) acceptable.push(alt);
  }
  const normalizedTyped = SpanishConjugator.normalizeForMatch(typed);
  const isCorrect = acceptable.some((a) => SpanishConjugator.normalizeForMatch(a) === normalizedTyped);

  tensesTestSession.total += 1;
  if (isCorrect) tensesTestSession.correct += 1;
  updateTestScore();

  const feedback = document.getElementById("tenses-test-feedback");
  feedback.hidden = false;
  feedback.textContent = isCorrect ? "Correct!" : `Not quite — ${acceptable.join(" / ")}`;
  feedback.className = isCorrect ? "card-practice-answer" : "card-practice-answer card-practice-wrong";

  input.disabled = true;
  document.getElementById("tenses-test-check-btn").hidden = true;
  document.getElementById("tenses-test-next-btn").hidden = false;
}

function closeTensesTest() {
  const backdrop = document.getElementById("tenses-test-backdrop");
  if (backdrop) backdrop.hidden = true;
  document.getElementById("tenses-test-setup").hidden = false;
  document.getElementById("tenses-test-quiz").hidden = true;
  tensesTestSession = null;
}

function openTensesTest() {
  const backdrop = document.getElementById("tenses-test-backdrop");
  if (backdrop) backdrop.hidden = false;
}

document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("tenses-grid");
  if (!grid) return; // not this page

  const lang = "es"; // Spanish-only page
  initTopbar(lang);
  if (typeof initHubTasks === "function") initHubTasks(lang);
  initAppTabs({
    section: "grammar",
    language: lang,
    label: "Spanish tenses",
    href: "spanish-tenses.html",
  });

  populateTensesVerbSelect();
  renderTensesGrid();
  populateTestCheckboxes();

  document.getElementById("tenses-overlay-close").addEventListener("click", closeTenseOverlay);
  document.getElementById("tenses-overlay-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "tenses-overlay-backdrop") closeTenseOverlay();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeTenseOverlay();
      closeTensesTest();
    }
  });

  document.getElementById("tenses-test-btn").addEventListener("click", openTensesTest);
  document.getElementById("tenses-test-close").addEventListener("click", closeTensesTest);
  document.getElementById("tenses-test-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "tenses-test-backdrop") closeTensesTest();
  });
  document.getElementById("tenses-test-select-all").addEventListener("click", () => {
    document.querySelectorAll("#tenses-test-checkboxes input[type=checkbox]").forEach((i) => (i.checked = true));
  });
  document.getElementById("tenses-test-clear").addEventListener("click", () => {
    document.querySelectorAll("#tenses-test-checkboxes input[type=checkbox]").forEach((i) => (i.checked = false));
  });
  document.getElementById("tenses-test-start-btn").addEventListener("click", startTensesTest);
  document.getElementById("tenses-test-check-btn").addEventListener("click", checkTestAnswer);
  document.getElementById("tenses-test-next-btn").addEventListener("click", nextTestQuestion);
  document.getElementById("tenses-test-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (!document.getElementById("tenses-test-check-btn").hidden) checkTestAnswer();
      else nextTestQuestion();
    }
  });
});
