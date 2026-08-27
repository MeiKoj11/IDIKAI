/*
  grammar-app.js
  --------------
  The Grammar bubble: folders of hand-written notes on sentence
  structures and patterns you notice while reading. Deliberately NOT an
  AI-generated flashcard system — the AI's role is a collapsed, opt-in
  "hint" (translation + a short explanation), but the pattern and notes
  fields are always blank for you to fill in yourself. The idea is that
  writing it in your own words is what makes it stick.

  Shared across three pages (guarded so each page only wires up the
  elements it actually has, same pattern as vocab-app.js/reading-app.js):
    grammar.html            — folder list
    grammar-theme.html      — notes within one folder
    grammar-add-note.html   — the note form (works standalone, or
                               pre-filled via sessionStorage handoff from
                               a phrase you selected while reading)
*/

const GRAMMAR_NEW_THEME_VALUE = "__new_grammar_theme__";
const PENDING_GRAMMAR_NOTE_KEY = "pendingGrammarNote";
const GRAMMAR_LANGUAGE_NAMES = { es: "Spanish", ja: "Japanese", fr: "French" };

// Which grammar note (by id) is currently showing its inline personal-
// note editor on grammar-theme.html — mirrors the Helper Notebook's own
// editingHelperNoteWordId pattern.
let editingGrammarPersonalNoteId = null;

// The language context for grammar.html (from ?lang=es|ja) — filters the
// folder list and tags any folder created from this page. Grammar
// started Spanish-only; folders saved before language tagging existed
// have no "language" field and are treated as Spanish (see storage.js).
let activeGrammarLang = null;

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

document.addEventListener("DOMContentLoaded", () => {
  // grammar.html
  const langParam = getQueryParam("lang");
  if (SUPPORTED_LANGUAGES.includes(langParam)) {
    activeGrammarLang = langParam;
    const heading = document.getElementById("grammar-heading");
    if (heading) heading.textContent = `${GRAMMAR_LANGUAGE_NAMES[langParam]} Grammar`;
    const backLink = document.getElementById("grammar-back-link");
    if (backLink) backLink.href = `language-home.html?lang=${langParam}`;
    const header = document.getElementById("grammar-header");
    if (header) header.classList.add(`lang-${langParam}`);
    const intro = document.getElementById("grammar-intro");
    if (intro) {
      intro.textContent =
        langParam === "ja"
          ? "Save sentence structures and patterns you notice while reading Japanese, in your own words — an AI hint is there if you want a nudge, but the note is yours."
          : "Save sentence structures and patterns you notice while reading Spanish, in your own words — an AI hint is there if you want a nudge, but the note is yours.";
    }
  }

  if (activeGrammarLang) {
    Storage.ensureDefaultGrammarThemes(activeGrammarLang);
    Storage.ensureDefaultConjugationCards(activeGrammarLang);
  }
  renderGrammarThemeList();

  // grammar-theme.html
  initGrammarThemePage();

  // grammar-add-note.html
  initGrammarAddNotePage();

  // grammar-conjugation-note.html
  initGrammarConjugationNotePage();

  // grammar.html itself — the other two pages call initTopbar()
  // internally once they've resolved their own language, above.
  if (document.getElementById("grammar-heading")) {
    initTopbar(activeGrammarLang);
    if (typeof initHubTasks === "function") initHubTasks(activeGrammarLang);
    initAppTabs(null); // a folder list, not a single addressable unit
  }
});

// ---------------------------------------------------------------------
// grammar.html — folder list
// ---------------------------------------------------------------------

function renderGrammarThemeList() {
  const list = document.getElementById("grammar-theme-list");
  if (!list) return;

  const themes = Storage.getGrammarThemes(activeGrammarLang || undefined);
  list.innerHTML = "";

  themes.forEach((theme) => {
    const count = Storage.getGrammarNotes(theme.id).length;
    const li = document.createElement("li");
    li.className = `theme-item lang-${theme.language || "es"}`;
    li.addEventListener("click", () => {
      window.location.href = `grammar-theme.html?id=${encodeURIComponent(theme.id)}`;
    });

    const nameEl = document.createElement("span");
    nameEl.className = "theme-name";
    nameEl.textContent = theme.name;
    li.appendChild(nameEl);

    const meta = document.createElement("span");
    meta.className = "theme-meta";
    const countBadge = document.createElement("span");
    countBadge.className = "word-count-badge";
    countBadge.textContent = `${count} note${count === 1 ? "" : "s"}`;
    meta.appendChild(countBadge);
    li.appendChild(meta);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "theme-delete-btn";
    deleteBtn.setAttribute("aria-label", `Delete ${theme.name}`);
    deleteBtn.textContent = "×";
    deleteBtn.addEventListener("click", (e) => {
      // The tile itself is a click-to-open link — without this the
      // click would both delete the folder AND navigate into a page
      // for a folder that no longer exists.
      e.stopPropagation();
      const warning =
        count > 0
          ? `Delete "${theme.name}"? This will also delete all ${count} note${count === 1 ? "" : "s"} saved in it. This can't be undone.`
          : `Delete "${theme.name}"? This can't be undone.`;
      if (!confirm(warning)) return;
      Storage.deleteGrammarTheme(theme.id);
      renderGrammarThemeList();
    });
    li.appendChild(deleteBtn);

    list.appendChild(li);
  });

  // The "add a new folder" control is its own tile inside the grid,
  // sitting alongside the folder tiles rather than a form above them.
  const addLi = document.createElement("li");
  addLi.className = "theme-item theme-item-add";
  addLi.setAttribute("role", "button");
  addLi.setAttribute("tabindex", "0");
  addLi.setAttribute("aria-label", "Add folder");
  addLi.textContent = "+";
  const handleAddTile = () => {
    const name = (window.prompt("New folder name, e.g. Reflexive idioms") || "").trim();
    if (!name) return;
    Storage.addGrammarTheme(name, activeGrammarLang || "es");
    renderGrammarThemeList();
  };
  addLi.addEventListener("click", handleAddTile);
  addLi.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleAddTile();
    }
  });
  list.appendChild(addLi);
}

// ---------------------------------------------------------------------
// grammar-theme.html — notes within one folder
// ---------------------------------------------------------------------

function initGrammarThemePage() {
  const heading = document.getElementById("grammar-theme-heading");
  if (!heading) return; // not this page

  const themeId = getQueryParam("id");
  const theme = themeId ? Storage.getGrammarTheme(themeId) : null;

  if (!theme) {
    heading.textContent = "Folder not found";
    heading.dataset.immersionKey = "folderNotFoundText";
    return;
  }

  heading.textContent = theme.name;

  const themeLang = theme.language || "es";
  // Content migrations (e.g. correcting the seeded conjugation cards'
  // wording) shouldn't depend on having visited grammar.html first —
  // apply them here too, since a folder can be opened directly from a
  // reopened tab or bookmark.
  Storage.ensureDefaultConjugationCards(themeLang);
  const header = document.getElementById("grammar-theme-header");
  if (header) header.classList.add(`lang-${themeLang}`);
  const backLink = document.getElementById("grammar-theme-back-link");
  if (backLink) backLink.href = `grammar.html?lang=${themeLang}`;
  initTopbar(themeLang);
  if (typeof initHubTasks === "function") initHubTasks(themeLang);
  initAppTabs({
    section: "grammar",
    language: themeLang,
    label: theme.name,
    href: `grammar-theme.html?id=${encodeURIComponent(theme.id)}`,
  });

  const addNoteLink = document.getElementById("add-note-link");
  if (addNoteLink) addNoteLink.href = `grammar-add-note.html?themeId=${encodeURIComponent(theme.id)}`;

  const spanishTensesLink = document.getElementById("spanish-tenses-link");
  if (spanishTensesLink) {
    spanishTensesLink.hidden = !(themeLang === "es" && (theme.name || "").toLowerCase() === "tenses and verb conjugations");
  }

  const frenchTensesLink = document.getElementById("french-tenses-link");
  if (frenchTensesLink) {
    frenchTensesLink.hidden = !(themeLang === "fr" && (theme.name || "").toLowerCase() === "tenses and verb conjugations");
  }

  renderGrammarNoteList(theme.id);
  initGrammarPracticeCTA(theme);
}

// ---------------------------------------------------------------------
// grammar-conjugation-note.html — one conjugation card's own page
// ---------------------------------------------------------------------
// Reached by clicking one of the four Potential/Passive/Causative/
// Causative-passive tiles in a Grammar folder (buildConjugationNoteTile
// above) instead of expanding inline. Explanation/Examples/Test me are
// three independent <details> — Explanation starts open, the other two
// collapsed — using the browser's native disclosure widget rather than
// hand-rolled JS toggles, since each section here is fully independent
// (no shared state between them the way the folder-view card had).
function initGrammarConjugationNotePage() {
  const panel = document.getElementById("conj-note-panel");
  if (!panel) return; // not this page

  const noteId = getQueryParam("noteId");
  const note = noteId ? Storage.getGrammarNote(noteId) : null;

  if (!note || note.practiceType !== "conjugation") {
    document.getElementById("conj-note-not-found").hidden = false;
    return;
  }

  const theme = Storage.getGrammarTheme(note.themeId);
  const language = (theme && theme.language) || "ja";

  // Same reasoning as initGrammarThemePage — apply content migrations
  // here too, then re-read the note so a stale explanation caught by
  // the migration doesn't render before it's fixed.
  Storage.ensureDefaultConjugationCards(language);
  const freshNote = Storage.getGrammarNote(noteId) || note;

  document.getElementById("conj-note-heading").textContent = freshNote.header;
  const header = document.getElementById("conj-note-header");
  if (header) header.classList.add(`lang-${language}`);
  const backLink = document.getElementById("conj-note-back-link");
  if (backLink && theme) backLink.href = `grammar-theme.html?id=${encodeURIComponent(theme.id)}`;

  initTopbar(language);
  if (typeof initHubTasks === "function") initHubTasks(language);
  initAppTabs({
    section: "grammar",
    language,
    label: freshNote.header,
    href: `grammar-conjugation-note.html?noteId=${encodeURIComponent(freshNote.id)}`,
  });

  document.getElementById("conj-note-explanation").textContent = freshNote.explanation || "";

  const examplesRoot = document.getElementById("conj-note-examples");
  if (freshNote.examples && freshNote.examples.length) {
    examplesRoot.appendChild(buildExamplesDisplayBlock(freshNote.examples));
  } else {
    examplesRoot.textContent = "No examples yet.";
    examplesRoot.dataset.immersionKey = "noExamplesYetText";
  }

  const practiceRoot = document.getElementById("conj-practice-root");
  const practiceDetails = document.getElementById("conj-practice-details");
  practiceDetails.addEventListener("toggle", () => {
    if (!practiceDetails.open) return;
    if (!conjugationPracticeSessions[freshNote.id]) {
      startConjugationPractice(freshNote, practiceRoot);
    }
  });

  panel.hidden = false;
}

// ---------------------------------------------------------------------
// grammar-theme.html — "Practice this grammar point"
// ---------------------------------------------------------------------
// Only exists for folders tagged with a recognized, practice-able
// concept (see grammar-concepts.js) — an ordinary hand-made folder has
// no practiceConcept and never shows any of this. Currently only
// "pair-recall" concepts are supported (verb-transitivity): given one
// side of a pair (with furigana), type the other. A future pair-recall
// concept would need its generated pair objects keyed the same way
// (["transitive"]/["intransitive"]) or this would need a small adapter
// — not attempted here since only one concept exists so far.

let grammarPracticeSession = null; // { theme, concept, queue, usedWords, correct, total, current }

function initGrammarPracticeCTA(theme) {
  const cta = document.getElementById("grammar-practice-cta");
  if (!cta) return; // not this page

  const concept =
    theme.practiceConcept && grammarConceptAppliesToLanguage(theme.practiceConcept, theme.language || "es")
      ? getGrammarConcept(theme.practiceConcept)
      : null;

  if (!concept || concept.practiceType !== "pair-recall") {
    cta.hidden = true;
    return;
  }

  cta.hidden = false;
  const hint = document.getElementById("grammar-practice-cta-hint");
  if (hint) {
    hint.textContent = `Recognized as ${concept.label} — generate a few pairs and practice recalling one side from the other.`;
  }

  const startBtn = document.getElementById("grammar-practice-start-btn");
  if (startBtn && !startBtn.dataset.wired) {
    startBtn.dataset.wired = "true";
    startBtn.addEventListener("click", () => startGrammarPractice(theme, concept));
  }

  const closeBtn = document.getElementById("grammar-practice-close-btn");
  if (closeBtn && !closeBtn.dataset.wired) {
    closeBtn.dataset.wired = "true";
    closeBtn.addEventListener("click", closeGrammarPractice);
  }

  const checkBtn = document.getElementById("grammar-practice-check-btn");
  if (checkBtn && !checkBtn.dataset.wired) {
    checkBtn.dataset.wired = "true";
    checkBtn.addEventListener("click", handleGrammarPracticeCheck);
  }

  const nextBtn = document.getElementById("grammar-practice-next-btn");
  if (nextBtn && !nextBtn.dataset.wired) {
    nextBtn.dataset.wired = "true";
    nextBtn.addEventListener("click", renderNextGrammarPracticeQuestion);
  }

  const answerInput = document.getElementById("grammar-practice-answer-input");
  if (answerInput && !answerInput.dataset.wired) {
    answerInput.dataset.wired = "true";
    answerInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const nextBtnEl = document.getElementById("grammar-practice-next-btn");
      if (nextBtnEl && !nextBtnEl.hidden) {
        renderNextGrammarPracticeQuestion();
      } else {
        handleGrammarPracticeCheck();
      }
    });
  }
}

async function startGrammarPractice(theme, concept) {
  grammarPracticeSession = { theme, concept, queue: [], usedWords: [], correct: 0, total: 0, current: null };

  document.getElementById("grammar-practice-cta").hidden = true;
  document.getElementById("grammar-practice-panel").hidden = false;
  document.getElementById("grammar-practice-card").hidden = true;
  updateGrammarPracticeScore();

  const gotMore = await fetchMoreGrammarPracticePairs();
  if (gotMore) renderNextGrammarPracticeQuestion();
}

// Fetches another batch of pairs from the AI, turns each into one
// randomized-direction question, and appends to the queue. Returns
// false (and leaves an error message in place of the loading state) if
// the fetch failed.
async function fetchMoreGrammarPracticePairs() {
  const session = grammarPracticeSession;
  if (!session) return false;

  const loading = document.getElementById("grammar-practice-loading");
  if (loading) loading.hidden = false;

  const result = await Translate.generateGrammarPractice(
    session.concept.key,
    session.theme.language || "es",
    session.usedWords
  );

  if (loading) loading.hidden = true;

  if (result.error || !result.pairs || result.pairs.length === 0) {
    if (loading) {
      loading.hidden = false;
      loading.textContent = result.error
        ? `Couldn't generate practice: ${result.error}`
        : "Couldn't generate any practice pairs right now — try again in a moment.";
    }
    return false;
  }

  // pairLabels is ["Transitive", "Intransitive"] — question direction is
  // randomized per pair, not fixed to that order.
  result.pairs.forEach((pair) => {
    const given = Math.random() < 0.5 ? "transitive" : "intransitive";
    const asked = given === "transitive" ? "intransitive" : "transitive";
    if (!pair[given] || !pair[asked] || !pair[given].word || !pair[asked].word) return; // skip malformed entries
    session.queue.push({
      givenSide: given,
      askedSide: asked,
      given: pair[given],
      expected: pair[asked],
      meaning: pair.meaning || "",
    });
    session.usedWords.push(pair.transitive.word, pair.intransitive.word);
  });

  return session.queue.length > 0;
}

function renderNextGrammarPracticeQuestion() {
  const session = grammarPracticeSession;
  if (!session) return;

  if (session.queue.length === 0) {
    document.getElementById("grammar-practice-card").hidden = true;
    fetchMoreGrammarPracticePairs().then((gotMore) => {
      if (gotMore) renderNextGrammarPracticeQuestion();
    });
    return;
  }

  const question = session.queue.shift();
  session.current = question;

  const card = document.getElementById("grammar-practice-card");
  card.hidden = false;

  const promptLabel = document.getElementById("grammar-practice-prompt-label");
  const sideLabel = (side) => (side === "transitive" ? session.concept.pairLabels[0] : session.concept.pairLabels[1]);
  if (promptLabel) promptLabel.textContent = `Given the ${sideLabel(question.givenSide)} verb:`;

  const givenEl = document.getElementById("grammar-practice-given");
  if (givenEl) givenEl.textContent = question.given.word;
  const givenFuriganaEl = document.getElementById("grammar-practice-given-furigana");
  if (givenFuriganaEl) givenFuriganaEl.textContent = question.given.furigana || "";
  const meaningEl = document.getElementById("grammar-practice-meaning");
  if (meaningEl) meaningEl.textContent = question.meaning ? `(${question.meaning})` : "";

  const askEl = document.getElementById("grammar-practice-answer-ask");
  if (askEl) askEl.textContent = `What's the ${sideLabel(question.askedSide)} verb?`;

  const input = document.getElementById("grammar-practice-answer-input");
  if (input) {
    input.value = "";
    input.disabled = false;
    input.focus();
  }

  const feedback = document.getElementById("grammar-practice-feedback");
  if (feedback) {
    feedback.hidden = true;
    feedback.textContent = "";
    feedback.className = "grammar-practice-feedback";
  }

  document.getElementById("grammar-practice-check-btn").hidden = false;
  document.getElementById("grammar-practice-next-btn").hidden = true;
}

function handleGrammarPracticeCheck() {
  const session = grammarPracticeSession;
  if (!session || !session.current) return;

  const input = document.getElementById("grammar-practice-answer-input");
  const answer = (input.value || "").trim();
  const expected = session.current.expected;
  const isCorrect = answer.length > 0 && (answer === expected.word || answer === expected.furigana);

  session.total += 1;
  if (isCorrect) session.correct += 1;
  updateGrammarPracticeScore();

  const feedback = document.getElementById("grammar-practice-feedback");
  if (feedback) {
    feedback.hidden = false;
    feedback.className = `grammar-practice-feedback ${isCorrect ? "grammar-practice-correct" : "grammar-practice-incorrect"}`;
    feedback.textContent = isCorrect
      ? "Correct!"
      : `Not quite — the answer is ${expected.word}${expected.furigana ? ` (${expected.furigana})` : ""}.`;
  }

  input.disabled = true;
  document.getElementById("grammar-practice-check-btn").hidden = true;
  document.getElementById("grammar-practice-next-btn").hidden = false;
  document.getElementById("grammar-practice-next-btn").focus();
}

function updateGrammarPracticeScore() {
  const session = grammarPracticeSession;
  const scoreEl = document.getElementById("grammar-practice-score");
  if (!scoreEl || !session) return;
  scoreEl.textContent = session.total > 0 ? `${session.correct} / ${session.total} correct` : "";
}

function closeGrammarPractice() {
  grammarPracticeSession = null;
  document.getElementById("grammar-practice-panel").hidden = true;
  document.getElementById("grammar-practice-cta").hidden = false;
}

function renderGrammarNoteList(themeId) {
  const list = document.getElementById("grammar-note-list");
  if (!list) return;

  const notes = Storage.getGrammarNotes(themeId);
  list.innerHTML = "";

  if (notes.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-hint";
    li.textContent = "No notes in this folder yet.";
    li.dataset.immersionKey = "noNotesInFolderText";
    list.appendChild(li);
    return;
  }

  notes
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach((note) => {
      list.appendChild(buildGrammarNoteCard(note));
    });
}

// A single fixed accent color for every structure card.
const GRAMMAR_CARD_ACCENT_COLOR = "#7B4D35";

function grammarCardColorFor() {
  return GRAMMAR_CARD_ACCENT_COLOR;
}

function buildGrammarNoteCard(note) {
  // The four conjugation cards (Potential/Passive/Causative/Causative-
  // passive) navigate to their own page instead of expanding in place —
  // see buildConjugationNoteTile and grammar-conjugation-note.html.
  // Everything else (both the structure-card flow and the original
  // single-sentence notes) still expands inline, below.
  if (note.practiceType === "conjugation") return buildConjugationNoteTile(note);

  // A note built with the structure-card flow (has a header) renders
  // completely differently from the original single-sentence notes —
  // see buildStructureCard. Anything without a header is either a
  // pre-existing note or one saved via the legacy quick-capture flow,
  // and keeps rendering exactly as it always has, below.
  if (note.header) return buildStructureCard(note);

  const li = document.createElement("li");
  li.className = "word-item grammar-note-item";

  const summary = document.createElement("div");
  summary.className = "grammar-note-summary";
  summary.style.cursor = "pointer";

  const sentenceEl = document.createElement("div");
  sentenceEl.className = "grammar-note-sentence";
  sentenceEl.textContent = note.sentence;
  summary.appendChild(sentenceEl);

  if (note.tags && note.tags.length) {
    const tagsRow = document.createElement("div");
    tagsRow.className = "tag-row";
    note.tags.forEach((tag) => {
      const pill = document.createElement("span");
      pill.className = "tag-pill";
      pill.textContent = tag;
      tagsRow.appendChild(pill);
    });
    summary.appendChild(tagsRow);
  }

  const detail = document.createElement("div");
  detail.className = "grammar-note-detail";
  detail.hidden = true;

  if (note.translation) {
    const translationEl = document.createElement("p");
    translationEl.className = "hint";
    translationEl.textContent = note.translation;
    detail.appendChild(translationEl);
  }
  if (note.pattern) {
    const patternEl = document.createElement("div");
    patternEl.className = "grammar-pattern";
    patternEl.textContent = note.pattern;
    detail.appendChild(patternEl);
  }
  // "explanation" is what a Grammar check said was wrong (read-only,
  // only present on notes created that way) — kept separate from
  // "notes", which is always the learner's own optional field, below.
  if (note.explanation) {
    const explanationEl = document.createElement("p");
    explanationEl.className = "grammar-note-explanation";
    explanationEl.textContent = note.explanation;
    detail.appendChild(explanationEl);
  }
  if (note.sourcePassageTitle) {
    const sourceEl = document.createElement("p");
    sourceEl.className = "hint";
    sourceEl.textContent = `From: ${note.sourcePassageTitle}`;
    detail.appendChild(sourceEl);
  }

  // A personal note/question, own row — same +Note / Edit note pattern
  // as the Writing Helper Notebook, so it reads the same way everywhere
  // in the app. Editing happens inline here rather than the full form so
  // jotting a quick thought doesn't require leaving the folder view.
  if (note.id === editingGrammarPersonalNoteId) {
    detail.appendChild(buildGrammarPersonalNoteEditor(note));
  } else if (note.notes) {
    const noteBlock = document.createElement("div");
    noteBlock.className = "helper-word-note";

    const noteText = document.createElement("span");
    noteText.className = "helper-word-note-text";
    noteText.textContent = note.notes;
    noteBlock.appendChild(noteText);

    const editPersonalNoteBtn = document.createElement("button");
    editPersonalNoteBtn.type = "button";
    editPersonalNoteBtn.className = "secondary";
    editPersonalNoteBtn.textContent = "Edit personal note";
    editPersonalNoteBtn.dataset.immersionKey = "editPersonalNoteButton";
    editPersonalNoteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      editingGrammarPersonalNoteId = note.id;
      renderGrammarNoteList(note.themeId);
    });
    noteBlock.appendChild(editPersonalNoteBtn);

    detail.appendChild(noteBlock);
  } else {
    const addPersonalNoteBtn = document.createElement("button");
    addPersonalNoteBtn.type = "button";
    addPersonalNoteBtn.className = "secondary";
    addPersonalNoteBtn.textContent = "+ Personal note";
    addPersonalNoteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      editingGrammarPersonalNoteId = note.id;
      renderGrammarNoteList(note.themeId);
    });
    detail.appendChild(addPersonalNoteBtn);
  }

  const actionsRow = document.createElement("div");
  actionsRow.className = "grammar-note-actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "secondary edit-note-btn";
  editBtn.textContent = "Edit";
  editBtn.dataset.immersionKey = "btnEdit";
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    window.location.href = `grammar-add-note.html?themeId=${encodeURIComponent(note.themeId)}&noteId=${encodeURIComponent(note.id)}`;
  });
  actionsRow.appendChild(editBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "secondary delete-note-btn";
  deleteBtn.textContent = "Delete note";
  deleteBtn.dataset.immersionKey = "deleteNoteButton";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!confirm("Delete this note? This can't be undone.")) return;
    Storage.deleteGrammarNote(note.id);
    renderGrammarNoteList(note.themeId);
  });
  actionsRow.appendChild(deleteBtn);

  detail.appendChild(actionsRow);

  summary.addEventListener("click", () => {
    detail.hidden = !detail.hidden;
  });

  li.appendChild(summary);
  li.appendChild(detail);
  return li;
}

// A structure-card note: a named pattern, explained in the learner's own
// words, with their own (AI-checked) example sentences and any related
// variants nested underneath. Shares the personal-note editor and the
// Edit/Delete actions row with the legacy card above so both behave
// identically, but everything above that is different.
// A conjugation card's box on grammar-theme.html — just a clickable
// tile with the pattern name, matching the folder-tile look. No inline
// expand/collapse and no inline actions: clicking navigates straight to
// grammar-conjugation-note.html, where the explanation/examples/practice
// live as their own collapsible sections instead.
function buildConjugationNoteTile(note) {
  const li = document.createElement("li");
  li.className = "word-item grammar-note-item grammar-structure-card";
  li.style.setProperty("--card-color", grammarCardColorFor(note.id));
  li.style.cursor = "pointer";

  const headerEl = document.createElement("div");
  headerEl.className = "grammar-card-header";
  headerEl.textContent = note.header;
  li.appendChild(headerEl);

  if (note.tags && note.tags.length) {
    const tagsRow = document.createElement("div");
    tagsRow.className = "tag-row";
    note.tags.forEach((tag) => {
      const pill = document.createElement("span");
      pill.className = "tag-pill";
      pill.textContent = tag;
      tagsRow.appendChild(pill);
    });
    li.appendChild(tagsRow);
  }

  li.addEventListener("click", () => {
    window.location.href = `grammar-conjugation-note.html?noteId=${encodeURIComponent(note.id)}`;
  });
  li.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      window.location.href = `grammar-conjugation-note.html?noteId=${encodeURIComponent(note.id)}`;
    }
  });
  li.tabIndex = 0;

  return li;
}

function buildStructureCard(note) {
  const li = document.createElement("li");
  li.className = "word-item grammar-note-item grammar-structure-card";
  li.style.setProperty("--card-color", grammarCardColorFor(note.id));

  const summary = document.createElement("div");
  summary.className = "grammar-note-summary";
  summary.style.cursor = "pointer";

  const headerEl = document.createElement("div");
  headerEl.className = "grammar-card-header";
  headerEl.textContent = note.header;
  summary.appendChild(headerEl);

  if (note.tags && note.tags.length) {
    const tagsRow = document.createElement("div");
    tagsRow.className = "tag-row";
    note.tags.forEach((tag) => {
      const pill = document.createElement("span");
      pill.className = "tag-pill";
      pill.textContent = tag;
      tagsRow.appendChild(pill);
    });
    summary.appendChild(tagsRow);
  }

  const detail = document.createElement("div");
  detail.className = "grammar-note-detail";
  detail.hidden = true;

  if (note.grammarLabel) {
    const labelBadge = document.createElement("p");
    labelBadge.className = "grammar-card-label-badge";
    labelBadge.textContent = `Recognized as: ${note.grammarLabel}`;
    detail.appendChild(labelBadge);
  } else if (note.grammarLabelNote) {
    const noPointBadge = document.createElement("p");
    noPointBadge.className = "grammar-card-label-badge grammar-card-label-none";
    noPointBadge.textContent = "No single clear grammar point identified.";
    noPointBadge.dataset.immersionKey = "noPointIdentifiedText";
    detail.appendChild(noPointBadge);
  }

  if (note.explanation) {
    const explanationEl = document.createElement("p");
    explanationEl.className = "grammar-card-explanation";
    explanationEl.textContent = note.explanation;
    detail.appendChild(explanationEl);
  }

  if (note.examples && note.examples.length) {
    detail.appendChild(buildExamplesDisplayBlock(note.examples));
  }

  if (note.variants && note.variants.length) {
    note.variants.forEach((variant) => {
      detail.appendChild(buildVariantDisplayBlock(variant));
    });
  }

  const practicePanelWrap = document.createElement("div");
  practicePanelWrap.className = "card-practice-panel";
  practicePanelWrap.hidden = true;
  if (note.grammarLabel) {
    detail.appendChild(practicePanelWrap);
  }
  // Note: conjugation cards (practiceType === "conjugation") never
  // reach this function at all — buildGrammarNoteCard routes them to
  // buildConjugationNoteTile / grammar-conjugation-note.html instead,
  // where the same quiz (startConjugationPractice etc., further below)
  // gets its own page instead of an inline panel here.

  if (note.id === editingGrammarPersonalNoteId) {
    detail.appendChild(buildGrammarPersonalNoteEditor(note));
  } else if (note.notes) {
    const noteBlock = document.createElement("div");
    noteBlock.className = "helper-word-note";

    const noteText = document.createElement("span");
    noteText.className = "helper-word-note-text";
    noteText.textContent = note.notes;
    noteBlock.appendChild(noteText);

    const editPersonalNoteBtn = document.createElement("button");
    editPersonalNoteBtn.type = "button";
    editPersonalNoteBtn.className = "secondary";
    editPersonalNoteBtn.textContent = "Edit personal note";
    editPersonalNoteBtn.dataset.immersionKey = "editPersonalNoteButton";
    editPersonalNoteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      editingGrammarPersonalNoteId = note.id;
      renderGrammarNoteList(note.themeId);
    });
    noteBlock.appendChild(editPersonalNoteBtn);

    detail.appendChild(noteBlock);
  } else {
    const addPersonalNoteBtn = document.createElement("button");
    addPersonalNoteBtn.type = "button";
    addPersonalNoteBtn.className = "secondary";
    addPersonalNoteBtn.textContent = "+ Personal note";
    addPersonalNoteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      editingGrammarPersonalNoteId = note.id;
      renderGrammarNoteList(note.themeId);
    });
    detail.appendChild(addPersonalNoteBtn);
  }

  const actionsRow = document.createElement("div");
  actionsRow.className = "grammar-note-actions";

  if (note.grammarLabel) {
    const testBtn = document.createElement("button");
    testBtn.type = "button";
    testBtn.className = "secondary";
    testBtn.textContent = "Test me on this";
    testBtn.dataset.immersionKey = "testMeOnThisButton";
    testBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleCardPractice(note, practicePanelWrap);
    });
    actionsRow.appendChild(testBtn);
  }

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "secondary edit-note-btn";
  editBtn.textContent = "Edit";
  editBtn.dataset.immersionKey = "btnEdit";
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    window.location.href = `grammar-add-note.html?themeId=${encodeURIComponent(note.themeId)}&noteId=${encodeURIComponent(note.id)}`;
  });
  actionsRow.appendChild(editBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "secondary delete-note-btn";
  deleteBtn.textContent = "Delete note";
  deleteBtn.dataset.immersionKey = "deleteNoteButton";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!confirm("Delete this note? This can't be undone.")) return;
    Storage.deleteGrammarNote(note.id);
    renderGrammarNoteList(note.themeId);
  });
  actionsRow.appendChild(deleteBtn);

  detail.appendChild(actionsRow);

  summary.addEventListener("click", () => {
    detail.hidden = !detail.hidden;
  });

  li.appendChild(summary);
  li.appendChild(detail);
  return li;
}

function buildExamplesDisplayBlock(examples) {
  const wrap = document.createElement("div");
  wrap.className = "grammar-card-examples";
  examples.forEach((ex) => {
    const exBlock = document.createElement("div");
    exBlock.className = "grammar-card-example";

    const targetEl = document.createElement("p");
    targetEl.className = "grammar-card-example-target";
    targetEl.textContent = ex.target;
    exBlock.appendChild(targetEl);

    if (ex.translation) {
      const transEl = document.createElement("p");
      transEl.className = "grammar-card-example-translation";
      transEl.textContent = ex.translation;
      exBlock.appendChild(transEl);
    }

    wrap.appendChild(exBlock);
  });
  return wrap;
}

function buildVariantDisplayBlock(variant) {
  const wrap = document.createElement("div");
  wrap.className = "grammar-card-variant";

  if (variant.label) {
    const labelEl = document.createElement("p");
    labelEl.className = "grammar-card-variant-label";
    labelEl.textContent = variant.label;
    wrap.appendChild(labelEl);
  }

  if (variant.examples && variant.examples.length) {
    wrap.appendChild(buildExamplesDisplayBlock(variant.examples));
  }

  return wrap;
}

// ---- "Test me on this" — self-graded practice for one structure card ----
// One session per note id, kept in memory only (not persisted) — closing
// and reopening the panel, or leaving the page, starts fresh.
const grammarCardPracticeSessions = {};

function toggleCardPractice(note, panelEl) {
  const isOpen = !panelEl.hidden;
  if (isOpen) {
    panelEl.hidden = true;
    return;
  }
  panelEl.hidden = false;
  if (!grammarCardPracticeSessions[note.id]) {
    startCardPractice(note, panelEl);
  } else {
    renderCardPracticePanel(note, panelEl);
  }
}

async function startCardPractice(note, panelEl) {
  const session = { items: [], index: 0, correct: 0, total: 0, revealed: false, loading: true, error: null, usedSentences: [] };
  grammarCardPracticeSessions[note.id] = session;
  renderCardPracticePanel(note, panelEl);

  await fetchMoreCardPracticeItems(note);
  renderCardPracticePanel(note, panelEl);
}

async function fetchMoreCardPracticeItems(note) {
  const session = grammarCardPracticeSessions[note.id];
  if (!session) return;

  session.loading = true;
  session.error = null;

  const result = await Translate.generateCardPractice(
    note.header,
    note.explanation,
    note.grammarLabel,
    note.examples,
    note.language || (Storage.getGrammarTheme(note.themeId) || {}).language || "es",
    session.usedSentences
  );

  session.loading = false;

  if (result.error || !result.items || result.items.length === 0) {
    session.error = result.error || "Couldn't generate any practice right now — try again in a moment.";
    return;
  }

  result.items.forEach((item) => {
    if (!item || !item.promptEnglish || !item.exampleAnswer) return;
    session.items.push(item);
    session.usedSentences.push(item.exampleAnswer);
  });
}

function renderCardPracticePanel(note, panelEl) {
  const session = grammarCardPracticeSessions[note.id];
  panelEl.innerHTML = "";
  if (!session) return;

  const scoreEl = document.createElement("div");
  scoreEl.className = "card-practice-score";
  scoreEl.textContent = session.total > 0 ? `${session.correct} / ${session.total} self-marked correct` : "";
  panelEl.appendChild(scoreEl);

  if (session.loading) {
    const loadingEl = document.createElement("p");
    loadingEl.className = "hint";
    loadingEl.textContent = "Generating practice…";
    panelEl.appendChild(loadingEl);
    return;
  }

  if (session.error) {
    const errorEl = document.createElement("p");
    errorEl.className = "hint";
    errorEl.textContent = session.error;
    panelEl.appendChild(errorEl);

    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "secondary";
    retryBtn.textContent = "Try again";
    retryBtn.dataset.immersionKey = "tryAgainButton";
    retryBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await fetchMoreCardPracticeItems(note);
      renderCardPracticePanel(note, panelEl);
    });
    panelEl.appendChild(retryBtn);
    return;
  }

  if (session.index >= session.items.length) {
    // Ran out of items — fetch more automatically rather than dead-ending.
    fetchMoreCardPracticeItems(note).then(() => renderCardPracticePanel(note, panelEl));
    const loadingEl = document.createElement("p");
    loadingEl.className = "hint";
    loadingEl.textContent = "Generating more practice…";
    panelEl.appendChild(loadingEl);
    return;
  }

  const item = session.items[session.index];

  const promptEl = document.createElement("p");
  promptEl.className = "card-practice-prompt";
  promptEl.textContent = item.promptEnglish;
  panelEl.appendChild(promptEl);

  const answerInput = document.createElement("textarea");
  answerInput.rows = 2;
  answerInput.placeholder = "Write your own attempt here…";
  answerInput.className = "card-practice-input";
  panelEl.appendChild(answerInput);

  if (!session.revealed) {
    const revealBtn = document.createElement("button");
    revealBtn.type = "button";
    revealBtn.textContent = "Show answer";
    revealBtn.dataset.immersionKey = "showAnswerButton";
    revealBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      session.revealed = true;
      renderCardPracticePanel(note, panelEl);
    });
    panelEl.appendChild(revealBtn);
  } else {
    const answerEl = document.createElement("p");
    answerEl.className = "card-practice-answer";
    answerEl.textContent = `Model answer: ${item.exampleAnswer}`;
    panelEl.appendChild(answerEl);

    const judgeRow = document.createElement("div");
    judgeRow.className = "card-practice-judge-row";

    const gotItBtn = document.createElement("button");
    gotItBtn.type = "button";
    gotItBtn.textContent = "Got it";
    gotItBtn.dataset.immersionKey = "gotItButton";
    gotItBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      session.total += 1;
      session.correct += 1;
      session.index += 1;
      session.revealed = false;
      renderCardPracticePanel(note, panelEl);
    });
    judgeRow.appendChild(gotItBtn);

    const missedBtn = document.createElement("button");
    missedBtn.type = "button";
    missedBtn.className = "secondary";
    missedBtn.textContent = "Missed it";
    missedBtn.dataset.immersionKey = "missedItButton";
    missedBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      session.total += 1;
      session.index += 1;
      session.revealed = false;
      renderCardPracticePanel(note, panelEl);
    });
    judgeRow.appendChild(missedBtn);

    panelEl.appendChild(judgeRow);
  }

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "secondary card-practice-close";
  closeBtn.textContent = "Close practice";
  closeBtn.dataset.immersionKey = "closePracticeButton";
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    panelEl.hidden = true;
  });
  panelEl.appendChild(closeBtn);
}

// ---------------------------------------------------------------------
// Conjugation practice (Potential/Passive/Causative/Causative-passive)
// ---------------------------------------------------------------------
// Fully local — no AI call, no network — unlike the generic AI practice
// panel above. Verbs are conjugated with ja-conjugator.js, drawing from
// its built-in common-verb list plus any verb saved in Vocab Bank that
// got tagged with a conjugation class (see storage.js's getVerbWords
// and vocab-app.js's pendingVerbInfo). English -> Japanese is checked
// automatically (it's an exact-match problem — see
// JaConjugator.checkJapaneseAnswer); Japanese -> English is self-graded
// like the AI panel, since grading free-form English reliably without
// AI isn't realistic.

const conjugationPracticeSessions = {};

function toggleConjugationPractice(note, panelEl) {
  const isOpen = !panelEl.hidden;
  if (isOpen) {
    panelEl.hidden = true;
    return;
  }
  panelEl.hidden = false;
  if (!conjugationPracticeSessions[note.id]) {
    startConjugationPractice(note, panelEl);
  } else {
    renderConjugationPracticePanel(note, panelEl);
  }
}

// Combines the built-in common-verb list with any tagged verb from
// Vocab Bank for this language, normalized to the shape ja-conjugator
// expects ({ kanji, reading, meaning, class }). Vocab Bank verbs come
// first so your own saved words show up in the rotation right away
// rather than being drowned out by the ~70 built-in ones.
function buildConjugationVerbPool(language) {
  const fromVocab = (Storage.getVerbWords ? Storage.getVerbWords(language) : []).map((w) => ({
    kanji: w.targetLang,
    reading: w.furigana,
    meaning: w.english,
    class: w.verbClass,
  }));
  const seen = new Set(fromVocab.map((v) => v.kanji));
  const fromBuiltIn = (window.JaConjugator ? JaConjugator.COMMON_VERBS : []).filter((v) => !seen.has(v.kanji));
  return [...fromVocab, ...fromBuiltIn];
}

// Weighted by verb CLASS, not by individual verb — every irregular-suru
// verb (勉強する, 電話する, 掃除する...) conjugates by the exact same
// rule regardless of which one it is, so picking uniformly at random
// across the whole pool let them crowd out godan verbs (which actually
// vary a lot depending on the final kana) purely because there happen
// to be several suru-compounds sitting in the list. Weighting by class
// first means suru shows up roughly this often regardless of how many
// suru verbs you've got saved or built-in — godan still gets the most
// reps since it's genuinely the form with the most to practice.
const CONJUGATION_CLASS_WEIGHTS = { godan: 0.45, ichidan: 0.35, "irregular-suru": 0.15, "irregular-kuru": 0.05 };

function pickRandomVerb(pool, avoidKanji) {
  if (!pool.length) return null;
  if (pool.length === 1) return pool[0];

  const byClass = {};
  pool.forEach((v) => {
    (byClass[v.class] = byClass[v.class] || []).push(v);
  });
  const classes = Object.keys(byClass);
  const weighted = classes.map((cls) => ({ cls, weight: CONJUGATION_CLASS_WEIGHTS[cls] ?? 1 / classes.length }));
  const totalWeight = weighted.reduce((sum, c) => sum + c.weight, 0) || 1;

  function pickClass() {
    let r = Math.random() * totalWeight;
    for (const c of weighted) {
      if (r < c.weight) return c.cls;
      r -= c.weight;
    }
    return weighted[weighted.length - 1].cls;
  }

  let choice;
  let guard = 0;
  do {
    const verbsInClass = byClass[pickClass()];
    choice = verbsInClass[Math.floor(Math.random() * verbsInClass.length)];
    guard += 1;
  } while (choice.kanji === avoidKanji && guard < 20);

  return choice;
}

async function startConjugationPractice(note, panelEl) {
  const language = (Storage.getGrammarTheme && Storage.getGrammarTheme(note.themeId) || {}).language || "ja";
  const session = {
    direction: "mixed", // "enToJa" | "jaToEn" | "mixed"
    pool: buildConjugationVerbPool(language),
    verb: null,
    currentDirection: null,
    typedAnswer: "",
    checked: false,
    lastCorrect: null,
    revealed: false,
    correct: 0,
    total: 0,
  };
  conjugationPracticeSessions[note.id] = session;
  nextConjugationQuestion(session);
  renderConjugationPracticePanel(note, panelEl);
}

function nextConjugationQuestion(session) {
  session.verb = pickRandomVerb(session.pool, session.verb && session.verb.kanji);
  session.currentDirection = session.direction === "mixed" ? (Math.random() < 0.5 ? "enToJa" : "jaToEn") : session.direction;
  session.typedAnswer = "";
  session.checked = false;
  session.lastCorrect = null;
  session.revealed = false;
}

function renderConjugationPracticePanel(note, panelEl) {
  const session = conjugationPracticeSessions[note.id];
  panelEl.innerHTML = "";
  if (!session) return;

  const directionRow = document.createElement("div");
  directionRow.className = "card-practice-direction-row";
  const directionLabel = document.createElement("label");
  directionLabel.textContent = "Direction: ";
  const directionSelect = document.createElement("select");
  [
    ["mixed", "Mixed"],
    ["enToJa", "English → Japanese"],
    ["jaToEn", "Japanese → English"],
  ].forEach(([value, label]) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    if (value === session.direction) opt.selected = true;
    directionSelect.appendChild(opt);
  });
  directionSelect.addEventListener("click", (e) => e.stopPropagation());
  directionSelect.addEventListener("change", (e) => {
    e.stopPropagation();
    session.direction = directionSelect.value;
    nextConjugationQuestion(session);
    renderConjugationPracticePanel(note, panelEl);
  });
  directionLabel.appendChild(directionSelect);
  directionRow.appendChild(directionLabel);
  panelEl.appendChild(directionRow);

  const scoreEl = document.createElement("div");
  scoreEl.className = "card-practice-score";
  scoreEl.textContent = session.total > 0 ? `${session.correct} / ${session.total} correct` : "";
  panelEl.appendChild(scoreEl);

  if (!session.pool.length || !session.verb) {
    const emptyEl = document.createElement("p");
    emptyEl.className = "hint";
    emptyEl.textContent = "No verbs available to practice with right now.";
    panelEl.appendChild(emptyEl);
    return;
  }

  const verb = session.verb;
  const form = note.conjugationForm;
  const conjugated = JaConjugator.conjugate(verb, form);

  if (session.currentDirection === "enToJa") {
    const promptEl = document.createElement("p");
    promptEl.className = "card-practice-prompt";
    promptEl.textContent = `${verb.kanji} (${verb.reading}) — ${verb.meaning}. Type the ${JaConjugator.FORM_LABELS[form].split(" —")[0]} form:`;
    panelEl.appendChild(promptEl);

    const answerInput = document.createElement("input");
    answerInput.type = "text";
    answerInput.className = "card-practice-input";
    answerInput.value = session.typedAnswer;
    answerInput.placeholder = "答えを入力…";
    answerInput.addEventListener("click", (e) => e.stopPropagation());
    answerInput.addEventListener("input", (e) => {
      session.typedAnswer = e.target.value;
    });
    panelEl.appendChild(answerInput);

    if (!session.checked) {
      const checkBtn = document.createElement("button");
      checkBtn.type = "button";
      checkBtn.textContent = "Check";
      checkBtn.dataset.immersionKey = "checkButton";
      checkBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const result = JaConjugator.checkJapaneseAnswer(verb, form, session.typedAnswer);
        session.checked = true;
        session.lastCorrect = result.correct;
        session.total += 1;
        if (result.correct) session.correct += 1;
        renderConjugationPracticePanel(note, panelEl);
      });
      panelEl.appendChild(checkBtn);
    } else {
      const resultEl = document.createElement("p");
      resultEl.className = session.lastCorrect ? "card-practice-answer" : "card-practice-answer card-practice-wrong";
      resultEl.textContent = session.lastCorrect
        ? "Correct!"
        : `Not quite — accepted: ${JaConjugator.acceptableAnswers(verb, form).join(" / ")}`;
      panelEl.appendChild(resultEl);

      const nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.textContent = "Next";
      nextBtn.dataset.immersionKey = "nextButton";
      nextBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        nextConjugationQuestion(session);
        renderConjugationPracticePanel(note, panelEl);
      });
      panelEl.appendChild(nextBtn);
    }
  } else {
    // jaToEn — free-form English, so self-graded rather than
    // auto-checked (see the file-header comment on this section).
    const promptEl = document.createElement("p");
    promptEl.className = "card-practice-prompt";
    promptEl.textContent = `${conjugated.kanji} (${conjugated.reading}) — what does this mean? (${JaConjugator.FORM_LABELS[form]})`;
    panelEl.appendChild(promptEl);

    const answerInput = document.createElement("input");
    answerInput.type = "text";
    answerInput.className = "card-practice-input";
    answerInput.placeholder = "Your answer in English…";
    answerInput.value = session.typedAnswer;
    answerInput.addEventListener("click", (e) => e.stopPropagation());
    answerInput.addEventListener("input", (e) => {
      session.typedAnswer = e.target.value;
    });
    panelEl.appendChild(answerInput);

    if (!session.revealed) {
      const revealBtn = document.createElement("button");
      revealBtn.type = "button";
      revealBtn.textContent = "Show answer";
    revealBtn.dataset.immersionKey = "showAnswerButton";
      revealBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        session.revealed = true;
        renderConjugationPracticePanel(note, panelEl);
      });
      panelEl.appendChild(revealBtn);
    } else {
      const answerEl = document.createElement("p");
      answerEl.className = "card-practice-answer";
      answerEl.textContent = `Model answer: ${JaConjugator.englishGloss(verb.meaning, form)}`;
      panelEl.appendChild(answerEl);

      const judgeRow = document.createElement("div");
      judgeRow.className = "card-practice-judge-row";

      const gotItBtn = document.createElement("button");
      gotItBtn.type = "button";
      gotItBtn.textContent = "Got it";
    gotItBtn.dataset.immersionKey = "gotItButton";
      gotItBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        session.total += 1;
        session.correct += 1;
        nextConjugationQuestion(session);
        renderConjugationPracticePanel(note, panelEl);
      });
      judgeRow.appendChild(gotItBtn);

      const missedBtn = document.createElement("button");
      missedBtn.type = "button";
      missedBtn.className = "secondary";
      missedBtn.textContent = "Missed it";
    missedBtn.dataset.immersionKey = "missedItButton";
      missedBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        session.total += 1;
        nextConjugationQuestion(session);
        renderConjugationPracticePanel(note, panelEl);
      });
      judgeRow.appendChild(missedBtn);

      panelEl.appendChild(judgeRow);
    }
  }

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "secondary card-practice-close";
  closeBtn.textContent = "Close practice";
  closeBtn.dataset.immersionKey = "closePracticeButton";
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    panelEl.hidden = true;
  });
  panelEl.appendChild(closeBtn);
}

// A small textarea + Save/Cancel for a Grammar note's personal
// note/question — mirrors the Writing Helper Notebook's own note editor
// exactly, down to the class names, so the two features feel identical.
function buildGrammarPersonalNoteEditor(note) {
  const wrapper = document.createElement("div");
  wrapper.className = "helper-word-note-edit";

  const textarea = document.createElement("textarea");
  textarea.className = "helper-word-note-input";
  textarea.rows = 2;
  textarea.placeholder = "A question or note about this grammar point (why this form, when to use it, etc.)";
  textarea.value = note.notes || "";
  wrapper.appendChild(textarea);

  const btnRow = document.createElement("div");
  btnRow.className = "helper-word-note-edit-actions";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "Save note";
  saveBtn.dataset.immersionKey = "saveNoteButton";
  saveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    Storage.updateGrammarNote(note.id, { notes: textarea.value.trim() });
    editingGrammarPersonalNoteId = null;
    renderGrammarNoteList(note.themeId);
  });
  btnRow.appendChild(saveBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "secondary";
  cancelBtn.textContent = "Cancel";
  cancelBtn.dataset.immersionKey = "btnCancel";
  cancelBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    editingGrammarPersonalNoteId = null;
    renderGrammarNoteList(note.themeId);
  });
  btnRow.appendChild(cancelBtn);

  wrapper.appendChild(btnRow);
  return wrapper;
}

// ---------------------------------------------------------------------
// grammar-add-note.html — the note form
// ---------------------------------------------------------------------

// The language context for grammar-add-note.html — resolved from the
// folder being added to (themeId, the normal case: reached via a
// specific folder's "+ Add note" link) so the folder-switcher select
// only ever offers same-language folders, falling back to ?lang= (if
// ever linked to directly without a themeId) and finally "es".
let activeNoteLang = "es";

// Which of the two note-entry flows the form is currently showing:
// "card" is the structure-card flow (named pattern + own-words
// explanation + your own checked example sentences + related variants)
// — the default for a note started fresh from inside a folder. "legacy"
// is the original one-sentence quick-capture flow, kept exactly as it
// was for the Reading/Writing "save to Grammar" handoffs and for
// editing notes that already exist in that shape, since those
// integrations depend on its specific fields.
let noteFormMode = "card";
let cardExamples = [];
let cardVariants = [];

// What grammar point (if any) the card's own header/explanation/
// examples were last classified as — null label with a non-empty note
// means "no single clear point found," which is a real, valid outcome
// (see CLASSIFY_GRAMMAR_POINT_PROMPT on the server), not a failure.
let cardGrammarLabel = null;
let cardGrammarLabelNote = "";
let cardClassifying = false;
let cardLastClassifiedKey = ""; // header+explanation+examples snapshot, to skip redundant re-checks

// A freshly-classified label is only a SUGGESTION until explicitly
// accepted — handleGrammarNoteSubmit only saves grammarLabel (and so
// only enables "Test me on this" later) once this is true. Discarding a
// suggestion clears the label entirely rather than just hiding it, so a
// pattern you disagreed with never silently gets saved anyway.
let cardGrammarLabelConfirmed = false;

function makeEmptyExample() {
  return { id: Storage.uid(), target: "", translation: "", checked: false, corrected: "", note: "", checking: false, checkError: null, lastCheckedText: "" };
}

function applyNoteFormMode() {
  const legacyFields = document.getElementById("legacy-note-fields");
  const cardFields = document.getElementById("structure-card-fields");
  if (legacyFields) legacyFields.hidden = noteFormMode !== "legacy";
  if (cardFields) cardFields.hidden = noteFormMode !== "card";

  const toggle = document.getElementById("note-mode-toggle");
  if (!toggle) return;
  toggle.innerHTML = "";
  const link = document.createElement("a");
  link.href = "#";
  link.textContent =
    noteFormMode === "card" ? "Or capture a single sentence instead →" : "← Or build a structure card instead";
  link.addEventListener("click", (e) => {
    e.preventDefault();
    noteFormMode = noteFormMode === "card" ? "legacy" : "card";
    applyNoteFormMode();
  });
  toggle.appendChild(link);
}

// A snapshot key of everything classification depends on, so a re-check
// can skip itself if nothing actually changed since the last one.
function cardClassifyKey() {
  const header = (document.getElementById("card-header").value || "").trim();
  const explanation = (document.getElementById("card-explanation").value || "").trim();
  const exampleText = cardExamples.map((ex) => (ex.target || "").trim()).filter(Boolean).join("|");
  return `${header} ${explanation} ${exampleText}`;
}

function renderCardClassifyStatus() {
  const el = document.getElementById("card-classify-status");
  if (!el) return;
  el.innerHTML = "";

  if (!cardClassifying && !cardGrammarLabel && !cardGrammarLabelNote) {
    el.hidden = true;
    return;
  }
  el.hidden = false;

  if (cardClassifying) {
    el.classList.remove("card-classify-issue", "card-classify-ok");
    el.textContent = "Identifying the grammar point…";
    return;
  }

  if (cardGrammarLabel) {
    el.classList.add("card-classify-ok");
    el.classList.remove("card-classify-issue");
    const labelLine = document.createElement("p");
    labelLine.textContent = cardGrammarLabelConfirmed
      ? `✓ Saved as: ${cardGrammarLabel}`
      : `Recognized as: ${cardGrammarLabel}`;
    el.appendChild(labelLine);
  } else {
    el.classList.add("card-classify-issue");
    el.classList.remove("card-classify-ok");
    const noPointLine = document.createElement("p");
    noPointLine.textContent = "No single clear grammar point found yet.";
    noPointLine.dataset.immersionKey = "noPointFoundYetText";
    el.appendChild(noPointLine);
  }

  if (cardGrammarLabelNote) {
    const noteLine = document.createElement("p");
    noteLine.className = "hint";
    noteLine.textContent = cardGrammarLabelNote;
    el.appendChild(noteLine);
  }

  // A label you haven't accepted yet is just a suggestion — it isn't
  // saved with the note (and so can't be tested on later) until you
  // explicitly accept it, or it's cleared entirely if you discard it.
  if (cardGrammarLabel && !cardGrammarLabelConfirmed) {
    const acceptBtn = document.createElement("button");
    acceptBtn.type = "button";
    acceptBtn.textContent = "Accept";
    acceptBtn.dataset.immersionKey = "acceptButton";
    acceptBtn.addEventListener("click", (e) => {
      e.preventDefault();
      cardGrammarLabelConfirmed = true;
      renderCardClassifyStatus();
    });
    el.appendChild(acceptBtn);

    const discardBtn = document.createElement("button");
    discardBtn.type = "button";
    discardBtn.className = "secondary";
    discardBtn.textContent = "Discard";
    discardBtn.dataset.immersionKey = "discardButton";
    discardBtn.addEventListener("click", (e) => {
      e.preventDefault();
      cardGrammarLabel = null;
      cardGrammarLabelNote = "";
      cardGrammarLabelConfirmed = false;
      renderCardClassifyStatus();
    });
    el.appendChild(discardBtn);
  } else if (cardGrammarLabelConfirmed) {
    const undoBtn = document.createElement("button");
    undoBtn.type = "button";
    undoBtn.className = "secondary";
    undoBtn.textContent = "Undo";
    undoBtn.dataset.immersionKey = "undoButton";
    undoBtn.addEventListener("click", (e) => {
      e.preventDefault();
      cardGrammarLabelConfirmed = false;
      renderCardClassifyStatus();
    });
    el.appendChild(undoBtn);
  }

  const recheckLink = document.createElement("a");
  recheckLink.href = "#";
  recheckLink.textContent = "Re-check";
  recheckLink.dataset.immersionKey = "recheckLinkText";
  recheckLink.addEventListener("click", (e) => {
    e.preventDefault();
    runCardClassify(true);
  });
  el.appendChild(recheckLink);
}

async function runCardClassify(force) {
  const header = (document.getElementById("card-header").value || "").trim();
  const explanation = (document.getElementById("card-explanation").value || "").trim();
  if (!header) return;

  const key = cardClassifyKey();
  if (!force && key === cardLastClassifiedKey) return;

  cardClassifying = true;
  renderCardClassifyStatus();

  const examples = cardExamples.filter((ex) => (ex.target || "").trim());
  const result = await Translate.classifyGrammarPoint(header, explanation, examples, activeNoteLang);

  cardClassifying = false;
  cardLastClassifiedKey = key;

  if (result.error) {
    cardGrammarLabel = null;
    cardGrammarLabelNote = result.error;
    cardGrammarLabelConfirmed = false;
    renderCardClassifyStatus();
    return;
  }

  cardGrammarLabel = result.label;
  cardGrammarLabelNote = result.note || "";
  cardGrammarLabelConfirmed = false; // a fresh result always needs re-accepting
  renderCardClassifyStatus();
}

function initGrammarAddNotePage() {
  const form = document.getElementById("grammar-note-form");
  if (!form) return; // not this page

  const themeIdFromUrl = getQueryParam("themeId");
  const existingTheme = themeIdFromUrl ? Storage.getGrammarTheme(themeIdFromUrl) : null;
  activeNoteLang = (existingTheme && existingTheme.language) || getQueryParam("lang") || "es";

  // Editing an existing note (reached via its "Edit" button on
  // grammar-theme.html) reuses this same form instead of a separate
  // page — same fields, just pre-filled, and the submit handler updates
  // in place instead of creating a new note.
  const noteIdFromUrl = getQueryParam("noteId");
  const existingNote = noteIdFromUrl ? Storage.getGrammarNote(noteIdFromUrl) : null;

  const header = document.getElementById("grammar-note-header");
  if (header) header.classList.add(`lang-${activeNoteLang}`);
  const heading = document.getElementById("grammar-note-heading");
  if (heading) heading.textContent = existingNote ? "Edit grammar note" : "New grammar note";
  const submitBtn = document.getElementById("note-submit-btn");
  if (submitBtn) submitBtn.textContent = existingNote ? "Save changes" : "Save note";
  const sentenceLabel = document.getElementById("note-sentence-label");
  if (sentenceLabel) sentenceLabel.textContent = `${GRAMMAR_LANGUAGE_NAMES[activeNoteLang]} sentence or phrase`;
  initTopbar(activeNoteLang);
  if (typeof initHubTasks === "function") initHubTasks(activeNoteLang);
  initAppTabs(null); // a transient note-entry form, not a unit to pin

  let sourcePassageId = existingNote ? existingNote.sourcePassageId || null : null;
  let sourcePassageTitle = existingNote ? existingNote.sourcePassageTitle || null : null;

  // Peek at a pending Reading/Writing handoff without consuming it yet
  // — only actually consumed once legacy mode is settled on below, but
  // we need to know whether one exists before choosing a mode at all.
  const pendingRaw = !existingNote ? sessionStorage.getItem(PENDING_GRAMMAR_NOTE_KEY) : null;

  // Reset per-visit classification state — set below when editing a
  // card that already has one.
  cardGrammarLabel = null;
  cardGrammarLabelNote = "";
  cardGrammarLabelConfirmed = false;
  cardClassifying = false;
  cardLastClassifiedKey = "";

  if (existingNote && existingNote.header) {
    // A note already built as a structure card — edit it as one.
    noteFormMode = "card";
    document.getElementById("card-header").value = existingNote.header || "";
    document.getElementById("card-explanation").value = existingNote.explanation || "";
    cardExamples = (existingNote.examples && existingNote.examples.length
      ? existingNote.examples
      : [{}]
    ).map((ex) => ({ ...makeEmptyExample(), ...ex, checking: false }));
    cardVariants = (existingNote.variants || []).map((v) => ({
      id: v.id || Storage.uid(),
      label: v.label || "",
      examples: (v.examples && v.examples.length ? v.examples : [{}]).map((ex) => ({
        ...makeEmptyExample(),
        ...ex,
        checking: false,
      })),
    }));
    document.getElementById("note-tags").value = (existingNote.tags || []).join(", ");
    cardGrammarLabel = existingNote.grammarLabel || null;
    cardGrammarLabelNote = existingNote.grammarLabelNote || "";
    // Only a confirmed label is ever saved (see handleGrammarNoteSubmit),
    // so a note that already has one means it was already accepted.
    cardGrammarLabelConfirmed = !!existingNote.grammarLabel;
    cardLastClassifiedKey = cardGrammarLabel || cardGrammarLabelNote ? cardClassifyKey() : "";
  } else if (existingNote) {
    // A note in the original single-sentence shape — edit it in that
    // same shape rather than trying to guess a header/explanation split
    // that was never written down.
    noteFormMode = "legacy";
    document.getElementById("note-sentence").value = existingNote.sentence || "";
    if (existingNote.translation) showNoteTranslation(existingNote.translation);
    if (existingNote.explanation) {
      const explanationEl = document.getElementById("note-explanation-display");
      if (explanationEl) {
        explanationEl.hidden = false;
        explanationEl.textContent = `From grammar check: ${existingNote.explanation}`;
      }
    }
    document.getElementById("note-notes").value = existingNote.notes || "";
    document.getElementById("note-tags").value = (existingNote.tags || []).join(", ");
    cardExamples = [makeEmptyExample()];
    cardVariants = [];
  } else if (pendingRaw) {
    // Arriving from a phrase selected while reading (or a Writing
    // correction) — pre-fill and consume the handoff so it doesn't
    // linger for a later, unrelated visit. This is a single-sentence
    // capture by nature, so it stays in legacy mode.
    noteFormMode = "legacy";
    sessionStorage.removeItem(PENDING_GRAMMAR_NOTE_KEY);
    try {
      const data = JSON.parse(pendingRaw);
      if (data.sentence) document.getElementById("note-sentence").value = data.sentence;
      if (data.translation) showNoteTranslation(data.translation);
      if (data.explanation || data.structure) showNoteHint(data.structure, data.explanation);
      sourcePassageId = data.sourcePassageId || null;
      sourcePassageTitle = data.sourcePassageTitle || null;
    } catch (e) {
      console.warn("Could not read the handed-off grammar note data.", e);
    }
    cardExamples = [makeEmptyExample()];
    cardVariants = [];
  } else {
    // A fresh note started from inside a folder — the new default.
    noteFormMode = "card";
    cardExamples = [makeEmptyExample()];
    cardVariants = [];
  }

  applyNoteFormMode();
  renderCardExamplesList();
  renderCardVariantsList();
  renderCardClassifyStatus();

  renderGrammarThemeOptions(themeIdFromUrl || (existingNote && existingNote.themeId));

  const backLink = document.getElementById("grammar-note-back-link");
  const backToThemeId = themeIdFromUrl || (existingNote && existingNote.themeId);
  if (backLink && backToThemeId) {
    backLink.href = `grammar-theme.html?id=${encodeURIComponent(backToThemeId)}`;
    backLink.textContent = "← Back to folder";
  }

  const fetchBtn = document.getElementById("fetch-translation-btn");
  if (fetchBtn) fetchBtn.addEventListener("click", handleFetchTranslationClick);

  const themeSelect = document.getElementById("note-theme-select");
  if (themeSelect) themeSelect.addEventListener("change", handleGrammarThemeSelectChange);

  const newFolderBtn = document.getElementById("note-new-folder-btn");
  if (newFolderBtn) newFolderBtn.addEventListener("click", createGrammarTheme);

  const cardHeaderInput = document.getElementById("card-header");
  const cardExplanationInput = document.getElementById("card-explanation");
  if (cardExplanationInput) {
    cardExplanationInput.addEventListener("blur", () => runCardClassify(false));
  }
  if (cardHeaderInput) {
    cardHeaderInput.addEventListener("blur", () => runCardClassify(false));
  }
  const classifyBtn = document.getElementById("card-classify-btn");
  if (classifyBtn) {
    classifyBtn.addEventListener("click", () => runCardClassify(true));
  }

  // Opening an existing card that was saved before ever being checked
  // (or before this feature existed) shouldn't require the person to
  // know to click into and back out of a field — check it automatically
  // the moment the page loads, as long as there's enough to judge.
  if (noteFormMode === "card" && !cardGrammarLabel && !cardGrammarLabelNote && cardExamples.some((ex) => (ex.target || "").trim())) {
    runCardClassify(true);
  }

  const addExampleBtn = document.getElementById("card-add-example-btn");
  if (addExampleBtn) {
    addExampleBtn.addEventListener("click", () => {
      cardExamples.push(makeEmptyExample());
      renderCardExamplesList();
    });
  }

  const addVariantBtn = document.getElementById("card-add-variant-btn");
  if (addVariantBtn) {
    addVariantBtn.addEventListener("click", () => {
      cardVariants.push({ id: Storage.uid(), label: "", examples: [makeEmptyExample()] });
      renderCardVariantsList();
    });
  }

  form.addEventListener("submit", (e) =>
    handleGrammarNoteSubmit(e, () => ({ sourcePassageId, sourcePassageTitle }), existingNote ? existingNote.id : null)
  );
}

// ---- Structure card: examples + variants sub-UI ----

function renderCardExamplesList() {
  const container = document.getElementById("card-examples-list");
  if (!container) return;
  container.innerHTML = "";
  cardExamples.forEach((example) => {
    container.appendChild(buildExampleRow(example, cardExamples, renderCardExamplesList));
  });
}

function renderCardVariantsList() {
  const container = document.getElementById("card-variants-list");
  if (!container) return;
  container.innerHTML = "";
  cardVariants.forEach((variant) => {
    container.appendChild(buildVariantBlock(variant));
  });
}

function buildVariantBlock(variant) {
  const wrap = document.createElement("div");
  wrap.className = "card-variant-block";

  const labelRow = document.createElement("div");
  labelRow.className = "card-variant-label-row";

  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.placeholder = 'How does this variant differ? e.g. "when it\'s someone else\'s want, not mine"';
  labelInput.value = variant.label || "";
  labelInput.addEventListener("input", () => {
    variant.label = labelInput.value;
  });
  labelRow.appendChild(labelInput);

  const removeVariantBtn = document.createElement("button");
  removeVariantBtn.type = "button";
  removeVariantBtn.className = "secondary";
  removeVariantBtn.textContent = "Remove variant";
  removeVariantBtn.dataset.immersionKey = "removeVariantButton";
  removeVariantBtn.addEventListener("click", () => {
    cardVariants = cardVariants.filter((v) => v.id !== variant.id);
    renderCardVariantsList();
  });
  labelRow.appendChild(removeVariantBtn);

  wrap.appendChild(labelRow);

  const examplesContainer = document.createElement("div");
  examplesContainer.className = "card-examples-list";
  variant.examples.forEach((example) => {
    examplesContainer.appendChild(buildExampleRow(example, variant.examples, renderCardVariantsList));
  });
  wrap.appendChild(examplesContainer);

  const addExampleBtn = document.createElement("button");
  addExampleBtn.type = "button";
  addExampleBtn.className = "secondary";
  addExampleBtn.textContent = "+ Add example";
  addExampleBtn.addEventListener("click", () => {
    variant.examples.push(makeEmptyExample());
    renderCardVariantsList();
  });
  wrap.appendChild(addExampleBtn);

  return wrap;
}

// One example-sentence row in the add-note form: target-language text +
// translation, auto-checked via AI when the target field loses focus.
// ownerArray is whichever array (cardExamples, or one variant's own
// examples) this row actually lives in, so Remove can splice the right
// place; rerender is called after any state change so the checked/
// checking status re-renders.
function buildExampleRow(example, ownerArray, rerender) {
  const row = document.createElement("div");
  row.className = "card-example-row";

  const targetLabel = document.createElement("label");
  targetLabel.className = "card-example-field";
  const targetCaption = document.createElement("span");
  targetCaption.textContent = `${GRAMMAR_LANGUAGE_NAMES[activeNoteLang] || ""} example`;
  targetLabel.appendChild(targetCaption);
  const targetInput = document.createElement("textarea");
  targetInput.rows = 1;
  targetInput.value = example.target || "";
  targetInput.addEventListener("input", () => {
    example.target = targetInput.value;
  });
  targetInput.addEventListener("blur", () => {
    const text = example.target.trim();
    if (text && text !== example.lastCheckedText) runExampleCheck(example, rerender);
  });
  targetLabel.appendChild(targetInput);
  row.appendChild(targetLabel);

  const translationLabel = document.createElement("label");
  translationLabel.className = "card-example-field";
  const translationCaption = document.createElement("span");
  translationCaption.textContent = "Translation";
  translationCaption.dataset.immersionKey = "translationLabel";
  translationLabel.appendChild(translationCaption);
  const translationInput = document.createElement("input");
  translationInput.type = "text";
  translationInput.value = example.translation || "";
  translationInput.addEventListener("input", () => {
    example.translation = translationInput.value;
  });
  translationLabel.appendChild(translationInput);
  row.appendChild(translationLabel);

  const statusEl = document.createElement("div");
  statusEl.className = "card-example-status";
  if (example.checking) {
    statusEl.textContent = "Checking…";
  } else if (example.checkError) {
    statusEl.classList.add("card-example-status-issue");
    statusEl.textContent = example.checkError;
  } else if (example.checked) {
    if (example.corrected && example.corrected !== example.target) {
      statusEl.classList.add("card-example-status-issue");
      const fixLine = document.createElement("p");
      fixLine.textContent = `Suggested: ${example.corrected}`;
      statusEl.appendChild(fixLine);
      const useBtn = document.createElement("button");
      useBtn.type = "button";
      useBtn.className = "secondary";
      useBtn.textContent = "Use this";
      useBtn.dataset.immersionKey = "useThisButton";
      useBtn.addEventListener("click", () => {
        example.target = example.corrected;
        example.lastCheckedText = example.corrected;
        rerender();
      });
      statusEl.appendChild(useBtn);
      if (example.note) {
        const noteLine = document.createElement("p");
        noteLine.className = "hint";
        noteLine.textContent = example.note;
        statusEl.appendChild(noteLine);
      }
    } else {
      statusEl.classList.add("card-example-status-ok");
      statusEl.textContent = example.note ? `✓ ${example.note}` : "✓ Looks good";
    }
  }
  row.appendChild(statusEl);

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "secondary card-example-remove";
  removeBtn.textContent = "Remove";
  removeBtn.dataset.immersionKey = "removeButton";
  removeBtn.addEventListener("click", () => {
    const idx = ownerArray.indexOf(example);
    if (idx !== -1) ownerArray.splice(idx, 1);
    rerender();
  });
  row.appendChild(removeBtn);

  return row;
}

async function runExampleCheck(example, rerender) {
  const text = example.target.trim();
  if (!text) return;
  example.checking = true;
  example.checkError = null;
  rerender();

  const headerInput = document.getElementById("card-header");
  const explanationInput = document.getElementById("card-explanation");
  const headerText = headerInput ? headerInput.value.trim() : "";
  const explanationText = explanationInput ? explanationInput.value.trim() : "";
  const patternContext = headerText ? `${headerText}${explanationText ? " — " + explanationText : ""}` : "";

  const result = await Translate.checkExampleSentence(text, activeNoteLang, patternContext);
  example.checking = false;
  example.lastCheckedText = text;

  if (result.error) {
    example.checked = false;
    example.checkError = result.error;
    rerender();
    return;
  }

  example.checked = true;
  example.corrected = result.corrected;
  example.note = result.note || "";
  rerender();
}

function showNoteTranslation(translation) {
  const el = document.getElementById("note-translation-display");
  if (!el) return;
  el.hidden = false;
  el.textContent = translation;
}

function showNoteHint(structure, explanation) {
  const details = document.getElementById("note-hint-details");
  const structureEl = document.getElementById("note-structure-text");
  const text = document.getElementById("note-hint-text");
  if (!details) return;
  if (structureEl) structureEl.textContent = structure || "";
  if (text) text.textContent = explanation || "";
  details.hidden = false;
}

async function handleFetchTranslationClick() {
  const sentence = document.getElementById("note-sentence").value.trim();
  if (!sentence) {
    alert("Type or paste a sentence first.");
    return;
  }

  const btn = document.getElementById("fetch-translation-btn");
  btn.disabled = true;
  showNoteTranslation("Looking up…");

  const result = await Translate.explainGrammar(sentence, sentence);
  btn.disabled = false;

  if (!result) {
    showNoteTranslation("Couldn't look this up automatically — you can still save your own notes.");
    return;
  }

  showNoteTranslation(result.translation);
  showNoteHint(result.structure, result.explanation);
}

function renderGrammarThemeOptions(selectId) {
  const select = document.getElementById("note-theme-select");
  if (!select) return;
  select.innerHTML = "";

  const themes = Storage.getGrammarThemes(activeNoteLang);
  themes.forEach((theme) => {
    const opt = document.createElement("option");
    opt.value = theme.id;
    opt.textContent = theme.name;
    select.appendChild(opt);
  });

  const newOpt = document.createElement("option");
  newOpt.value = GRAMMAR_NEW_THEME_VALUE;
  newOpt.textContent = "+ New folder…";
  newOpt.dataset.immersionKey = "newFolderOption";
  select.appendChild(newOpt);

  if (selectId) {
    select.value = selectId;
  } else if (themes.length === 0) {
    select.value = GRAMMAR_NEW_THEME_VALUE;
  }
}

// Also exposed as a dedicated "+ New" button (#note-new-folder-btn),
// independent of the select's "change" event — with zero folders, the
// select has only ONE option ("+ New folder…", pre-selected by default),
// and a browser's <select> never fires "change" for "picking" a value
// that was already selected, so relying only on the change handler left
// no reliable way to trigger folder creation at that specific cold-start
// moment.
function createGrammarTheme() {
  const name = prompt("Name for the new folder:");
  const existingThemes = Storage.getGrammarThemes(activeNoteLang);
  if (!name || !name.trim()) {
    renderGrammarThemeOptions(existingThemes.length ? existingThemes[0].id : null);
    return;
  }

  const theme = Storage.addGrammarTheme(name.trim(), activeNoteLang);
  renderGrammarThemeOptions(theme.id);
}

function handleGrammarThemeSelectChange(e) {
  if (e.target.value !== GRAMMAR_NEW_THEME_VALUE) return;
  createGrammarTheme();
}

function handleGrammarNoteSubmit(e, getSourceInfo, editingNoteId) {
  e.preventDefault();

  const themeSelect = document.getElementById("note-theme-select");
  let themeId = themeSelect.value;

  // Covers the case where "+ New folder…" was the ONLY option (no
  // folders exist yet) and was already selected by default — a
  // <select>'s change event never fires for "picking" a value that was
  // already selected, so this is the reliable fallback rather than
  // depending on handleGrammarThemeSelectChange having run. Returns
  // false (caller should abort the submit) if the user cancelled.
  const ensureThemeId = () => {
    if (themeId && themeId !== GRAMMAR_NEW_THEME_VALUE) return true;
    const name = prompt("Name for the new folder:");
    if (!name || !name.trim()) return false;
    const theme = Storage.addGrammarTheme(name.trim(), activeNoteLang);
    renderGrammarThemeOptions(theme.id);
    themeId = theme.id;
    return true;
  };

  const tagsRaw = document.getElementById("note-tags").value.trim();
  const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];
  const { sourcePassageId, sourcePassageTitle } = getSourceInfo ? getSourceInfo() : {};

  if (noteFormMode === "card") {
    const header = document.getElementById("card-header").value.trim();
    const explanation = document.getElementById("card-explanation").value.trim();
    if (!header) {
      alert("Give this pattern a name first.");
      return;
    }
    if (!ensureThemeId()) return;

    const cleanExamples = (arr) =>
      (arr || [])
        .filter((ex) => (ex.target || "").trim())
        .map((ex) => ({
          id: ex.id || Storage.uid(),
          target: ex.target.trim(),
          translation: (ex.translation || "").trim(),
          checked: !!ex.checked,
          corrected: ex.corrected || "",
          note: ex.note || "",
        }));

    const examples = cleanExamples(cardExamples);
    const variants = cardVariants
      .filter((v) => (v.label || "").trim() || (v.examples || []).some((ex) => (ex.target || "").trim()))
      .map((v) => ({ id: v.id || Storage.uid(), label: (v.label || "").trim(), examples: cleanExamples(v.examples) }));

    // An unaccepted label suggestion isn't saved — only one you
    // explicitly hit "Accept" on gets persisted (and so can later enable
    // "Test me on this"); it comes back as null otherwise, same as if it
    // had never been classified. A "no clear point found" result has
    // nothing to accept, so its explanatory note is always kept either
    // way — there's no downside to remembering why, and no practice
    // feature it could wrongly unlock.
    const payload = {
      themeId,
      header,
      explanation,
      examples,
      variants,
      tags,
      grammarLabel: cardGrammarLabel && cardGrammarLabelConfirmed ? cardGrammarLabel : null,
      grammarLabelNote: cardGrammarLabel && !cardGrammarLabelConfirmed ? "" : cardGrammarLabelNote || "",
    };
    if (editingNoteId) {
      Storage.updateGrammarNote(editingNoteId, payload);
    } else {
      Storage.addGrammarNote(payload);
    }
    window.location.href = `grammar-theme.html?id=${encodeURIComponent(themeId)}`;
    return;
  }

  // Legacy single-sentence flow (Reading/Writing handoffs, editing an
  // old-shape note) — unchanged from the original behavior.
  const sentence = document.getElementById("note-sentence").value.trim();
  if (!sentence) {
    alert("Add a sentence or phrase first.");
    return;
  }
  if (!ensureThemeId()) return;

  const translationEl = document.getElementById("note-translation-display");
  const translation = translationEl && !translationEl.hidden ? translationEl.textContent : "";
  const notes = document.getElementById("note-notes").value.trim();

  if (editingNoteId) {
    // Deliberately does NOT touch "explanation" — that's the AI's
    // original read-only record of what a Grammar check found, not
    // something this form edits.
    Storage.updateGrammarNote(editingNoteId, {
      themeId,
      sentence,
      translation,
      notes,
      tags,
      sourcePassageId: sourcePassageId || null,
      sourcePassageTitle: sourcePassageTitle || null,
    });
  } else {
    Storage.addGrammarNote({
      themeId,
      sentence,
      translation,
      notes,
      tags,
      sourcePassageId: sourcePassageId || null,
      sourcePassageTitle: sourcePassageTitle || null,
    });
  }

  window.location.href = `grammar-theme.html?id=${encodeURIComponent(themeId)}`;
}
