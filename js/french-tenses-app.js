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

  document.getElementById("tenses-overlay-close").addEventListener("click", closeFrenchTenseOverlay);
  document.getElementById("tenses-overlay-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "tenses-overlay-backdrop") closeFrenchTenseOverlay();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeFrenchTenseOverlay();
  });
});
