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

  document.getElementById("tenses-overlay-close").addEventListener("click", closeTenseOverlay);
  document.getElementById("tenses-overlay-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "tenses-overlay-backdrop") closeTenseOverlay();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeTenseOverlay();
  });
});
