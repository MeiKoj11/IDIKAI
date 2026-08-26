/*
  french-tenses-app.js
  ----------------------
  french-tenses.html — same idea as spanish-tenses-app.js: an all-
  tenses overview for one reference verb, grouped by mood (Indicatif /
  Conditionnel / Subjonctif / Impératif), each tile expanding to a full
  table on click, plus a "Test me" mode. See spanish-tenses-app.js for
  the fuller explanation of the interaction pattern — this file mirrors
  it almost exactly, just pointed at FrenchConjugator's shape.
*/

const FRENCH_TENSES_REF_VERB_KEY = "frenchTenses.refVerb";

const FRENCH_TENSES_GRID_GROUPS = [
  {
    mood: "Indicatif",
    rows: [
      { label: "Past", tenses: ["imperfect", "passeCompose", "pluperfect"] },
      { label: "Present", tenses: ["present"] },
      { label: "Future", tenses: ["future", "futurePerfect"] },
    ],
  },
  {
    mood: "Conditionnel",
    rows: [{ label: "Conditionnel", tenses: ["conditionalPresent", "conditionalPast"] }],
  },
  {
    mood: "Subjonctif",
    rows: [{ label: "Subjonctif", tenses: ["subjPresent", "subjPast"] }],
  },
  {
    mood: "Impératif",
    rows: [{ label: "Commands", tenses: ["imperativePresent"] }],
  },
];

let selectedFrenchVerbInfinitive = "parler";

function currentFrenchTensesVerb() {
  return FrenchConjugator.findVerb(selectedFrenchVerbInfinitive) || FrenchConjugator.VERBS[0];
}

function frenchPersonsForTense(tense) {
  return FrenchConjugator.IMPERATIVE_TENSE_KEYS.includes(tense)
    ? FrenchConjugator.IMPERATIVE_PERSON_KEYS
    : FrenchConjugator.PERSON_KEYS;
}

function frenchTenseTileForm(verb, tense) {
  const persons = frenchPersonsForTense(tense);
  const previewPerson = persons.includes("je") ? "je" : "tu";
  return FrenchConjugator.conjugate(verb, tense, previewPerson);
}

function renderFrenchTensesGrid() {
  const grid = document.getElementById("tenses-grid");
  if (!grid) return;
  grid.innerHTML = "";
  const verb = currentFrenchTensesVerb();

  FRENCH_TENSES_GRID_GROUPS.forEach((group) => {
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
        title.textContent = FrenchConjugator.ALL_TENSE_LABELS[tense] || tense;
        tile.appendChild(title);

        const preview = document.createElement("span");
        preview.className = "tenses-tile-preview";
        preview.textContent = frenchTenseTileForm(verb, tense) || "";
        tile.appendChild(preview);

        tile.addEventListener("click", () => openFrenchTenseOverlay(tense));
        tilesWrap.appendChild(tile);
      });

      rowEl.appendChild(tilesWrap);
      moodSection.appendChild(rowEl);
    });

    grid.appendChild(moodSection);
  });
}

function openFrenchTenseOverlay(tense) {
  const verb = currentFrenchTensesVerb();
  const backdrop = document.getElementById("tenses-overlay-backdrop");
  const title = document.getElementById("tenses-overlay-title");
  const table = document.getElementById("tenses-overlay-table");
  if (!backdrop || !title || !table) return;

  title.textContent = `${verb.infinitive} — ${FrenchConjugator.ALL_TENSE_LABELS[tense] || tense}`;
  table.innerHTML = "";

  frenchPersonsForTense(tense).forEach((person) => {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.textContent = FrenchConjugator.PERSON_LABELS[person];
    tr.appendChild(th);

    const td = document.createElement("td");
    td.textContent = FrenchConjugator.conjugate(verb, tense, person) || "—";
    tr.appendChild(td);
    table.appendChild(tr);
  });

  backdrop.hidden = false;
}

function closeFrenchTenseOverlay() {
  const backdrop = document.getElementById("tenses-overlay-backdrop");
  if (backdrop) backdrop.hidden = true;
}

function populateFrenchTensesVerbSelect() {
  const select = document.getElementById("tenses-verb-select");
  if (!select) return;
  select.innerHTML = "";
  FrenchConjugator.VERBS.slice()
    .sort((a, b) => a.infinitive.localeCompare(b.infinitive))
    .forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.infinitive;
      opt.textContent = `${v.infinitive} — ${v.english}`;
      select.appendChild(opt);
    });

  const stored = localStorage.getItem(FRENCH_TENSES_REF_VERB_KEY);
  selectedFrenchVerbInfinitive = stored && FrenchConjugator.findVerb(stored) ? stored : "parler";
  select.value = selectedFrenchVerbInfinitive;

  select.addEventListener("change", () => {
    selectedFrenchVerbInfinitive = select.value;
    localStorage.setItem(FRENCH_TENSES_REF_VERB_KEY, selectedFrenchVerbInfinitive);
    closeFrenchTenseOverlay();
    renderFrenchTensesGrid();
  });
}

// ---------------------------------------------------------------------
// Test mode
// ---------------------------------------------------------------------

let frenchTensesTestSession = null;

function populateFrenchTestCheckboxes() {
  const wrap = document.getElementById("tenses-test-checkboxes");
  if (!wrap) return;
  wrap.innerHTML = "";
  FRENCH_TENSES_GRID_GROUPS.forEach((group) => {
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
        label.appendChild(document.createTextNode(FrenchConjugator.ALL_TENSE_LABELS[tense] || tense));
        groupWrap.appendChild(label);
      });
    });
    wrap.appendChild(groupWrap);
  });
}

function selectedFrenchTestTenses() {
  const wrap = document.getElementById("tenses-test-checkboxes");
  if (!wrap) return [];
  return Array.from(wrap.querySelectorAll("input[type=checkbox]:checked")).map((i) => i.value);
}

// Every person can come up; je/tu just show up a bit more often.
const FRENCH_TEST_PERSON_WEIGHTS = { je: 0.24, tu: 0.24, il: 0.15, nous: 0.13, vous: 0.11, ils: 0.13 };
const FRENCH_TEST_IMPERATIVE_PERSON_WEIGHTS = { tu: 0.45, nous: 0.25, vous: 0.3 };

function frenchWeightedPick(weights) {
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
// split, same convention as the Spanish version.
function pickFrenchTestVerb() {
  const irregular = FrenchConjugator.VERBS.filter((v) => v.irregular);
  const regular = FrenchConjugator.VERBS.filter((v) => !v.irregular);
  const pool = Math.random() < 0.3 && irregular.length ? irregular : regular;
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickFrenchTestPerson(tense) {
  const weights = FrenchConjugator.IMPERATIVE_TENSE_KEYS.includes(tense) ? FRENCH_TEST_IMPERATIVE_PERSON_WEIGHTS : FRENCH_TEST_PERSON_WEIGHTS;
  return frenchWeightedPick(weights);
}

function buildFrenchTestQuestion(tenses, guard) {
  const safeGuard = guard || 0;
  const tense = tenses[Math.floor(Math.random() * tenses.length)];
  const verb = pickFrenchTestVerb();
  const person = pickFrenchTestPerson(tense);
  const answer = FrenchConjugator.conjugate(verb, tense, person);
  if (!answer && safeGuard < 20) return buildFrenchTestQuestion(tenses, safeGuard + 1);
  return { tense, verb, person, answer };
}

function startFrenchTensesTest() {
  const tenses = selectedFrenchTestTenses();
  if (!tenses.length) return;
  frenchTensesTestSession = { tenses, correct: 0, total: 0, current: null };
  document.getElementById("tenses-test-setup").hidden = true;
  document.getElementById("tenses-test-quiz").hidden = false;
  nextFrenchTestQuestion();
}

function nextFrenchTestQuestion() {
  if (!frenchTensesTestSession) return;
  frenchTensesTestSession.current = buildFrenchTestQuestion(frenchTensesTestSession.tenses);
  const { verb, tense, person } = frenchTensesTestSession.current;
  document.getElementById("tenses-test-prompt").textContent =
    `${verb.infinitive} (${verb.english}) — ${FrenchConjugator.ALL_TENSE_LABELS[tense] || tense}, ${FrenchConjugator.PERSON_LABELS[person]}`;
  const input = document.getElementById("tenses-test-input");
  input.value = "";
  input.disabled = false;
  document.getElementById("tenses-test-feedback").hidden = true;
  document.getElementById("tenses-test-check-btn").hidden = false;
  document.getElementById("tenses-test-next-btn").hidden = true;
  updateFrenchTestScore();
  input.focus();
}

function updateFrenchTestScore() {
  const score = document.getElementById("tenses-test-score");
  if (score && frenchTensesTestSession) score.textContent = `Score: ${frenchTensesTestSession.correct} / ${frenchTensesTestSession.total}`;
}

function checkFrenchTestAnswer() {
  if (!frenchTensesTestSession || !frenchTensesTestSession.current) return;
  const input = document.getElementById("tenses-test-input");
  const typed = input.value.trim();
  if (!typed) return;

  const { answer } = frenchTensesTestSession.current;
  const isCorrect = FrenchConjugator.normalizeForMatch(answer) === FrenchConjugator.normalizeForMatch(typed);

  frenchTensesTestSession.total += 1;
  if (isCorrect) frenchTensesTestSession.correct += 1;
  updateFrenchTestScore();

  const feedback = document.getElementById("tenses-test-feedback");
  feedback.hidden = false;
  feedback.textContent = isCorrect ? "Correct!" : `Not quite — ${answer}`;
  feedback.className = isCorrect ? "card-practice-answer" : "card-practice-answer card-practice-wrong";

  input.disabled = true;
  document.getElementById("tenses-test-check-btn").hidden = true;
  document.getElementById("tenses-test-next-btn").hidden = false;
}

function closeFrenchTensesTest() {
  const backdrop = document.getElementById("tenses-test-backdrop");
  if (backdrop) backdrop.hidden = true;
  document.getElementById("tenses-test-setup").hidden = false;
  document.getElementById("tenses-test-quiz").hidden = true;
  frenchTensesTestSession = null;
}

function openFrenchTensesTest() {
  const backdrop = document.getElementById("tenses-test-backdrop");
  if (backdrop) backdrop.hidden = false;
}

document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("tenses-grid");
  if (!grid) return; // not this page
  if (typeof FrenchConjugator === "undefined") return; // spanish-tenses.html shares some ids; guard just in case

  const lang = "fr"; // French-only page
  initTopbar(lang);
  if (typeof initHubTasks === "function") initHubTasks(lang);
  initAppTabs({
    section: "grammar",
    language: lang,
    label: "French tenses",
    href: "french-tenses.html",
  });

  populateFrenchTensesVerbSelect();
  renderFrenchTensesGrid();
  populateFrenchTestCheckboxes();

  document.getElementById("tenses-overlay-close").addEventListener("click", closeFrenchTenseOverlay);
  document.getElementById("tenses-overlay-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "tenses-overlay-backdrop") closeFrenchTenseOverlay();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeFrenchTenseOverlay();
      closeFrenchTensesTest();
    }
  });

  document.getElementById("tenses-test-btn").addEventListener("click", openFrenchTensesTest);
  document.getElementById("tenses-test-close").addEventListener("click", closeFrenchTensesTest);
  document.getElementById("tenses-test-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "tenses-test-backdrop") closeFrenchTensesTest();
  });
  document.getElementById("tenses-test-select-all").addEventListener("click", () => {
    document.querySelectorAll("#tenses-test-checkboxes input[type=checkbox]").forEach((i) => (i.checked = true));
  });
  document.getElementById("tenses-test-clear").addEventListener("click", () => {
    document.querySelectorAll("#tenses-test-checkboxes input[type=checkbox]").forEach((i) => (i.checked = false));
  });
  document.getElementById("tenses-test-start-btn").addEventListener("click", startFrenchTensesTest);
  document.getElementById("tenses-test-check-btn").addEventListener("click", checkFrenchTestAnswer);
  document.getElementById("tenses-test-next-btn").addEventListener("click", nextFrenchTestQuestion);
  document.getElementById("tenses-test-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (!document.getElementById("tenses-test-check-btn").hidden) checkFrenchTestAnswer();
      else nextFrenchTestQuestion();
    }
  });
});
