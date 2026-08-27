/*
  vocab-app.js
  ------------
  Ties everything else together: themes, the add-word form (including
  dictionary lookup and Spanish verb detection), the word list,
  conjugation tables, and the flashcard quiz. Depends on storage.js,
  translate.js, spanish-verb-data.js, and spanish-conjugator.js all
  being loaded first.
*/

const LANGUAGE_NAMES = { es: "Spanish", ja: "Japanese", fr: "French" };

// Per-language examples for the "Add a word" form's placeholder text —
// a Spanish "hablar" example inside a French or Japanese theme just
// confuses things, so each language gets its own verb-example pair.
const TARGET_LANG_PLACEHOLDER = {
  es: "e.g. hablar, or a conjugated form like hablo",
  fr: "e.g. parler, or a conjugated form like parle",
  ja: "e.g. 話す, or a conjugated form like 話します",
};
const ENGLISH_FIELD_PLACEHOLDER = {
  es: "e.g. to speak",
  fr: "e.g. to speak",
  ja: "e.g. to speak",
};

let activeTheme = null;
// Set when vocab.html is reached as vocab.html?lang=es|ja (from a
// language hub) — filters the theme list and defaults new themes to
// that language. Plain vocab.html with no ?lang= behaves exactly as
// before: everything, unfiltered.
let activeLangFilter = null;
// { typedForm, matches: [{infinitive, tense, person}, ...] } while the
// verb-detection panel is open, otherwise null.
let pendingDetection = null;
// id of the word currently being edited inline in the word list, or null.
let editingWordId = null;
// id of the word currently showing its inline move/copy panel, or null.
let movingWordId = null;
// { query, partOfSpeech, verbClass } set right after a Japanese
// dictionary lookup that identified a verb and its conjugation class —
// consumed (and cleared) the moment the word actually gets saved, so a
// verb looked up once but never saved doesn't leak its tag onto some
// unrelated later word. `query` is whichever side was typed in to
// trigger the lookup (lowercased/trimmed), used to sanity-check that
// what's about to be saved is still the same word that was looked up.
let pendingVerbInfo = null;

// Quiz state
let quizQueue = [];
let currentCard = null;
let conjugationQuizQueue = [];
let currentConjugationCard = null;

// The Vocab Bank is split across several pages (vocab.html -> theme.html
// -> quiz.html / add-vocab.html), but they all load this one script for
// simplicity. Every render/wiring function below is written to be a
// harmless no-op on a page that doesn't have the elements it needs, so
// it's safe to call all of them unconditionally on every page.

// Wires an event listener only if the element actually exists on this page.
function on(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// theme.html, quiz.html, and add-vocab.html are all reached via a
// ?id=<themeId> URL rather than an in-page theme picker.
function initThemeFromUrl() {
  const themeId = getQueryParam("id");
  if (!themeId) return null;
  const theme = Storage.getTheme(themeId);
  if (!theme) return null;
  activeTheme = theme;
  return theme;
}

// Populates whichever theme-name/lang-label/furigana/back-link/bubble-link
// elements exist on the current page for the already-set `activeTheme`.
function applyActiveThemeToUI() {
  if (!activeTheme) return;
  const id = encodeURIComponent(activeTheme.id);

  const nameEl = document.getElementById("active-theme-name");
  if (nameEl) nameEl.textContent = activeTheme.name;
  const nameEl2 = document.getElementById("active-theme-name-2");
  if (nameEl2) nameEl2.textContent = activeTheme.name;
  const langLabel = document.getElementById("active-theme-lang-label");
  if (langLabel) langLabel.textContent = LANGUAGE_NAMES[activeTheme.language];
  const furiganaField = document.getElementById("furigana-field");
  if (furiganaField) furiganaField.hidden = activeTheme.language !== "ja";

  // The "Add a word" form's placeholders should always show an example
  // in the language the learner is actually adding to — a Spanish
  // "hablar" example makes no sense sitting inside a French or
  // Japanese theme.
  const tlPlaceholder = document.getElementById("field-tl");
  if (tlPlaceholder) tlPlaceholder.placeholder = TARGET_LANG_PLACEHOLDER[activeTheme.language] || TARGET_LANG_PLACEHOLDER.es;
  const englishPlaceholder = document.getElementById("field-english");
  if (englishPlaceholder) englishPlaceholder.placeholder = ENGLISH_FIELD_PLACEHOLDER[activeTheme.language] || ENGLISH_FIELD_PLACEHOLDER.es;

  // theme.html's two bubbles.
  const hubHeading = document.getElementById("theme-hub-heading");
  if (hubHeading) hubHeading.textContent = activeTheme.name;
  const hubTestLink = document.getElementById("theme-hub-test-link");
  if (hubTestLink) hubTestLink.href = `quiz.html?id=${id}`;
  const hubTestSub = document.getElementById("theme-hub-test-sub");
  if (hubTestSub) {
    hubTestSub.textContent =
      activeTheme.language === "es" ? "Flashcard quiz or verb conjugation practice" : "Flashcard quiz";
  }
  const hubAddLink = document.getElementById("theme-hub-add-link");
  if (hubAddLink) hubAddLink.href = `add-vocab.html?id=${id}`;

  // Verb conjugation is a Spanish-only concept (conjugation tables,
  // detected verb forms, the conjugation quiz mode) — hide every entry
  // point to it on a Japanese theme instead of showing an option that
  // doesn't apply and won't find anything.
  const conjugationModeLabel = document.getElementById("conjugation-mode-label");
  if (conjugationModeLabel) conjugationModeLabel.hidden = activeTheme.language !== "es";
  const verbDrillLabel = document.getElementById("verb-drill-label");
  if (verbDrillLabel) verbDrillLabel.hidden = activeTheme.language !== "es";

  // theme.html always routes back to the vocab list filtered to this
  // theme's own language, regardless of how it was reached.
  const themeBackLink = document.getElementById("theme-back-link");
  if (themeBackLink) themeBackLink.href = `vocab.html?lang=${activeTheme.language}`;

  // Back links on quiz.html / add-vocab.html point back to this theme's hub.
  const quizBackLink = document.getElementById("quiz-back-link");
  if (quizBackLink) quizBackLink.href = `theme.html?id=${id}`;
  const addVocabBackLink = document.getElementById("add-vocab-back-link");
  if (addVocabBackLink) addVocabBackLink.href = `theme.html?id=${id}`;

  renderWordList(); // no-op if #word-list isn't on this page
}

// Note: add-vocab.html used to have its own in-page, per-theme tab strip
// here (switching tabs swapped the shared form in place, with in-memory
// draft-stashing so a half-typed word wasn't lost). That's been replaced
// by the global, site-wide app tab strip (see app-tabs.js) — each vocab
// tab is now a real add-vocab.html?id=... page, real navigation on
// click, consistent with every other section's tabs.

document.addEventListener("DOMContentLoaded", () => {
  initThemeFromUrl();
  applyActiveThemeToUI();

  const langParam = getQueryParam("lang");
  if (SUPPORTED_LANGUAGES.includes(langParam)) {
    activeLangFilter = langParam;
    const vocabBackLink = document.getElementById("vocab-back-link");
    if (vocabBackLink) vocabBackLink.href = `language-home.html?lang=${activeLangFilter}`;
    const newThemeLangSelect = document.getElementById("new-theme-language");
    if (newThemeLangSelect) newThemeLangSelect.value = activeLangFilter;
  }

  renderThemeList();
  renderQuizThemeCheckboxes();
  renderQuizTenseCheckboxes();
  renderConjugationTablesPanel();

  on("new-theme-form", "submit", handleNewThemeSubmit);
  on("theme-rename-btn", "click", handleRenameThemeClick);
  on("add-word-form", "submit", handleAddWordSubmit);
  on("field-furigana", "input", handleFuriganaManualEdit);

  on("use-translation-only", "click", handleUseTranslationOnly);
  on("cancel-detection", "click", hideVerbDetectionPanel);
  on("generate-table", "click", handleGenerateTable);

  on("bulk-import-extract-btn", "click", handleBulkImportExtractClick);
  on("bulk-import-select-all", "click", handleBulkImportSelectAll);
  on("bulk-import-select-none", "click", handleBulkImportSelectNone);
  on("bulk-import-save-btn", "click", handleBulkImportSave);
  on("bulk-import-discard-btn", "click", handleBulkImportDiscard);

  on("word-list", "click", handleWordListClick);

  document.querySelectorAll('input[name="quiz-mode"]').forEach((radio) => {
    radio.addEventListener("change", handleQuizModeChange);
  });

  on("start-quiz", "click", handleStartQuiz);
  on("show-answer", "click", handleShowAnswer);
  on("quiz-got-it", "click", handleQuizGotIt);
  on("quiz-review-again", "click", handleQuizReviewAgain);
  on("restart-quiz", "click", handleRestartQuiz);

  on("check-conjugation-answer", "click", handleCheckConjugationAnswer);
  on("conjugation-next", "click", handleConjugationNext);
  on("conjugation-override", "click", handleConjugationOverride);

  const conjugationInput = document.getElementById("conjugation-answer-input");
  if (conjugationInput) {
    conjugationInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleCheckConjugationAnswer();
    });
  }

  // Global topbar (hamburger + current language) — covers vocab.html,
  // theme.html, quiz.html, and add-vocab.html, all of which share this
  // one script. A specific theme's language wins when there is one
  // (theme.html/quiz.html/add-vocab.html); otherwise falls back to
  // vocab.html's own ?lang= filter, or null if neither applies.
  initTopbar(activeTheme ? activeTheme.language : activeLangFilter);
  if (typeof initHubTasks === "function") {
    initHubTasks(activeTheme ? activeTheme.language : activeLangFilter);
  }

  // Global tab strip — only add-vocab.html is a specific addressable
  // "unit" (one theme) worth pinning as a tab; vocab.html's list,
  // theme.html's hub, and quiz.html are transient/picker pages that just
  // show whatever's already open without adding themselves.
  if (document.getElementById("add-word-form") && activeTheme) {
    initAppTabs({
      section: "vocab",
      language: activeTheme.language,
      label: activeTheme.name,
      href: `add-vocab.html?id=${encodeURIComponent(activeTheme.id)}`,
    });
  } else {
    initAppTabs(null);
  }
});

// ---------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------

function handleRenameThemeClick() {
  if (!activeTheme) return;
  const newName = prompt("New name for this theme:", activeTheme.name);
  if (!newName || !newName.trim() || newName.trim() === activeTheme.name) return;

  const updated = Storage.renameTheme(activeTheme.id, newName.trim());
  if (!updated) return;
  activeTheme = updated;
  applyActiveThemeToUI();
  // Keep the global app tab's label in sync too, on add-vocab.html.
  if (document.getElementById("add-word-form")) {
    initAppTabs({
      section: "vocab",
      language: activeTheme.language,
      label: activeTheme.name,
      href: `add-vocab.html?id=${encodeURIComponent(activeTheme.id)}`,
    });
  }
}

function handleNewThemeSubmit(e) {
  e.preventDefault();
  const nameInput = document.getElementById("new-theme-name");
  const langSelect = document.getElementById("new-theme-language");
  const name = nameInput.value.trim();
  if (!name) return;

  Storage.addTheme(name, langSelect.value);
  nameInput.value = "";
  renderThemeList();
  renderQuizThemeCheckboxes();
}

function renderThemeList() {
  const list = document.getElementById("theme-list");
  if (!list) return;
  const themes = activeLangFilter
    ? Storage.getThemes().filter((t) => t.language === activeLangFilter)
    : Storage.getThemes();
  list.innerHTML = "";

  if (themes.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-hint";
    li.textContent = activeLangFilter
      ? `No ${LANGUAGE_NAMES[activeLangFilter]} themes yet — add one above to get started.`
      : "No themes yet — add one above to get started.";
    list.appendChild(li);
    return;
  }

  themes.forEach((theme) => {
    const wordCount = Storage.getWords(theme.id).length;

    const li = document.createElement("li");
    li.className = `theme-item lang-${theme.language}`;
    li.addEventListener("click", () => {
      window.location.href = `theme.html?id=${encodeURIComponent(theme.id)}`;
    });

    const nameEl = document.createElement("span");
    nameEl.className = "theme-name";
    nameEl.textContent = theme.name;
    li.appendChild(nameEl);

    const meta = document.createElement("span");
    meta.className = "theme-meta";

    const langBadge = document.createElement("span");
    langBadge.className = `lang-badge lang-badge-${theme.language}`;
    langBadge.textContent = LANGUAGE_NAMES[theme.language];
    meta.appendChild(langBadge);

    const countBadge = document.createElement("span");
    countBadge.className = "word-count-badge";
    countBadge.textContent = `${wordCount} word${wordCount === 1 ? "" : "s"}`;
    meta.appendChild(countBadge);

    li.appendChild(meta);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "secondary delete-theme-btn";
    deleteBtn.textContent = "Delete theme";
    deleteBtn.dataset.immersionKey = "deleteThemeButton";
    deleteBtn.addEventListener("click", (e) => {
      // The whole card is a click-to-open link — without this the click
      // would both delete the theme AND navigate into the page for a
      // theme that no longer exists.
      e.stopPropagation();
      const wordCountNow = Storage.getWords(theme.id).length;
      const warning =
        wordCountNow > 0
          ? `Delete "${theme.name}"? This will also delete all ${wordCountNow} word${wordCountNow === 1 ? "" : "s"} saved in it. This can't be undone.`
          : `Delete "${theme.name}"? This can't be undone.`;
      if (!confirm(warning)) return;
      Storage.deleteTheme(theme.id);
      renderThemeList();
      renderQuizThemeCheckboxes();
    });
    li.appendChild(deleteBtn);

    list.appendChild(li);
  });
}

// ---------------------------------------------------------------------
// Add word — direct save, dictionary lookup, or verb detection
// ---------------------------------------------------------------------

async function handleAddWordSubmit(e) {
  e.preventDefault();
  if (!activeTheme) return;

  const englishInput = document.getElementById("field-english");
  const tlInput = document.getElementById("field-tl");
  const furiganaInput = document.getElementById("field-furigana");
  const exampleInput = document.getElementById("field-example");

  const english = englishInput.value.trim();
  const tl = tlInput.value.trim();
  const exampleSentence = exampleInput ? exampleInput.value.trim() : "";

  if (!english && !tl) {
    alert(`Type at least one side (English or ${LANGUAGE_NAMES[activeTheme.language]}).`);
    return;
  }

  // Both sides filled — save directly. If the Japanese side still
  // matches what a lookup just identified as a verb (and classified for
  // conjugation), carry that tag onto the saved word; otherwise (typed
  // both sides by hand, or edited the field after the lookup) it's
  // saved untagged, same as any word saved before this feature existed.
  if (english && tl) {
    const word = { english, targetLang: tl, furigana: furiganaInput.value.trim(), exampleSentence };
    if (activeTheme.language === "ja" && pendingVerbInfo && pendingVerbInfo.query === tl.toLowerCase()) {
      word.partOfSpeech = pendingVerbInfo.partOfSpeech;
      word.verbClass = pendingVerbInfo.verbClass;
    }
    pendingVerbInfo = null;
    saveWordAndReset(word);
    return;
  }

  // Spanish + only the target-language side filled: check whether it's
  // a conjugated verb form before falling back to a plain dictionary
  // lookup, since a translation-memory lookup on a conjugated form
  // (e.g. "hablo") tends to give a poor/misleading result.
  if (activeTheme.language === "es" && tl && !english) {
    const matches = SpanishConjugator.detectVerbForm(tl);
    if (matches) {
      showVerbDetectionPanel(tl, matches);
      return;
    }
  }

  // Otherwise, fall back to the dictionary lookup and let the user
  // review the result before saving (submitting again saves it, since
  // both fields will now be filled).
  const fromLang = english ? "en" : activeTheme.language;
  const toLang = english ? activeTheme.language : "en";
  const query = english || tl;

  const result = await Translate.lookupTranslation(query, fromLang, toLang);
  if (!result || !result.translation) {
    alert("Couldn't find a translation automatically — type both sides by hand instead.");
    return;
  }

  // Filling in the Spanish side and the backend gave us a gender/article
  // (e.g. "grapes" -> uvas, feminine plural) — prepend it so you don't
  // have to guess "las uvas" vs "los uvas" yourself.
  let filledValue = result.translation;
  if (english && activeTheme.language === "es" && result.article) {
    filledValue = `${result.article} ${result.translation}`;
  }

  if (english) {
    tlInput.value = filledValue;
  } else {
    englishInput.value = filledValue;
  }

  // Auto-fill the reading too, same as gender/article for Spanish above —
  // works either direction (English -> Japanese fills the reading of the
  // newly-looked-up word; Japanese -> English fills the reading of what
  // you typed) since the backend resolves furigana for whichever side is
  // actually Japanese. Only overwrite it if it's empty, OR if whatever's
  // there was itself only ever auto-filled (not typed by hand) — that
  // distinction (tracked via handleFuriganaManualEdit below) is what
  // lets a retry after a mistake actually refresh the reading, instead
  // of a stale reading from the first attempt silently blocking it
  // forever. A reading you genuinely typed yourself is still protected.
  if (
    activeTheme.language === "ja" &&
    result.furigana &&
    furiganaInput &&
    (!furiganaInput.value.trim() || furiganaInput.dataset.autoFilled === "true")
  ) {
    furiganaInput.value = result.furigana;
    furiganaInput.dataset.autoFilled = "true";
  }

  // Remembers what this lookup identified as a verb (and its
  // conjugation class) so it can be carried onto the word once you hit
  // Save — see the "both sides filled" branch above and the comment on
  // pendingVerbInfo's declaration. `query` is whichever value will be
  // sitting in the Japanese-side field the moment you save: the newly
  // filled-in translation if you looked up FROM English, or the value
  // you originally typed if you looked up FROM Japanese (unchanged).
  if (activeTheme.language === "ja" && result.partOfSpeech === "verb" && result.verbClass) {
    pendingVerbInfo = {
      query: (english ? filledValue : tl).toLowerCase(),
      partOfSpeech: result.partOfSpeech,
      verbClass: result.verbClass,
    };
  } else {
    pendingVerbInfo = null;
  }

  if (result.source === "mymemory") {
    console.info('Filled in using the MyMemory fallback (lower accuracy) — the Claude lookup server isn\'t running. Double-check this one before saving.');
  }

  if (result.conjugationInfo) {
    const ci = result.conjugationInfo;
    console.info(`Recognized as a conjugated form: ${ci.infinitive} (${ci.infinitiveEnglish}) — ${ci.tense}, ${ci.person}.`);
  }
}

// Thin wrappers around Storage's theme-agnostic duplicate-check
// functions, defaulting to this page's activeTheme when no themeId is
// passed explicitly (Reading calls Storage's versions directly instead
// with its own themeId, bypassing these).
//
// Deliberately NOT named isDuplicateWord/addWordIfNotDuplicate (which
// would exactly match storage.js's own top-level function names) —
// every plain <script> tag on a page shares one global scope, so a
// same-named function declared here would silently overwrite
// storage.js's, and since storage.js's OWN internal code calls those
// by their bare (unprefixed) names, it would end up calling THESE
// instead — with a different argument order — the moment this file
// loads after storage.js. That exact collision used to make adding a
// second word to any theme throw partway through (caught via testing,
// not by a user report) — keep these names distinct from storage.js's.
function isDuplicateInActiveTheme(word, excludeId, themeId) {
  const id = themeId || (activeTheme && activeTheme.id);
  return Storage.isDuplicateWord(id, word, excludeId);
}

function addWordToActiveTheme(word, themeId) {
  const id = themeId || (activeTheme && activeTheme.id);
  if (!id) return false;
  const saved = Storage.addWordIfNotDuplicate(id, word);
  if (!saved) {
    alert("That flashcard already exists in that theme.");
    return false;
  }
  return true;
}

// Marks the reading as no longer just an auto-fill the moment you type
// into it directly, so a later lookup won't silently overwrite what you
// typed by hand (see the guard in handleAddWordSubmit).
function handleFuriganaManualEdit(e) {
  e.target.dataset.autoFilled = "false";
}

function saveWordAndReset(word) {
  if (!addWordToActiveTheme(word)) return;
  document.getElementById("add-word-form").reset();
  document.getElementById("furigana-field").hidden = activeTheme.language !== "ja";
  // form.reset() only resets values, not custom data attributes —
  // clear this explicitly so the next word starts fresh.
  const furiganaInput = document.getElementById("field-furigana");
  if (furiganaInput) furiganaInput.dataset.autoFilled = "false";
  hideVerbDetectionPanel();
  renderWordList();
}

// ---------------------------------------------------------------------
// Spanish verb detection panel
// ---------------------------------------------------------------------

function showVerbDetectionPanel(typedForm, matches) {
  pendingDetection = { typedForm, matches };

  const summary = document.getElementById("detection-summary");
  if (matches.length === 1) {
    const m = matches[0];
    const verb = SpanishConjugator.findVerb(m.infinitive);
    summary.textContent =
      `"${typedForm}" looks like ${SpanishConjugator.TENSE_LABELS[m.tense]} tense, ` +
      `${SpanishConjugator.PERSON_LABELS[m.person]} of "${m.infinitive}" (${verb.english}).`;
  } else {
    const options = matches
      .map((m) => `"${m.infinitive}" (${SpanishConjugator.TENSE_LABELS[m.tense]}, ${SpanishConjugator.PERSON_LABELS[m.person]})`)
      .join(" or ");
    summary.textContent = `"${typedForm}" could be more than one verb form: ${options}. Using the first option below — edit the fields yourself if that's not the one you meant.`;
  }

  renderDetectionCheckboxes(matches[0]);

  document.getElementById("verb-detection-panel").hidden = false;
}

function hideVerbDetectionPanel() {
  pendingDetection = null;
  const panel = document.getElementById("verb-detection-panel");
  if (panel) panel.hidden = true;
  const preview = document.getElementById("verb-table-preview");
  if (preview) preview.innerHTML = "";
}

function renderDetectionCheckboxes(defaultMatch) {
  const tenseContainer = document.getElementById("tense-checkboxes");
  const personContainer = document.getElementById("person-checkboxes");
  tenseContainer.innerHTML = "";
  personContainer.innerHTML = "";

  SpanishConjugator.TENSE_KEYS.forEach((tense) => {
    const label = document.createElement("label");
    label.className = "checkbox-label";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = tense;
    input.className = "tense-checkbox";
    if (defaultMatch && tense === defaultMatch.tense) input.checked = true;
    label.appendChild(input);
    label.appendChild(document.createTextNode(" " + SpanishConjugator.TENSE_LABELS[tense]));
    tenseContainer.appendChild(label);
  });

  SpanishConjugator.PERSON_KEYS.forEach((person) => {
    const label = document.createElement("label");
    label.className = "checkbox-label";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = person;
    input.className = "person-checkbox";
    if (defaultMatch && person === defaultMatch.person) input.checked = true;
    label.appendChild(input);
    label.appendChild(document.createTextNode(" " + SpanishConjugator.PERSON_LABELS[person]));
    personContainer.appendChild(label);
  });
}

function buildDetectionGloss(match) {
  const verb = SpanishConjugator.findVerb(match.infinitive);
  return `${verb.english} (${SpanishConjugator.TENSE_LABELS[match.tense]}, ${SpanishConjugator.PERSON_LABELS[match.person]})`;
}

function handleUseTranslationOnly() {
  if (!pendingDetection) return;
  const match = pendingDetection.matches[0];
  const english = buildDetectionGloss(match);
  const exampleInput = document.getElementById("field-example");
  const exampleSentence = exampleInput ? exampleInput.value.trim() : "";
  saveWordAndReset({ english, targetLang: pendingDetection.typedForm, furigana: "", exampleSentence });
}

function handleGenerateTable() {
  if (!pendingDetection) return;

  const tenses = Array.from(document.querySelectorAll(".tense-checkbox:checked")).map((el) => el.value);
  const persons = Array.from(document.querySelectorAll(".person-checkbox:checked")).map((el) => el.value);

  if (tenses.length === 0 || persons.length === 0) {
    alert("Pick at least one tense and one person.");
    return;
  }

  const match = pendingDetection.matches[0];
  const verb = SpanishConjugator.findVerb(match.infinitive);
  const forms = SpanishConjugator.getFullTable(verb, tenses, persons);

  Storage.saveConjugationTable({ infinitive: verb.infinitive, language: "es", forms });

  // Also save the word the user originally typed, so it shows up in
  // the word list and flashcards right away (unless it's already there).
  const english = buildDetectionGloss(match);
  const exampleInput = document.getElementById("field-example");
  const exampleSentence = exampleInput ? exampleInput.value.trim() : "";
  addWordToActiveTheme({ english, targetLang: pendingDetection.typedForm, furigana: "", exampleSentence });

  renderVerbTablePreview(verb, forms);
  renderWordList();
  renderConjugationTablesPanel();

  document.getElementById("add-word-form").reset();
  pendingDetection = null;
}

function renderVerbTablePreview(verb, forms) {
  const preview = document.getElementById("verb-table-preview");
  preview.innerHTML = "";
  const heading = document.createElement("p");
  heading.textContent = `Saved: ${verb.infinitive} (${verb.english})`;
  preview.appendChild(heading);
  preview.appendChild(buildConjugationTableElement(forms));
}

// ---------------------------------------------------------------------
// Bulk import — paste a whole vocab list, get a batch of extracted
// pairs back to review/edit/uncheck before anything is actually saved.
// Reuses the same per-theme duplicate check as the single-word form.
// ---------------------------------------------------------------------

let bulkImportExtractedWords = []; // [{ targetLang, english, furigana, isDuplicate }]

async function handleBulkImportExtractClick() {
  if (!activeTheme) return;
  const textarea = document.getElementById("bulk-import-text");
  const btn = document.getElementById("bulk-import-extract-btn");
  const statusEl = document.getElementById("bulk-import-status");
  const text = textarea ? textarea.value.trim() : "";

  if (!text) {
    alert("Paste a vocab list first.");
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Extracting...";
    btn.dataset.immersionKey = "extractingStatus";
  }
  if (statusEl) statusEl.hidden = true;

  const result = await Translate.extractVocabList(text, activeTheme.language);

  if (btn) {
    btn.disabled = false;
    btn.textContent = "Extract flashcards";
    btn.dataset.immersionKey = "extractFlashcardsButton";
  }

  if (result.error || !result.words) {
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.textContent = result.error || "Couldn't extract anything from that text.";
    }
    return;
  }

  if (result.words.length === 0) {
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.textContent = "Didn't find anything that looked like vocabulary in that text.";
    }
    return;
  }

  bulkImportExtractedWords = result.words.map((w) => {
    const english = (w.english || "").trim();
    const targetLang = (w.targetLang || "").trim();
    return {
      targetLang,
      english,
      furigana: (w.furigana || "").trim(),
      isDuplicate: isDuplicateInActiveTheme({ english, targetLang }),
    };
  });

  renderBulkImportReview();
}

function renderBulkImportReview() {
  const review = document.getElementById("bulk-import-review");
  const list = document.getElementById("bulk-import-list");
  const countEl = document.getElementById("bulk-import-review-count");
  if (!review || !list) return;

  list.innerHTML = "";
  const dupeCount = bulkImportExtractedWords.filter((w) => w.isDuplicate).length;
  if (countEl) {
    countEl.textContent =
      `${bulkImportExtractedWords.length} found` +
      (dupeCount ? ` (${dupeCount} already in this theme, unchecked)` : "");
  }

  bulkImportExtractedWords.forEach((word) => {
    const li = document.createElement("li");
    li.className = "bulk-import-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "bulk-import-checkbox";
    checkbox.checked = !word.isDuplicate;
    li.appendChild(checkbox);

    const tlInput = document.createElement("input");
    tlInput.type = "text";
    tlInput.className = "bulk-import-tl-input";
    tlInput.value = word.targetLang;
    tlInput.setAttribute("aria-label", "Target language");
    li.appendChild(tlInput);

    const englishInput = document.createElement("input");
    englishInput.type = "text";
    englishInput.className = "bulk-import-english-input";
    englishInput.value = word.english;
    englishInput.setAttribute("aria-label", "English");
    li.appendChild(englishInput);

    if (activeTheme && activeTheme.language === "ja") {
      const furiganaInput = document.createElement("input");
      furiganaInput.type = "text";
      furiganaInput.className = "bulk-import-furigana-input";
      furiganaInput.value = word.furigana;
      furiganaInput.placeholder = "furigana";
      furiganaInput.setAttribute("aria-label", "Furigana");
      li.appendChild(furiganaInput);
    }

    if (word.isDuplicate) {
      const badge = document.createElement("span");
      badge.className = "bulk-import-dupe-badge";
      badge.textContent = "already in this theme";
      li.appendChild(badge);
    }

    list.appendChild(li);
  });

  review.hidden = false;
  const saveStatus = document.getElementById("bulk-import-save-status");
  if (saveStatus) saveStatus.hidden = true;
}

function handleBulkImportSelectAll() {
  document.querySelectorAll(".bulk-import-checkbox").forEach((cb) => {
    cb.checked = true;
  });
}

function handleBulkImportSelectNone() {
  document.querySelectorAll(".bulk-import-checkbox").forEach((cb) => {
    cb.checked = false;
  });
}

// Saves every checked row, respecting the same per-theme duplicate
// check as the single-word form. Rows that weren't checked, came out
// empty, or turned out to be duplicates stay in the review list
// (re-flagged accordingly) rather than silently vanishing, so nothing
// gets lost without you seeing why.
function handleBulkImportSave() {
  if (!activeTheme) return;
  const rows = Array.from(document.querySelectorAll("#bulk-import-list .bulk-import-row"));
  let saved = 0;
  let skippedDuplicate = 0;
  let skippedEmpty = 0;
  const remaining = [];

  rows.forEach((row) => {
    const checkbox = row.querySelector(".bulk-import-checkbox");
    const isChecked = !!(checkbox && checkbox.checked);
    const english = row.querySelector(".bulk-import-english-input").value.trim();
    const targetLang = row.querySelector(".bulk-import-tl-input").value.trim();
    const furiganaInput = row.querySelector(".bulk-import-furigana-input");
    const furigana = furiganaInput ? furiganaInput.value.trim() : "";

    if (!isChecked) {
      remaining.push({ targetLang, english, furigana, isDuplicate: false });
      return;
    }

    if (!english || !targetLang) {
      skippedEmpty++;
      remaining.push({ targetLang, english, furigana, isDuplicate: false });
      return;
    }

    const result = Storage.addWordIfNotDuplicate(activeTheme.id, { english, targetLang, furigana });
    if (result) {
      saved++;
    } else {
      skippedDuplicate++;
      remaining.push({ targetLang, english, furigana, isDuplicate: true });
    }
  });

  bulkImportExtractedWords = remaining;

  const statusParts = [`Saved ${saved} word${saved === 1 ? "" : "s"}.`];
  if (skippedDuplicate) statusParts.push(`${skippedDuplicate} skipped as duplicate.`);
  if (skippedEmpty) statusParts.push(`${skippedEmpty} left unchecked (missing a side).`);
  const saveStatusText = statusParts.join(" ");

  renderWordList();

  // renderBulkImportReview() re-hides the save-status line (it's meant
  // to start hidden on a fresh extraction) — so set the actual message
  // AFTER re-rendering, not before, or it'd be wiped out immediately.
  if (remaining.length > 0) {
    renderBulkImportReview();
  } else {
    const review = document.getElementById("bulk-import-review");
    if (review) review.hidden = true;
    const textarea = document.getElementById("bulk-import-text");
    if (textarea) textarea.value = "";
  }

  const saveStatus = document.getElementById("bulk-import-save-status");
  if (saveStatus) {
    saveStatus.hidden = false;
    saveStatus.textContent = saveStatusText;
  }
}

function handleBulkImportDiscard() {
  bulkImportExtractedWords = [];
  const review = document.getElementById("bulk-import-review");
  if (review) review.hidden = true;
  const textarea = document.getElementById("bulk-import-text");
  if (textarea) textarea.value = "";
  const statusEl = document.getElementById("bulk-import-status");
  if (statusEl) statusEl.hidden = true;
}

// ---------------------------------------------------------------------
// Word list
// ---------------------------------------------------------------------

function renderWordList() {
  if (!activeTheme) return;
  const list = document.getElementById("word-list");
  if (!list) return;
  renderThemeList(); // keep each theme's word-count badge in sync (no-op if not on this page)
  const words = Storage.getWords(activeTheme.id);
  list.innerHTML = "";

  if (words.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-hint";
    li.textContent = "No words yet — add one above.";
    li.dataset.immersionKey = "noWordsYetText";
    list.appendChild(li);
    return;
  }

  words.forEach((word) => {
    const li = document.createElement("li");
    li.className = "word-item";

    if (word.id === editingWordId) {
      li.appendChild(buildWordEditForm(word));
      list.appendChild(li);
      return;
    }

    const main = document.createElement("div");
    main.className = "word-main";

    const text = document.createElement("span");
    text.className = "word-label";
    let label = `${word.english} — ${word.targetLang}`;
    if (word.furigana) label += ` (${word.furigana})`;
    text.textContent = label;
    main.appendChild(text);

    if (word.exampleSentence) {
      const example = document.createElement("span");
      example.className = "word-example";
      example.textContent = `e.g. ${word.exampleSentence}`;
      main.appendChild(example);
    }

    li.appendChild(main);

    if (word.id === movingWordId) {
      li.appendChild(buildMovePanel(word));
    } else {
      const actions = document.createElement("span");
      actions.className = "word-actions";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "secondary edit-word-btn";
      editBtn.textContent = "Edit";
      editBtn.dataset.immersionKey = "btnEdit";
      editBtn.dataset.wordId = word.id;
      actions.appendChild(editBtn);

      const moveBtn = document.createElement("button");
      moveBtn.type = "button";
      moveBtn.className = "secondary move-word-btn";
      moveBtn.textContent = "Move/Copy";
      moveBtn.dataset.immersionKey = "moveCopyButton";
      moveBtn.dataset.wordId = word.id;
      actions.appendChild(moveBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "secondary delete-word-btn";
      deleteBtn.textContent = "Delete";
      deleteBtn.dataset.immersionKey = "btnDelete";
      deleteBtn.dataset.wordId = word.id;
      actions.appendChild(deleteBtn);

      li.appendChild(actions);
    }

    list.appendChild(li);
  });
}

// Lets a word be filed into a different theme of the SAME language (a
// word's targetLang/furigana only make sense for the language it was
// written in, so cross-language moves aren't offered). "Move" re-homes
// it and removes it from the current theme; "Copy" leaves the original
// in place and adds a duplicate under the destination theme. Both are
// blocked if that would create an exact duplicate in the destination.
const MOVE_NEW_THEME_VALUE = "__new_move_theme__";

function renderMoveThemeOptions(select, selectedId) {
  select.innerHTML = "";
  const destinations = Storage.getThemes().filter(
    (t) => t.language === activeTheme.language && t.id !== activeTheme.id
  );
  destinations.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    select.appendChild(opt);
  });

  const newOpt = document.createElement("option");
  newOpt.value = MOVE_NEW_THEME_VALUE;
  newOpt.textContent = "+ Create new theme…";
  newOpt.dataset.immersionKey = "createNewThemeOption";
  select.appendChild(newOpt);

  if (selectedId) {
    select.value = selectedId;
  } else if (destinations.length === 0) {
    select.value = MOVE_NEW_THEME_VALUE;
  }
}

// Same dedicated-function-plus-cold-start-fallback pattern used
// elsewhere in the app (Reading's inline vocab add, Writing's Helper
// Notebook) — a fresh destination theme, created without ever leaving
// this panel.
function createMoveDestinationTheme(select) {
  const name = prompt("Name for the new theme:");
  if (!name || !name.trim()) {
    const destinations = Storage.getThemes().filter(
      (t) => t.language === activeTheme.language && t.id !== activeTheme.id
    );
    renderMoveThemeOptions(select, destinations.length ? destinations[0].id : null);
    return null;
  }
  const theme = Storage.addTheme(name.trim(), activeTheme.language);
  renderMoveThemeOptions(select, theme.id);
  return theme;
}

function resolveMoveDestinationThemeId(select) {
  let themeId = select.value;
  if (!themeId || themeId === MOVE_NEW_THEME_VALUE) {
    const theme = createMoveDestinationTheme(select);
    if (!theme) return null;
    themeId = theme.id;
  }
  return themeId;
}

function buildMovePanel(word) {
  const wrapper = document.createElement("div");
  wrapper.className = "word-move-panel";

  const select = document.createElement("select");
  select.className = "word-move-select";
  wrapper.appendChild(select);
  renderMoveThemeOptions(select);
  select.addEventListener("change", (e) => {
    if (e.target.value !== MOVE_NEW_THEME_VALUE) return;
    createMoveDestinationTheme(select);
  });

  const moveBtn = document.createElement("button");
  moveBtn.type = "button";
  moveBtn.textContent = "Move";
  moveBtn.dataset.immersionKey = "moveButton";
  moveBtn.addEventListener("click", () => handleMoveWord(word.id, select));
  wrapper.appendChild(moveBtn);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "secondary";
  copyBtn.textContent = "Copy";
  copyBtn.dataset.immersionKey = "copyButton";
  copyBtn.addEventListener("click", () => handleCopyWord(word.id, select));
  wrapper.appendChild(copyBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "secondary";
  cancelBtn.textContent = "Cancel";
  cancelBtn.dataset.immersionKey = "btnCancel";
  cancelBtn.addEventListener("click", () => {
    movingWordId = null;
    renderWordList();
  });
  wrapper.appendChild(cancelBtn);

  return wrapper;
}

function handleMoveWord(wordId, select) {
  const targetThemeId = resolveMoveDestinationThemeId(select);
  if (!targetThemeId) return;
  const result = Storage.moveWordToTheme(wordId, targetThemeId);
  if (!result.success) {
    alert(
      result.reason === "duplicate"
        ? "That flashcard already exists in the destination theme — move canceled."
        : "Couldn't move that word."
    );
    return;
  }
  movingWordId = null;
  renderWordList();
}

function handleCopyWord(wordId, select) {
  const targetThemeId = resolveMoveDestinationThemeId(select);
  if (!targetThemeId) return;
  const result = Storage.copyWordToTheme(wordId, targetThemeId);
  if (!result.success) {
    alert(
      result.reason === "duplicate"
        ? "That flashcard already exists in the destination theme — copy canceled."
        : "Couldn't copy that word."
    );
    return;
  }
  const destTheme = Storage.getTheme(targetThemeId);
  movingWordId = null;
  renderWordList();
  alert(`Copied to "${destTheme ? destTheme.name : "the other theme"}".`);
}

function buildWordEditForm(word) {
  const wrapper = document.createElement("div");
  wrapper.className = "word-edit-form";

  const englishInput = document.createElement("input");
  englishInput.type = "text";
  englishInput.value = word.english;
  englishInput.className = "edit-english-input";
  englishInput.setAttribute("aria-label", "English");

  const tlInput = document.createElement("input");
  tlInput.type = "text";
  tlInput.value = word.targetLang;
  tlInput.className = "edit-tl-input";
  tlInput.setAttribute("aria-label", "Target language");

  wrapper.appendChild(englishInput);
  wrapper.appendChild(tlInput);

  if (activeTheme && activeTheme.language === "ja") {
    const furiganaInput = document.createElement("input");
    furiganaInput.type = "text";
    furiganaInput.value = word.furigana || "";
    furiganaInput.className = "edit-furigana-input";
    furiganaInput.placeholder = "furigana";
    furiganaInput.setAttribute("aria-label", "Furigana");
    wrapper.appendChild(furiganaInput);
  }

  const exampleInput = document.createElement("input");
  exampleInput.type = "text";
  exampleInput.value = word.exampleSentence || "";
  exampleInput.className = "edit-example-input";
  exampleInput.placeholder = "example sentence (optional)";
  exampleInput.setAttribute("aria-label", "Example sentence");
  wrapper.appendChild(exampleInput);

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "Save";
  saveBtn.dataset.immersionKey = "btnSave";
  saveBtn.addEventListener("click", () => handleSaveWordEdit(word.id, wrapper));
  wrapper.appendChild(saveBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "secondary";
  cancelBtn.textContent = "Cancel";
  cancelBtn.dataset.immersionKey = "btnCancel";
  cancelBtn.addEventListener("click", () => {
    editingWordId = null;
    renderWordList();
  });
  wrapper.appendChild(cancelBtn);

  return wrapper;
}

function handleSaveWordEdit(wordId, wrapper) {
  const english = wrapper.querySelector(".edit-english-input").value.trim();
  const targetLang = wrapper.querySelector(".edit-tl-input").value.trim();
  const furiganaInput = wrapper.querySelector(".edit-furigana-input");
  const furigana = furiganaInput ? furiganaInput.value.trim() : "";
  const exampleInput = wrapper.querySelector(".edit-example-input");
  const exampleSentence = exampleInput ? exampleInput.value.trim() : "";

  if (!english || !targetLang) {
    alert("Both English and the target-language word are required.");
    return;
  }

  if (isDuplicateInActiveTheme({ english, targetLang }, wordId)) {
    alert("Another flashcard with those exact values already exists in this theme.");
    return;
  }

  Storage.updateWord(wordId, { english, targetLang, furigana, exampleSentence });
  editingWordId = null;
  renderWordList();
}

function handleWordListClick(e) {
  if (e.target.classList.contains("delete-word-btn")) {
    Storage.deleteWord(e.target.dataset.wordId);
    renderWordList();
    return;
  }
  if (e.target.classList.contains("edit-word-btn")) {
    editingWordId = e.target.dataset.wordId;
    movingWordId = null;
    renderWordList();
    return;
  }
  if (e.target.classList.contains("move-word-btn")) {
    movingWordId = e.target.dataset.wordId;
    editingWordId = null;
    renderWordList();
  }
}

// ---------------------------------------------------------------------
// Conjugation tables panel
// ---------------------------------------------------------------------

function buildConjugationTableElement(forms) {
  const tenses = Object.keys(forms);
  const table = document.createElement("table");
  table.className = "conjugation-table";

  const headRow = document.createElement("tr");
  headRow.appendChild(document.createElement("th"));
  const anyTense = forms[tenses[0]] || {};
  const persons = Object.keys(anyTense);
  persons.forEach((person) => {
    const th = document.createElement("th");
    th.textContent = SpanishConjugator.PERSON_LABELS[person] || person;
    headRow.appendChild(th);
  });
  table.appendChild(headRow);

  tenses.forEach((tense) => {
    const row = document.createElement("tr");
    const th = document.createElement("th");
    th.textContent = SpanishConjugator.TENSE_LABELS[tense] || tense;
    row.appendChild(th);
    persons.forEach((person) => {
      const td = document.createElement("td");
      td.textContent = forms[tense][person] || "—";
      row.appendChild(td);
    });
    table.appendChild(row);
  });

  return table;
}

function renderConjugationTablesPanel() {
  const panel = document.getElementById("conjugation-tables-panel");
  const container = document.getElementById("conjugation-tables");
  if (!panel || !container) return;

  // Conjugation tables are a Spanish-only concept (there's no Japanese
  // equivalent built yet) — never show this panel while looking at a
  // Japanese theme's Add Vocab page, regardless of what Spanish verb
  // tables might exist elsewhere in the app (tables aren't per-theme,
  // they're one global list keyed by infinitive, shared across every
  // Spanish theme).
  if (!activeTheme || activeTheme.language !== "es") {
    panel.hidden = true;
    container.innerHTML = "";
    return;
  }

  const tables = Storage.getConjugationTables();

  panel.hidden = tables.length === 0;
  container.innerHTML = "";

  tables.forEach((table) => {
    const verb = SpanishConjugator.findVerb(table.infinitive);
    const wrapper = document.createElement("div");
    wrapper.className = "conjugation-table-wrapper";

    const heading = document.createElement("h3");
    heading.textContent = verb ? `${table.infinitive} — ${verb.english}` : table.infinitive;
    wrapper.appendChild(heading);

    wrapper.appendChild(buildConjugationTableElement(table.forms));
    container.appendChild(wrapper);
  });
}

// ---------------------------------------------------------------------
// Flashcard quiz
// ---------------------------------------------------------------------

function renderQuizThemeCheckboxes() {
  const container = document.getElementById("quiz-theme-checkboxes");
  if (!container) return;
  const themes = Storage.getThemes();
  container.innerHTML = "";

  if (themes.length === 0) {
    container.textContent = "Add a theme with some words first.";
    container.dataset.immersionKey = "addThemeWithWordsFirstText";
    return;
  }

  themes.forEach((theme) => {
    const label = document.createElement("label");
    label.className = "checkbox-label";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = theme.id;
    input.className = "quiz-theme-checkbox";
    // Arrived here from a specific theme's "Test" bubble: default to just
    // that one, but every theme is still listed in case you want to
    // combine a quiz across more than one.
    input.checked = activeTheme ? theme.id === activeTheme.id : true;
    label.appendChild(input);
    label.appendChild(document.createTextNode(` ${theme.name} (${LANGUAGE_NAMES[theme.language]})`));
    container.appendChild(label);
  });
}

function renderQuizTenseCheckboxes() {
  const container = document.getElementById("quiz-tense-checkboxes");
  if (!container) return;
  container.innerHTML = "";
  SpanishConjugator.TENSE_KEYS.forEach((tense) => {
    const label = document.createElement("label");
    label.className = "checkbox-label";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = tense;
    input.className = "quiz-tense-checkbox";
    if (tense === "present" || tense === "preterite") input.checked = true; // sensible default
    label.appendChild(input);
    label.appendChild(document.createTextNode(" " + SpanishConjugator.TENSE_LABELS[tense]));
    container.appendChild(label);
  });
}

function handleQuizModeChange() {
  const mode = document.querySelector('input[name="quiz-mode"]:checked').value;
  document.getElementById("vocab-quiz-options").hidden = mode !== "vocab";
  document.getElementById("conjugation-quiz-options").hidden = mode !== "conjugation";
}

function shuffle(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Which curated verbs (as SpanishConjugator verb objects) show up as a
// word in any of the given themes — a word counts as a verb only if
// its Spanish side is exactly a curated infinitive, e.g. "hablar".
function buildVerbsInThemes(themeIds) {
  const infinitives = new Set();
  themeIds.forEach((themeId) => {
    Storage.getWords(themeId).forEach((word) => {
      const verb = SpanishConjugator.findVerb(word.targetLang);
      if (verb) infinitives.add(verb.infinitive);
    });
  });
  return Array.from(infinitives).map((inf) => SpanishConjugator.findVerb(inf));
}

function orderAndLimit(cards) {
  const due = [];
  const notDue = [];
  cards.forEach((card) => {
    if (Srs.isDue(Storage.getSrsStats(card.id))) due.push(card);
    else notDue.push(card);
  });
  let ordered = shuffle(due).concat(shuffle(notDue));

  const limitEnabled = document.getElementById("limit-quiz-size").checked;
  if (limitEnabled) {
    const size = parseInt(document.getElementById("quiz-size").value, 10);
    if (size > 0) ordered = ordered.slice(0, size);
  }
  return ordered;
}

function handleStartQuiz() {
  const mode = document.querySelector('input[name="quiz-mode"]:checked').value;
  if (mode === "conjugation") {
    handleStartConjugationQuiz();
    return;
  }

  const themeIds = Array.from(document.querySelectorAll(".quiz-theme-checkbox:checked")).map((el) => el.value);
  const direction = document.querySelector('input[name="direction"]:checked').value;
  const includeVerbDrill = document.getElementById("include-verb-drill").checked;

  const cards = [];

  themeIds.forEach((themeId) => {
    Storage.getWords(themeId).forEach((word) => {
      const card =
        direction === "en-tl"
          ? { prompt: word.english, answer: word.targetLang + (word.furigana ? ` (${word.furigana})` : "") }
          : { prompt: word.targetLang, answer: word.english };
      card.id = word.id;
      cards.push(card);
    });
  });

  if (includeVerbDrill) {
    Storage.getConjugationTables().forEach((table) => {
      Object.keys(table.forms).forEach((tense) => {
        Object.keys(table.forms[tense]).forEach((person) => {
          const form = table.forms[tense][person];
          if (!form) return;
          cards.push({
            id: `verb:${table.infinitive}:${tense}:${person}`,
            prompt: `${table.infinitive} — ${SpanishConjugator.TENSE_LABELS[tense]}, ${SpanishConjugator.PERSON_LABELS[person]}`,
            answer: form,
          });
        });
      });
    });
  }

  if (cards.length === 0) {
    alert("No words to quiz on — pick at least one theme with words, or add some words first.");
    return;
  }

  // Spaced repetition: cards that are due (or brand new) go first, cards
  // you've reviewed recently and aren't due yet go last — each group
  // shuffled internally so it's not always the same order.
  quizQueue = orderAndLimit(cards);
  document.getElementById("quiz-setup").hidden = true;
  document.getElementById("quiz-done").hidden = true;
  document.getElementById("quiz-card").hidden = false;
  showNextCard();
}

function showNextCard() {
  if (quizQueue.length === 0) {
    document.getElementById("quiz-card").hidden = true;
    document.getElementById("quiz-done").hidden = false;
    return;
  }
  currentCard = quizQueue.shift();
  document.getElementById("quiz-prompt").textContent = currentCard.prompt;
  document.getElementById("quiz-answer").hidden = true;
  document.getElementById("quiz-buttons").hidden = true;
  document.getElementById("show-answer").hidden = false;
}

function handleShowAnswer() {
  document.getElementById("quiz-answer").textContent = currentCard.answer;
  document.getElementById("quiz-answer").hidden = false;
  document.getElementById("quiz-buttons").hidden = false;
  document.getElementById("show-answer").hidden = true;
}

function recordReview(quality) {
  if (!currentCard || !currentCard.id) return;
  const stats = Storage.getSrsStats(currentCard.id);
  const next = Srs.nextReviewState(stats, quality);
  Storage.saveSrsStats(currentCard.id, next);
}

function handleQuizGotIt() {
  recordReview(Srs.QUALITY.GOOD);
  showNextCard();
}

function handleQuizReviewAgain() {
  recordReview(Srs.QUALITY.AGAIN);
  // Also put it back a few cards later in THIS session, so it doesn't
  // just repeat immediately next (separate from the SRS due date,
  // which schedules it for a future session).
  const insertAt = Math.min(3, quizQueue.length);
  quizQueue.splice(insertAt, 0, currentCard);
  showNextCard();
}

function handleRestartQuiz() {
  document.getElementById("quiz-done").hidden = true;
  document.getElementById("quiz-card").hidden = true;
  document.getElementById("conjugation-quiz-card").hidden = true;
  document.getElementById("quiz-setup").hidden = false;
  renderQuizThemeCheckboxes();
}

// ---------------------------------------------------------------------
// Verb conjugation quiz (typed answer, checked, override available)
// ---------------------------------------------------------------------

function handleStartConjugationQuiz() {
  const themeIds = Array.from(document.querySelectorAll(".quiz-theme-checkbox:checked")).map((el) => el.value);
  const tenses = Array.from(document.querySelectorAll(".quiz-tense-checkbox:checked")).map((el) => el.value);

  if (tenses.length === 0) {
    alert("Pick at least one tense.");
    return;
  }

  const verbs = buildVerbsInThemes(themeIds);
  if (verbs.length === 0) {
    alert(
      'No curated verbs found in the selected theme(s). Add a verb\'s infinitive (like "hablar") as a word in one of these themes first.'
    );
    return;
  }

  const cards = [];
  verbs.forEach((verb) => {
    tenses.forEach((tense) => {
      SpanishConjugator.PERSON_KEYS.forEach((person) => {
        const answer = SpanishConjugator.conjugate(verb, tense, person);
        if (!answer) return;
        cards.push({
          id: `verb:${verb.infinitive}:${tense}:${person}`,
          infinitive: verb.infinitive,
          english: verb.english,
          tense,
          person,
          answer,
        });
      });
    });
  });

  conjugationQuizQueue = orderAndLimit(cards);
  document.getElementById("quiz-setup").hidden = true;
  document.getElementById("quiz-done").hidden = true;
  document.getElementById("conjugation-quiz-card").hidden = false;
  showNextConjugationCard();
}

function showNextConjugationCard() {
  if (conjugationQuizQueue.length === 0) {
    document.getElementById("conjugation-quiz-card").hidden = true;
    document.getElementById("quiz-done").hidden = false;
    return;
  }
  currentConjugationCard = conjugationQuizQueue.shift();
  const c = currentConjugationCard;
  document.getElementById("conjugation-quiz-prompt").textContent =
    `Conjugate "${c.infinitive}" (${c.english}) — ${SpanishConjugator.TENSE_LABELS[c.tense]}, ${SpanishConjugator.PERSON_LABELS[c.person]}`;

  const input = document.getElementById("conjugation-answer-input");
  input.value = "";
  input.hidden = false;
  input.disabled = false;
  document.getElementById("check-conjugation-answer").hidden = false;
  document.getElementById("conjugation-result").hidden = true;
}

async function handleCheckConjugationAnswer() {
  const input = document.getElementById("conjugation-answer-input");
  const userAnswer = input.value.trim();
  if (!userAnswer || !currentConjugationCard) return;

  const c = currentConjugationCard;
  const isLocalMatch = SpanishConjugator.normalizeForMatch(userAnswer) === SpanishConjugator.normalizeForMatch(c.answer);

  if (isLocalMatch) {
    showConjugationResult(true, "Correct!", c.answer);
    return;
  }

  // Not an exact/accent-insensitive match — ask Claude for a second
  // opinion rather than failing it outright (could be a valid regional
  // variant, or a subtler issue worth explaining rather than just
  // "wrong").
  document.getElementById("check-conjugation-answer").disabled = true;
  const result = await Translate.checkConjugation(c.infinitive, c.tense, c.person, c.answer, userAnswer);
  document.getElementById("check-conjugation-answer").disabled = false;

  if (result) {
    showConjugationResult(result.correct, result.feedback, c.answer);
  } else {
    showConjugationResult(
      false,
      "Not quite — and the grammar-check server isn't reachable for a second opinion (is it running?).",
      c.answer
    );
  }
}

function showConjugationResult(correct, feedback, expectedAnswer) {
  document.getElementById("conjugation-answer-input").hidden = true;
  document.getElementById("check-conjugation-answer").hidden = true;

  document.getElementById("conjugation-result").hidden = false;
  document.getElementById("conjugation-result-text").textContent = correct
    ? feedback
    : `${feedback} Expected: "${expectedAnswer}".`;
  document.getElementById("conjugation-override").hidden = correct;

  recordConjugationReview(correct ? Srs.QUALITY.GOOD : Srs.QUALITY.AGAIN);
}

function recordConjugationReview(quality) {
  if (!currentConjugationCard) return;
  const stats = Storage.getSrsStats(currentConjugationCard.id);
  Storage.saveSrsStats(currentConjugationCard.id, Srs.nextReviewState(stats, quality));
}

function handleConjugationOverride() {
  recordConjugationReview(Srs.QUALITY.GOOD);
  document.getElementById("conjugation-result-text").textContent = "Marked correct (overridden).";
  document.getElementById("conjugation-override").hidden = true;
}

function handleConjugationNext() {
  showNextConjugationCard();
}
