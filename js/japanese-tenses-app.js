/*
  japanese-tenses-app.js
  ------------------------
  japanese-tenses.html — the Japanese counterpart of spanish-tenses.html
  and french-tenses-app.js, but simpler by nature: Japanese verbs here
  don't conjugate by tense/person the way Spanish/French do — this page
  covers the app's four special verb forms (potential/passive/causative/
  causative-passive, see js/ja-conjugator.js), so it's one flat row of
  4 tiles for a reference verb rather than a mood/tense grid. Clicking a
  tile brings its explanation + examples to the front in an overlay,
  same interaction as the other two languages' pages.

  Deliberately only links to "Sentence test" (no quick "Test me" link)
  — Japanese's quick, fully-local conjugation quiz already lives inline
  on each of the 4 Grammar structure cards (grammar-conjugation-note.html)
  and wasn't asked to move; only the new AI sentence-mode test needed
  a home, which is what this overview page exists to link to.
*/

const JAPANESE_TENSES_REF_VERB_KEY = "japaneseTenses.refVerb";

// Same four forms as ja-conjugator.js's FORMS, in the order they read
// most naturally as a progression (simplest -> most compound).
const JAPANESE_FORMS = ["potential", "passive", "causative", "causativePassive"];

// Condensed versions of the same explanations seeded onto the Grammar
// structure cards (see storage.js's CONJUGATION_STARTER_CARDS) —
// duplicated locally rather than shared, same as how spanish-tenses-app.js
// and french-tenses-app.js each keep their own grid-group constants
// rather than reading them out of storage.js.
const JAPANESE_FORM_EXPLANATIONS = {
  potential:
    "“Can do” — the subject is able to do something. Godan verbs shift their final kana to the e-row and add る (飲む -> 飲める); ichidan verbs drop る and add られる (食べる -> 食べられる); する becomes できる and 来る becomes 来られる.",
  passive:
    "“Something happens to the subject” (this book was written long ago, no one implied) — it can ALSO imply the action affected the speaker, often negatively (迷惑の受身, “suffering passive”), e.g. 友達に日記を読まれた (“my friend read my diary [and I'm annoyed]”). Godan verbs shift to the a-row and add れる (言う -> 言われる); ichidan verbs drop る and add られる (same ending as potential — context tells them apart).",
  causative:
    "“Make/let someone do” — the subject causes or permits someone else to act. Godan verbs shift to the a-row and add せる (言う -> 言わせる); ichidan verbs drop る and add させる; する becomes させる and 来る becomes 来させる.",
  causativePassive:
    "“Was made to do” — combines causative + passive: someone was forced/made to do something, usually against their will. Add られる to the causative stem (言わせる -> 言わせられる); godan verbs not ending in す commonly contract this to される (言わせられる -> 言わされる, both correct).",
};

let selectedJapaneseVerbKanji = "言う";

function currentJapaneseTensesVerb() {
  return JaConjugator.COMMON_VERBS.find((v) => v.kanji === selectedJapaneseVerbKanji) || JaConjugator.COMMON_VERBS[0];
}

function renderJapaneseTensesGrid() {
  const grid = document.getElementById("tenses-grid");
  if (!grid) return;
  grid.innerHTML = "";
  const verb = currentJapaneseTensesVerb();

  const section = document.createElement("section");
  section.className = "tenses-mood-section";

  const heading = document.createElement("h2");
  heading.className = "tenses-mood-heading";
  heading.dataset.immersionKey = "specialFormsHeading";
  heading.textContent = "Special forms";
  section.appendChild(heading);

  const rowEl = document.createElement("div");
  rowEl.className = "tenses-row";

  const tilesWrap = document.createElement("div");
  tilesWrap.className = "tenses-row-tiles";

  JAPANESE_FORMS.forEach((form) => {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "tenses-tile";
    tile.dataset.form = form;

    const title = document.createElement("span");
    title.className = "tenses-tile-title";
    title.textContent = JaConjugator.FORM_LABELS[form].split(" —")[0];
    tile.appendChild(title);

    const conjugated = JaConjugator.conjugate(verb, form);
    const preview = document.createElement("span");
    preview.className = "tenses-tile-preview";
    preview.textContent = conjugated ? `${conjugated.kanji} (${conjugated.reading})` : "";
    tile.appendChild(preview);

    tile.addEventListener("click", () => openJapaneseFormOverlay(form));
    tilesWrap.appendChild(tile);
  });

  rowEl.appendChild(tilesWrap);
  section.appendChild(rowEl);
  grid.appendChild(section);
}

function openJapaneseFormOverlay(form) {
  const verb = currentJapaneseTensesVerb();
  const backdrop = document.getElementById("tenses-overlay-backdrop");
  const title = document.getElementById("tenses-overlay-title");
  const table = document.getElementById("tenses-overlay-table");
  if (!backdrop || !title || !table) return;

  const conjugated = JaConjugator.conjugate(verb, form);
  title.textContent = `${verb.kanji} (${verb.reading}) — ${JaConjugator.FORM_LABELS[form] || form}`;
  table.innerHTML = "";

  const formRow = document.createElement("tr");
  const formTh = document.createElement("th");
  formTh.dataset.immersionKey = "formLabel";
  formTh.textContent = "Form";
  formRow.appendChild(formTh);
  const formTd = document.createElement("td");
  formTd.textContent = conjugated
    ? conjugated.altKanji
      ? `${conjugated.kanji} (${conjugated.reading}) — also ${conjugated.altKanji} (${conjugated.altReading})`
      : `${conjugated.kanji} (${conjugated.reading})`
    : "—";
  formRow.appendChild(formTd);
  table.appendChild(formRow);

  const explanationRow = document.createElement("tr");
  const explanationTh = document.createElement("th");
  explanationTh.dataset.immersionKey = "explanationLabel";
  explanationTh.textContent = "Meaning";
  explanationRow.appendChild(explanationTh);
  const explanationTd = document.createElement("td");
  explanationTd.textContent = JAPANESE_FORM_EXPLANATIONS[form] || "";
  explanationRow.appendChild(explanationTd);
  table.appendChild(explanationRow);

  backdrop.hidden = false;
}

function closeJapaneseFormOverlay() {
  const backdrop = document.getElementById("tenses-overlay-backdrop");
  if (backdrop) backdrop.hidden = true;
}

function populateJapaneseTensesVerbSelect() {
  const select = document.getElementById("tenses-verb-select");
  if (!select) return;
  select.innerHTML = "";
  JaConjugator.COMMON_VERBS.slice()
    .sort((a, b) => a.reading.localeCompare(b.reading))
    .forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.kanji;
      opt.textContent = `${v.kanji} (${v.reading}) — ${v.meaning}`;
      select.appendChild(opt);
    });

  const stored = localStorage.getItem(JAPANESE_TENSES_REF_VERB_KEY);
  selectedJapaneseVerbKanji =
    stored && JaConjugator.COMMON_VERBS.some((v) => v.kanji === stored) ? stored : "言う";
  select.value = selectedJapaneseVerbKanji;

  select.addEventListener("change", () => {
    selectedJapaneseVerbKanji = select.value;
    localStorage.setItem(JAPANESE_TENSES_REF_VERB_KEY, selectedJapaneseVerbKanji);
    closeJapaneseFormOverlay();
    renderJapaneseTensesGrid();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("tenses-grid");
  if (!grid || typeof JaConjugator === "undefined") return; // not this page

  const lang = "ja"; // Japanese-only page
  initTopbar(lang);
  if (typeof initHubTasks === "function") initHubTasks(lang);
  initAppTabs({
    section: "grammar",
    language: lang,
    label: "Japanese verb forms",
    href: "japanese-tenses.html",
  });

  populateJapaneseTensesVerbSelect();
  renderJapaneseTensesGrid();

  document.getElementById("tenses-overlay-close").addEventListener("click", closeJapaneseFormOverlay);
  document.getElementById("tenses-overlay-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "tenses-overlay-backdrop") closeJapaneseFormOverlay();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeJapaneseFormOverlay();
  });
});
