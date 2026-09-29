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
// Which theme/folder card currently has its edit-icon (Rename/Delete/
// Copy) popover open, in either the top-level list (vocab.html) or a
// theme's sub-folder list (theme.html) -- only one open at a time.
let editMenuOpenForId = null;
// Whether Sort mode is active on this page -- makes the theme/folder
// cards in #theme-list draggable and repositionable, the same way app
// icons become movable on an iPhone home screen when you long-press
// them. Off by default; toggled by the Sort button, which appears on
// every one of these pages (top-level Vocab Bank and every folder
// inside it) so the same drag-to-reorder/merge/group behaviour works
// at any nesting depth.
let sortModeActive = false;
// Whether the "Recently removed" trash panel is currently shown.
let trashPanelOpen = false;
// Session-only undo stack for cheap, easily-reversed actions -- drag
// reorder, rename, copy, and create-a-folder -- kept in memory only
// (cleared on refresh/navigation), capped at UNDO_STACK_LIMIT entries.
// Merge and Delete deliberately do NOT use this: they collapse or
// discard real data, so they go through Storage's persistent ~30-day
// "Recently removed" trash instead (see renderThemeTrashList), which
// survives a refresh or a closed laptop.
let undoStack = [];
const UNDO_STACK_LIMIT = 15;
// Mirrors storage.js's own THEME_TRASH_MAX_AGE_MS for the "N days
// left" display below -- that constant isn't exported, so it's just
// kept in sync here (both are 30 days, a design constant, not user
// data). Named differently from storage.js's copy on purpose: classic
// (non-module) <script> tags share one global scope, so two files each
// declaring a top-level `const` of the same name is a SyntaxError that
// silently breaks the whole page (this exact bug once shipped for real
// and blanked every theme list -- never reuse this exact name again).
const VOCAB_APP_THEME_TRASH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
// Sort-mode drag state for the hold-to-merge-or-group interaction: the
// theme being dragged, and (while hovering over a candidate drop
// target) the pending timer that -- if the drag lingers long enough --
// opens the Merge/Create-folder chooser instead of a plain reorder.
let dragSourceThemeId = null;
let dragHoverTargetId = null;
let dragHoverTimer = null;
const DRAG_HOLD_MS = 550;
// Whether the current hover has been held past DRAG_HOLD_MS -- read by
// the `drop` handler (which fires only once the native drag has fully
// concluded) to decide between a plain reorder and opening the
// merge/folder chooser. Deciding this in `drop` instead of mid-drag
// (the old code opened the chooser straight from the dragover timer)
// is what fixes a bug where opening a modal while the browser still
// thought a drag was in progress could lose track of one of the two
// themes involved.
let dragHeld = false;
// Which folder's children #theme-list is currently showing: null at
// the top level (vocab.html), or a theme's id when that list is a
// theme.html page's sub-folder list -- set once in applyActiveThemeToUI.
let themeListParentId = null;
// Ids of words checked via the bulk-select checkboxes in the word list,
// for the "Move selected"/"Copy selected" bar — lets several words be
// filed into another theme (or merged into one) in one go, instead of
// one at a time through the per-word Move/Copy panel above.
let selectedWordIds = new Set();
// How the word list is currently ordered — "newest" (createdAt
// descending), "target-az" (alphabetical by targetLang), or
// "english-az" (alphabetical by english). Defaults to newest-first,
// matching the sort dropdown's default selection.
let wordListSortMode = "newest";
// { query, partOfSpeech, verbClass } (Japanese) or { query, partOfSpeech,
// verbType } (Spanish/French) set right after a dictionary lookup that
// identified a verb and its conjugation class — consumed (and cleared)
// the moment the word actually gets saved, so a verb looked up once but
// never saved doesn't leak its tag onto some unrelated later word.
// `query` is whichever side was typed in to trigger the lookup
// (lowercased/trimmed), used to sanity-check that what's about to be
// saved is still the same word that was looked up.
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
  // "View Vocab" opens the same add-vocab.html page (it already renders
  // the saved-words list) in a stripped-down ?view=list mode that hides
  // the add-a-word form and bulk-import panel, so it actually reads as
  // a plain list rather than looking identical to "Add New Vocab".
  const hubViewLink = document.getElementById("theme-hub-view-link");
  if (hubViewLink) hubViewLink.href = `add-vocab.html?id=${id}&view=list`;

  // Verb conjugation is a Spanish-only concept (conjugation tables,
  // detected verb forms, the conjugation quiz mode) — hide every entry
  // point to it on a Japanese theme instead of showing an option that
  // doesn't apply and won't find anything.
  const conjugationModeLabel = document.getElementById("conjugation-mode-label");
  if (conjugationModeLabel) conjugationModeLabel.hidden = activeTheme.language !== "es";
  const verbDrillLabel = document.getElementById("verb-drill-label");
  if (verbDrillLabel) verbDrillLabel.hidden = activeTheme.language !== "es";

  // A folder (created via Sort mode's drag-to-group) has no vocab of
  // its own -- it only groups other themes/folders -- so it hides the
  // Add/Test/View bubbles a real vocab theme shows.
  const bubbles = document.getElementById("theme-vocab-bubbles");
  if (bubbles) bubbles.hidden = activeTheme.type === "folder";

  // A folder's own page should look exactly like the top-level Vocab
  // Bank "Themes" panel -- same heading/hint/Add-theme row -- instead
  // of the bespoke "Sub-folders" panel a regular vocab-holding theme
  // shows alongside its Add/Test/View bubbles. Since it's the same
  // page design, the same drag-to-merge/-group behaviour just works
  // recursively at any folder depth for free.
  const isFolder = activeTheme.type === "folder";
  const subfolderHeadingBlock = document.getElementById("subfolder-heading-block");
  const folderHeadingBlock = document.getElementById("folder-heading-block");
  const newSubfolderForm = document.getElementById("new-subfolder-form");
  const themeSublistPanel = document.getElementById("theme-sublist-panel");
  const folderNewThemeForm = document.getElementById("new-theme-form");
  if (subfolderHeadingBlock) subfolderHeadingBlock.hidden = isFolder;
  if (folderHeadingBlock) folderHeadingBlock.hidden = !isFolder;
  if (newSubfolderForm) newSubfolderForm.hidden = isFolder;
  if (themeSublistPanel) themeSublistPanel.classList.toggle("panel", isFolder);
  if (folderNewThemeForm) folderNewThemeForm.hidden = !isFolder;
  if (isFolder) {
    const folderLangSelect = document.getElementById("new-theme-language");
    if (folderLangSelect) folderLangSelect.value = activeTheme.language;
  }

  // theme.html's header doesn't have its own "Add random vocab" link
  // in the markup the way vocab.html does -- point the shared one at
  // this theme's language so it shows up here too, folder or not.
  const themeAddRandomVocabLink = document.getElementById("theme-add-random-vocab-link");
  if (themeAddRandomVocabLink) themeAddRandomVocabLink.href = `add-random-vocab.html?lang=${activeTheme.language}`;

  // "Back" always goes one level up -- to the folder you're actually
  // inside of, never a jump straight back to the top of Vocab Bank from
  // several folders deep.
  const themeBackLink = document.getElementById("theme-back-link");
  if (themeBackLink) {
    themeBackLink.href = activeTheme.parentId
      ? `theme.html?id=${encodeURIComponent(activeTheme.parentId)}`
      : `vocab.html?lang=${activeTheme.language}`;
  }

  // Back links on quiz.html / add-vocab.html point back to this theme's hub.
  const quizBackLink = document.getElementById("quiz-back-link");
  if (quizBackLink) quizBackLink.href = `theme.html?id=${id}`;
  const addVocabBackLink = document.getElementById("add-vocab-back-link");
  if (addVocabBackLink) addVocabBackLink.href = `theme.html?id=${id}`;

  renderWordList(); // no-op if #word-list isn't on this page

  // theme.html: this same theme is also a folder that can hold
  // sub-folders -- scope #theme-list (shared with vocab.html's
  // top-level list) to activeTheme's children, and render the
  // breadcrumb trail up to it. Both are no-ops on any page without
  // these elements.
  themeListParentId = activeTheme.id;
  renderThemeList();
  renderThemeBreadcrumb();
  renderAddExistingThemeForm();
  renderUndoButton();
}

// A folder's (or theme's) own page lets you add an EXISTING theme/
// folder into it directly, alongside the drag-to-group way of doing
// the same thing -- same language, not itself, and not one of its own
// ancestors (which would create a cycle).
function renderAddExistingThemeForm() {
  const form = document.getElementById("add-existing-theme-form");
  const select = document.getElementById("add-existing-theme-select");
  if (!form || !select || !activeTheme) return;

  // A folder's own page mirrors the top-level Vocab Bank page exactly
  // -- Add theme only, no separate "add existing" picker. Pulling an
  // existing theme in is done from the PARENT view instead, by
  // dragging it onto the folder's tile (see attachThemeDragHandlers).
  if (activeTheme.type === "folder") {
    form.hidden = true;
    return;
  }

  const candidates = Storage.getThemes().filter(
    (t) =>
      t.language === activeTheme.language &&
      t.id !== activeTheme.id &&
      (t.parentId || null) !== activeTheme.id &&
      !Storage.isThemeDescendantOf(activeTheme.id, t.id)
  );

  if (candidates.length === 0) {
    form.hidden = true;
    return;
  }
  form.hidden = false;
  select.innerHTML = "";
  candidates
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      select.appendChild(opt);
    });
}

function handleAddExistingThemeSubmit(e) {
  e.preventDefault();
  if (!activeTheme) return;
  const select = document.getElementById("add-existing-theme-select");
  if (!select || !select.value) return;
  const themeId = select.value;
  const theme = Storage.getTheme(themeId);
  if (!theme) return;
  const previousParentId = theme.parentId || null;
  const result = Storage.moveTheme(themeId, activeTheme.id);
  if (!result.success) {
    alert("Couldn't add that here.");
    return;
  }
  pushUndo(`Added "${theme.name}" to "${activeTheme.name}"`, () => {
    Storage.moveTheme(themeId, previousParentId);
    renderThemeList();
    renderAddExistingThemeForm();
  });
  renderThemeList();
  renderAddExistingThemeForm();
}

function renderThemeBreadcrumb() {
  const nav = document.getElementById("theme-breadcrumb");
  if (!nav || !activeTheme) return;
  nav.innerHTML = "";

  const rootLink = document.createElement("a");
  rootLink.href = `vocab.html?lang=${activeTheme.language}`;
  rootLink.textContent = "Vocab Bank";
  rootLink.dataset.immersionKey = "sectionVocab";
  nav.appendChild(rootLink);

  Storage.getThemeAncestors(activeTheme.id).forEach((ancestor) => {
    const sep = document.createElement("span");
    sep.className = "breadcrumb-sep";
    sep.textContent = "/";
    nav.appendChild(sep);

    const link = document.createElement("a");
    link.href = `theme.html?id=${encodeURIComponent(ancestor.id)}`;
    link.textContent = ancestor.name;
    nav.appendChild(link);
  });

  const sep2 = document.createElement("span");
  sep2.className = "breadcrumb-sep";
  sep2.textContent = "/";
  nav.appendChild(sep2);

  const current = document.createElement("span");
  current.className = "breadcrumb-current";
  current.textContent = activeTheme.name;
  nav.appendChild(current);
}

function handleNewSubfolderSubmit(e) {
  e.preventDefault();
  if (!activeTheme) return;
  const nameInput = document.getElementById("new-subfolder-name");
  if (!nameInput) return;
  const name = nameInput.value.trim();
  if (!name) return;
  Storage.addTheme(name, activeTheme.language, activeTheme.id);
  nameInput.value = "";
  renderThemeList();
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
    const addRandomVocabLink = document.getElementById("add-random-vocab-link");
    if (addRandomVocabLink) addRandomVocabLink.href = `add-random-vocab.html?lang=${activeLangFilter}`;
  }

  // "View Vocab" (theme.html's third bubble) reaches this same page
  // with ?view=list — hides the add-word form and bulk-import panel so
  // it actually reads as a plain list rather than looking identical to
  // "Add New Vocab", per the whole point of that being a separate
  // option in the first place.
  if (getQueryParam("view") === "list") {
    const addWordPanel = document.getElementById("add-word-panel");
    const bulkImportPanel = document.getElementById("bulk-import-panel");
    if (addWordPanel) addWordPanel.hidden = true;
    if (bulkImportPanel) bulkImportPanel.hidden = true;
    const heading = document.getElementById("add-vocab-heading");
    if (heading) {
      heading.textContent = "View Vocab";
      heading.dataset.immersionKey = "viewVocabHeading";
    }
  }

  renderThemeList();
  renderQuizThemeCheckboxes();
  renderQuizTenseCheckboxes();
  renderConjugationTablesPanel();

  on("word-list-sort-select", "change", handleWordListSortChange);

  on("new-theme-form", "submit", handleNewThemeSubmit);
  on("new-subfolder-form", "submit", handleNewSubfolderSubmit);
  on("add-existing-theme-form", "submit", handleAddExistingThemeSubmit);
  on("theme-sort-btn", "click", handleSortToggle);
  on("theme-undo-btn", "click", handleUndoClick);
  on("theme-trash-btn", "click", handleTrashToggle);
  initThemeHeaderEditMenu();
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
  on("word-select-all-checkbox", "change", handleWordSelectAllChange);
  on("word-bulk-move-btn", "click", handleWordBulkMove);
  on("word-bulk-copy-btn", "click", handleWordBulkCopy);
  on("word-bulk-theme-select", "change", (e) => {
    if (e.target.value !== MOVE_NEW_THEME_VALUE) return;
    createMoveDestinationTheme(e.target);
  });

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
  // Vocab Bank pages are already scoped to one language by construction
  // (a Japanese vocab page only ever holds Japanese vocab) -- the shared
  // topbar's language label is just redundant chrome here, so blank it
  // out on these pages specifically without touching the topbar script
  // itself (still shown normally everywhere else in the app).
  const topbarLangLabel = document.getElementById("topbar-lang-label");
  if (topbarLangLabel) topbarLangLabel.textContent = "";
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

  // Closes any open per-card edit-icon popover (and theme.html's own
  // header edit menu) on a genuine outside click -- the popovers/menu
  // themselves stop click propagation, so this only fires when the
  // click actually lands elsewhere on the page.
  document.addEventListener("click", () => {
    if (editMenuOpenForId !== null) {
      editMenuOpenForId = null;
      renderThemeList();
    }
    const headerMenu = document.getElementById("theme-edit-menu");
    if (headerMenu && !headerMenu.hidden) {
      headerMenu.hidden = true;
      headerMenu.innerHTML = "";
    }
  });
});

// ---------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------

// ---- Shared Rename/Delete/Copy actions -- used by both a theme's own
// per-card edit-icon popover (in a list) and theme.html's own header
// edit-icon menu (acting on the theme you're currently standing
// inside). `onDone` re-renders whatever list/UI called this; only the
// header-menu case passes isCurrentTheme so Delete knows to navigate
// away instead of just re-rendering a card that no longer exists.

function performThemeRename(theme, { onDone } = {}) {
  const newName = prompt(
    theme.type === "folder" ? "New name for this folder:" : "New name for this theme:",
    theme.name
  );
  if (!newName || !newName.trim() || newName.trim() === theme.name) return;
  const previousName = theme.name;
  const updated = Storage.renameTheme(theme.id, newName.trim());
  if (!updated) return;

  pushUndo(`Renamed "${newName.trim()}"`, () => {
    Storage.renameTheme(theme.id, previousName);
    if (theme.id === (activeTheme && activeTheme.id)) applyActiveThemeToUI();
    if (onDone) onDone();
  });

  if (theme.id === (activeTheme && activeTheme.id)) {
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
  if (onDone) onDone();
}

// Delete goes through Storage's persistent Recently Removed trash
// (softDeleteTheme under the hood), not the session undo stack -- it
// can discard real data (a folder's whole contents), so it needs to
// survive a refresh or a closed laptop, unlike a plain rename/move/copy.
function performThemeDelete(theme, { onDone, isCurrentTheme } = {}) {
  const wordCountNow = Storage.getWords(theme.id).length;
  const subfolderCountNow = Storage.getChildThemes(theme.id).length;
  let warning = `Remove "${theme.name}"?`;
  if (wordCountNow > 0 || subfolderCountNow > 0) {
    const parts = [];
    if (wordCountNow > 0) parts.push(`${wordCountNow} word${wordCountNow === 1 ? "" : "s"}`);
    if (subfolderCountNow > 0)
      parts.push(`${subfolderCountNow} sub-folder${subfolderCountNow === 1 ? "" : "s"} (and everything inside them)`);
    warning += ` This will also remove ${parts.join(" and ")}.`;
  }
  warning += ' It stays in "Recently removed" for about 30 days before being purged for good.';
  if (!confirm(warning)) return;

  const parentId = theme.parentId || null;
  const language = theme.language;
  Storage.deleteTheme(theme.id);
  renderQuizThemeCheckboxes();

  if (isCurrentTheme) {
    // The page you're standing on just removed itself out from under
    // you -- go up one level, same direction the Back button goes.
    window.location.href = parentId
      ? `theme.html?id=${encodeURIComponent(parentId)}`
      : `vocab.html?lang=${language}`;
    return;
  }
  if (onDone) onDone();
}

// Copy places the duplicate right next to the original -- Storage's
// copyTheme already nudges its order to sit immediately after the
// source when they share a parent -- useful once folders/merging are
// in play. It's a fresh, just-created theme, so undoing it is a plain
// hard delete (no 30-day trash entry needed for something that only
// existed a moment).
function performThemeCopy(theme, { onDone } = {}) {
  const result = Storage.copyTheme(theme.id, theme.parentId || null);
  if (!result.success) {
    alert("Couldn't copy that.");
    return;
  }
  const newThemeId = result.theme.id;
  pushUndo(`Copy of "${theme.name}"`, () => {
    Storage.hardDeleteTheme(newThemeId);
    renderQuizThemeCheckboxes();
    if (onDone) onDone();
  });
  renderQuizThemeCheckboxes();
  if (onDone) onDone();
}

// Fills an existing (or freshly created) .theme-edit-menu container
// with the Rename/Copy/Delete buttons -- shared by the per-card popover
// (buildThemeEditMenu, below) and theme.html's own header menu
// (initThemeHeaderEditMenu), which reuses a single persistent element
// already sitting in the page instead of creating a new one each time.
// Releases a folder's contents up exactly one level, into whatever
// folder or page is the folder's own immediate parent -- never
// straight to the top-level Vocab Bank page unless that parent
// actually IS the top level (parentId already being null covers that
// case for free, since moveTheme(..., null) is exactly "top level").
function performThemeEmptyFolder(theme, { onDone, isCurrentTheme } = {}) {
  const children = Storage.getChildThemes(theme.id);
  if (children.length === 0) {
    alert("This folder is already empty.");
    return;
  }
  if (!confirm(`Move everything inside "${theme.name}" out to its parent?`)) return;

  const releaseToParentId = theme.parentId || null;
  const previousParents = children.map((child) => ({ id: child.id, parentId: child.parentId || null }));
  children.forEach((child) => Storage.moveTheme(child.id, releaseToParentId));

  pushUndo(`Emptied "${theme.name}"`, () => {
    previousParents.forEach(({ id, parentId }) => Storage.moveTheme(id, parentId));
    renderThemeList();
  });

  renderThemeList();
  renderQuizThemeCheckboxes();
  if (onDone) onDone();
}

function populateThemeEditMenuButtons(menu, theme, { onDone, isCurrentTheme } = {}) {
  menu.innerHTML = "";

  const renameBtn = document.createElement("button");
  renameBtn.type = "button";
  renameBtn.textContent = "Rename";
  renameBtn.dataset.immersionKey = "renameButton";
  renameBtn.addEventListener("click", () => performThemeRename(theme, { onDone }));
  menu.appendChild(renameBtn);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.textContent = "Copy";
  copyBtn.dataset.immersionKey = "copyButton";
  copyBtn.addEventListener("click", () => performThemeCopy(theme, { onDone }));
  menu.appendChild(copyBtn);

  if (theme.type === "folder") {
    const emptyBtn = document.createElement("button");
    emptyBtn.type = "button";
    emptyBtn.textContent = "Empty folder";
    emptyBtn.addEventListener("click", () => performThemeEmptyFolder(theme, { onDone, isCurrentTheme }));
    menu.appendChild(emptyBtn);
  }

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "danger-option";
  deleteBtn.textContent = "Delete";
  deleteBtn.dataset.immersionKey = "btnDelete";
  deleteBtn.addEventListener("click", () => performThemeDelete(theme, { onDone, isCurrentTheme }));
  menu.appendChild(deleteBtn);
}

// The per-card popover (theme.html's sub-folder list, vocab.html's
// top-level list) -- a fresh little menu built and dropped next to
// whichever card's edit icon was just clicked.
function buildThemeEditMenu(theme, opts) {
  const menu = document.createElement("div");
  menu.className = "theme-edit-menu";
  populateThemeEditMenuButtons(menu, theme, opts);
  return menu;
}

// theme.html's own header ⋯ button -- same three actions, acting on
// activeTheme (the folder/theme you're currently standing inside)
// rather than a card in a list below it.
function initThemeHeaderEditMenu() {
  const btn = document.getElementById("theme-edit-btn");
  const menu = document.getElementById("theme-edit-menu");
  if (!btn || !menu) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!menu.hidden) {
      menu.hidden = true;
      menu.innerHTML = "";
      return;
    }
    if (!activeTheme) return;
    populateThemeEditMenuButtons(menu, activeTheme, {
      isCurrentTheme: true,
      onDone: () => {
        menu.hidden = true;
        menu.innerHTML = "";
      },
    });
    menu.hidden = false;
  });
  menu.addEventListener("click", (e) => e.stopPropagation());
}

// ---- Session undo stack -- Move (drag-reorder), Rename, Copy, and
// Create-a-folder only. Merge and Delete go through Storage's
// persistent Recently Removed trash instead (see performThemeDelete
// and the merge chooser below) since they collapse/discard data.

function pushUndo(label, undoFn) {
  undoStack.push({ label, undo: undoFn });
  if (undoStack.length > UNDO_STACK_LIMIT) undoStack.shift();
  renderUndoButton();
}

function renderUndoButton() {
  const btn = document.getElementById("theme-undo-btn");
  if (!btn) return;
  if (undoStack.length === 0) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  btn.textContent = `Undo (${undoStack.length})`;
}

function handleUndoClick() {
  if (undoStack.length === 0) return;
  const entry = undoStack.pop();
  entry.undo();
  renderUndoButton();
}

// ---- Sort mode + Recently removed panel ----

function handleSortToggle() {
  sortModeActive = !sortModeActive;
  const btn = document.getElementById("theme-sort-btn");
  if (btn) {
    btn.textContent = sortModeActive ? "Done" : "Sort";
    btn.classList.toggle("active", sortModeActive);
  }
  editMenuOpenForId = null;
  renderThemeList();
}

function handleTrashToggle() {
  trashPanelOpen = !trashPanelOpen;
  const panel = document.getElementById("theme-trash-panel");
  if (panel) panel.hidden = !trashPanelOpen;
  const btn = document.getElementById("theme-trash-btn");
  if (btn) btn.classList.toggle("active", trashPanelOpen);
  if (trashPanelOpen) renderThemeTrashList();
}

// A merged-away or deleted theme's full snapshot (itself, everything
// nested inside it, and its words) stays here for about 30 days before
// being purged for good -- restorable to right where it was without
// needing a full persistent undo system for every action.
function renderThemeTrashList() {
  const list = document.getElementById("theme-trash-list");
  if (!list) return;
  const effectiveLangFilter = activeTheme ? activeTheme.language : activeLangFilter;
  const entries = Storage.getThemeTrash().filter((entry) => {
    const top = entry.themes[0];
    return top && (!effectiveLangFilter || top.language === effectiveLangFilter);
  });
  list.innerHTML = "";

  if (entries.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-hint";
    li.textContent = "Nothing removed recently.";
    list.appendChild(li);
    return;
  }

  entries
    .slice()
    .sort((a, b) => b.removedAt - a.removedAt)
    .forEach((entry) => {
      const top = entry.themes[0];
      const li = document.createElement("li");
      li.className = "theme-item";

      const nameEl = document.createElement("span");
      nameEl.className = "theme-name";
      nameEl.textContent = top.name;
      li.appendChild(nameEl);

      const meta = document.createElement("span");
      meta.className = "theme-meta";
      const reasonBadge = document.createElement("span");
      reasonBadge.className = "word-count-badge";
      reasonBadge.textContent = entry.reason === "merged" ? "merged away" : "deleted";
      meta.appendChild(reasonBadge);
      const daysLeft = Math.max(
        1,
        Math.ceil((VOCAB_APP_THEME_TRASH_MAX_AGE_MS - (Date.now() - entry.removedAt)) / (24 * 60 * 60 * 1000))
      );
      const daysBadge = document.createElement("span");
      daysBadge.className = "word-count-badge";
      daysBadge.textContent = `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
      meta.appendChild(daysBadge);
      li.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "theme-item-actions";

      const restoreBtn = document.createElement("button");
      restoreBtn.type = "button";
      restoreBtn.textContent = "Restore";
      restoreBtn.addEventListener("click", () => {
        const result = Storage.restoreThemeTrashEntry(entry.id);
        if (!result.success) {
          alert("Couldn't restore that.");
          return;
        }
        renderThemeTrashList();
        renderThemeList();
        renderQuizThemeCheckboxes();
      });
      actions.appendChild(restoreBtn);

      const purgeBtn = document.createElement("button");
      purgeBtn.type = "button";
      purgeBtn.className = "secondary";
      purgeBtn.textContent = "Delete forever";
      purgeBtn.addEventListener("click", () => {
        if (!confirm(`Permanently delete "${top.name}"? This can't be undone.`)) return;
        Storage.permanentlyDeleteThemeTrashEntry(entry.id);
        renderThemeTrashList();
      });
      actions.appendChild(purgeBtn);

      li.appendChild(actions);
      list.appendChild(li);
    });
}

function handleNewThemeSubmit(e) {
  e.preventDefault();
  const nameInput = document.getElementById("new-theme-name");
  const langSelect = document.getElementById("new-theme-language");
  const name = nameInput.value.trim();
  if (!name) return;

  // On vocab.html activeTheme is always null (top level, unchanged
  // behaviour); on a folder's own theme.html page this is the same
  // "Add theme" row, just scoped to add the new theme inside it.
  Storage.addTheme(name, langSelect.value, activeTheme ? activeTheme.id : null);
  nameInput.value = "";
  renderThemeList();
  renderQuizThemeCheckboxes();
}

function renderThemeList() {
  const list = document.getElementById("theme-list");
  if (!list) return;
  // On theme.html this list is showing activeTheme's sub-folders (set
  // in applyActiveThemeToUI), scoped to its own language; on vocab.html
  // it's the top-level list, scoped by the page's own language filter.
  const effectiveLangFilter = activeTheme ? activeTheme.language : activeLangFilter;
  const themes = Storage.getChildThemes(themeListParentId, effectiveLangFilter);
  list.innerHTML = "";

  if (themes.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-hint";
    if (activeTheme) {
      li.textContent = "No sub-folders yet — create one below.";
      li.dataset.immersionKey = "noSubfoldersHint";
    } else if (activeLangFilter) {
      li.textContent = `No ${LANGUAGE_NAMES[activeLangFilter]} themes yet — add one above to get started.`;
    } else {
      li.textContent = "No themes yet — add one above to get started.";
    }
    list.appendChild(li);
    return;
  }

  themes.forEach((theme) => {
    const subfolderCount = Storage.getChildThemes(theme.id).length;
    const isFolder = theme.type === "folder";

    const li = document.createElement("li");
    li.className = `theme-item lang-${theme.language}${isFolder ? " theme-item-folder" : ""}${
      sortModeActive ? " theme-item-sortable" : ""
    }`;
    li.dataset.themeId = theme.id;

    if (!sortModeActive) {
      li.addEventListener("click", () => {
        window.location.href = `theme.html?id=${encodeURIComponent(theme.id)}`;
      });
    }

    if (isFolder) {
      const icon = document.createElement("span");
      icon.className = "theme-folder-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "\ud83d\udcc1";
      li.appendChild(icon);
    }

    const nameEl = document.createElement("span");
    nameEl.className = "theme-name";
    nameEl.textContent = theme.name;
    li.appendChild(nameEl);

    const meta = document.createElement("span");
    meta.className = "theme-meta";

    if (!isFolder) {
      const wordCount = Storage.getWords(theme.id).length;
      const langBadge = document.createElement("span");
      langBadge.className = `lang-badge lang-badge-${theme.language}`;
      langBadge.textContent = LANGUAGE_NAMES[theme.language];
      meta.appendChild(langBadge);

      const countBadge = document.createElement("span");
      countBadge.className = "word-count-badge";
      countBadge.textContent = `${wordCount} word${wordCount === 1 ? "" : "s"}`;
      meta.appendChild(countBadge);
    }

    if (subfolderCount > 0) {
      const subfolderBadge = document.createElement("span");
      subfolderBadge.className = "word-count-badge";
      subfolderBadge.textContent = `${subfolderCount} item${subfolderCount === 1 ? "" : "s"} inside`;
      meta.appendChild(subfolderBadge);
    }

    li.appendChild(meta);

    // Single edit icon -- opens Rename/Delete/Copy as a small popover
    // (Copy duplicates placed right next to the original), replacing
    // the old always-visible Rename/Move/Copy/Delete button row. Move
    // is drag-only now (see attachThemeDragHandlers below), or via the
    // "Add to this folder" picker for pulling in an existing theme.
    const editWrap = document.createElement("div");
    editWrap.className = "theme-edit-wrap";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "secondary theme-edit-icon-btn";
    editBtn.textContent = "\u22ef";
    editBtn.setAttribute("aria-label", `Edit ${theme.name}`);
    editBtn.setAttribute("aria-haspopup", "true");
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      editMenuOpenForId = editMenuOpenForId === theme.id ? null : theme.id;
      renderThemeList();
    });
    editWrap.appendChild(editBtn);

    if (editMenuOpenForId === theme.id) {
      const menu = buildThemeEditMenu(theme, { onDone: () => renderThemeList() });
      menu.addEventListener("click", (e) => e.stopPropagation());
      editWrap.appendChild(menu);
    }
    editWrap.addEventListener("click", (e) => e.stopPropagation());
    li.appendChild(editWrap);

    if (sortModeActive) attachThemeDragHandlers(li, theme);

    list.appendChild(li);
  });
}

// ---- Sort mode: drag-to-reorder, and (holding a drag over another
// card) drag-to-merge-or-group -- the same way app icons become
// movable on an iPhone home screen when you long-press them. Present
// on every one of these pages, including inside a folder, so the same
// behaviour builds folders-inside-folders to any depth.

function clearDragHoverTimer() {
  if (dragHoverTimer) {
    clearTimeout(dragHoverTimer);
    dragHoverTimer = null;
  }
}

function attachThemeDragHandlers(li, theme) {
  li.draggable = true;

  li.addEventListener("dragstart", (e) => {
    dragSourceThemeId = theme.id;
    li.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", theme.id);
    } catch (err) {
      /* some browsers are picky about setData -- dragSourceThemeId already tracks it */
    }
  });

  li.addEventListener("dragend", () => {
    li.classList.remove("dragging");
    clearDragHoverTimer();
    document.querySelectorAll(".drag-merge-target, .drag-hold-ready").forEach((el) =>
      el.classList.remove("drag-merge-target", "drag-hold-ready")
    );
    dragSourceThemeId = null;
    dragHoverTargetId = null;
    dragHeld = false;
  });

  li.addEventListener("dragover", (e) => {
    if (!dragSourceThemeId || dragSourceThemeId === theme.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragHoverTargetId === theme.id) return;
    clearDragHoverTimer();
    document.querySelectorAll(".drag-merge-target, .drag-hold-ready").forEach((el) =>
      el.classList.remove("drag-merge-target", "drag-hold-ready")
    );
    dragHoverTargetId = theme.id;
    dragHeld = false;
    li.classList.add("drag-merge-target");
    dragHoverTimer = setTimeout(() => {
      // Only mark the hold as reached and show it visually -- deciding
      // what to DO about it (and opening any modal/prompt) waits for
      // `drop`, once the native drag operation has actually finished.
      dragHeld = true;
      li.classList.add("drag-hold-ready");
    }, DRAG_HOLD_MS);
  });

  li.addEventListener("dragleave", () => {
    if (dragHoverTargetId !== theme.id) return;
    li.classList.remove("drag-merge-target", "drag-hold-ready");
    clearDragHoverTimer();
    dragHoverTargetId = null;
    dragHeld = false;
  });

  li.addEventListener("drop", (e) => {
    e.preventDefault();
    const sourceId = dragSourceThemeId;
    const targetId = theme.id;
    const held = dragHeld;
    li.classList.remove("drag-merge-target", "drag-hold-ready");
    clearDragHoverTimer();
    dragSourceThemeId = null;
    dragHoverTargetId = null;
    dragHeld = false;
    if (!sourceId || sourceId === targetId) return;
    if (held) {
      // Held past the threshold -- open the merge/folder chooser now
      // that the native drag has fully concluded, instead of from
      // mid-drag (see the comment on the dragHeld declaration above).
      openThemeDragChooser(sourceId, targetId);
    } else {
      // A quick drop, same as dropping an iPhone icon between two others.
      handleThemeReorderDrop(sourceId, targetId);
    }
  });
}

// Reorders sourceId to sit right where it was dropped, relative to
// targetId, within the SAME parent's sibling list -- dragging across
// into a different folder is what "Add to this folder" / the merge
// chooser's "Create a folder" option are for instead.
function handleThemeReorderDrop(sourceId, targetId) {
  const source = Storage.getTheme(sourceId);
  const target = Storage.getTheme(targetId);
  if (!source || !target) return;
  if ((source.parentId || null) !== (target.parentId || null)) return;

  const parentId = target.parentId || null;
  const effectiveLangFilter = activeTheme ? activeTheme.language : activeLangFilter;
  const siblings = Storage.getChildThemes(parentId, effectiveLangFilter);
  const previousOrder = siblings.map((t) => t.id);

  const ids = previousOrder.filter((id) => id !== sourceId);
  const targetIndex = ids.indexOf(targetId);
  ids.splice(targetIndex, 0, sourceId);

  Storage.reorderThemes(parentId, ids);
  pushUndo(`Moved "${source.name}"`, () => {
    Storage.reorderThemes(parentId, previousOrder);
    renderThemeList();
  });
  renderThemeList();
}

// The "hold a dragged theme over another" chooser: Merge combines both
// into one brand-new theme (with the option to rename it, duplicate
// words skipped automatically); Create a folder keeps both themes as
// they are, but groups them under a new folder you can name -- shown
// as a tile with a folder icon and its name underneath, opening to a
// page listing what's inside plus an "add" option for more.
// Moves both target and source under a brand-new folder, leaving each
// one's own existing contents completely untouched -- shared by the
// two-plain-themes chooser's "Group into a new folder" button and the
// two-folders chooser's "Group folders" button below, since creating a
// new parent folder and moving two existing themes into it is the same
// operation either way (Storage.moveTheme doesn't care whether the
// theme being moved is a folder or a vocab-holding theme).
function performGroupIntoFolder(target, source, defaultName) {
  const name = prompt("Name for the new folder:", defaultName);
  closeMergeChooser();
  if (!name || !name.trim()) return;
  const parentId = target.parentId || null;
  const targetPrevParent = target.parentId || null;
  const sourcePrevParent = source.parentId || null;
  const folder = Storage.addTheme(name.trim(), target.language, parentId, "folder");
  Storage.updateTheme(folder.id, { order: target.order });
  Storage.moveTheme(target.id, folder.id);
  Storage.moveTheme(source.id, folder.id);
  pushUndo(`Grouped "${target.name}" and "${source.name}"`, () => {
    Storage.moveTheme(target.id, targetPrevParent);
    Storage.moveTheme(source.id, sourcePrevParent);
    Storage.hardDeleteTheme(folder.id);
    renderThemeList();
  });
  renderThemeList();
  renderQuizThemeCheckboxes();
}

// Moves plainTheme straight into folderTheme -- the default action
// when one side of a drag is already a folder, so there's no need to
// ask about creating a new one.
function performAddToFolder(folderTheme, plainTheme) {
  closeMergeChooser();
  const prevParent = plainTheme.parentId || null;
  const result = Storage.moveTheme(plainTheme.id, folderTheme.id);
  if (!result.success) {
    alert("Couldn't add that to the folder.");
    return;
  }
  pushUndo(`Added "${plainTheme.name}" to "${folderTheme.name}"`, () => {
    Storage.moveTheme(plainTheme.id, prevParent);
    renderThemeList();
  });
  renderThemeList();
  renderQuizThemeCheckboxes();
}

// The "hold a dragged theme over another" chooser. What it offers
// depends on what's actually being dragged onto what: two plain
// themes get the original Merge-or-Create-folder choice; dragging onto
// (or with) an existing folder skips straight to the folder action,
// since there's no ambiguity about intent once a folder's involved.
function openThemeDragChooser(sourceId, targetId) {
  const modal = document.getElementById("theme-merge-modal");
  const source = Storage.getTheme(sourceId);
  const target = Storage.getTheme(targetId);
  if (!modal || !source || !target) return;

  modal.innerHTML = "";
  modal.hidden = false;

  const box = document.createElement("div");
  box.className = "theme-merge-modal-box";

  const heading = document.createElement("h2");
  heading.textContent = `"${target.name}" and "${source.name}"`;
  box.appendChild(heading);

  const hint = document.createElement("p");
  hint.className = "hint";

  const targetIsFolder = target.type === "folder";
  const sourceIsFolder = source.type === "folder";

  if (targetIsFolder && sourceIsFolder) {
    // Both sides are already folders -- group them under a brand-new
    // parent folder. Deliberately not called "merge": merge already
    // means something destructive (combining two themes' words into
    // one), and grouping two folders together does nothing destructive
    // at all -- each keeps its own contents, completely untouched.
    hint.textContent = "Both of these are already folders.";
    box.appendChild(hint);

    const groupBtn = document.createElement("button");
    groupBtn.type = "button";
    groupBtn.textContent = "Group folders";
    groupBtn.addEventListener("click", () => {
      performGroupIntoFolder(target, source, `${target.name} + ${source.name}`);
    });
    box.appendChild(groupBtn);
  } else if (targetIsFolder || sourceIsFolder) {
    // One side is already a folder -- that's the obvious default
    // action, no need to ask about creating a new one.
    const folderTheme = targetIsFolder ? target : source;
    const plainTheme = targetIsFolder ? source : target;
    hint.textContent = `Add "${plainTheme.name}" to the "${folderTheme.name}" folder?`;
    box.appendChild(hint);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.textContent = "Add to folder";
    addBtn.addEventListener("click", () => {
      performAddToFolder(folderTheme, plainTheme);
    });
    box.appendChild(addBtn);
  } else {
    // Two plain themes -- the original merge-or-create-folder choice.
    hint.textContent = "What would you like to do with these two?";
    box.appendChild(hint);

    const mergeBtn = document.createElement("button");
    mergeBtn.type = "button";
    mergeBtn.textContent = "Merge into one theme";
    mergeBtn.addEventListener("click", () => {
      const name = prompt("Name for the merged theme:", `${target.name} + ${source.name}`);
      closeMergeChooser();
      if (!name || !name.trim()) return;
      const result = Storage.mergeThemes(target.id, source.id, name.trim());
      if (!result.success) {
        alert("Couldn't merge those.");
        return;
      }
      // Merge collapses two themes' data into one -- it goes through
      // Recently Removed (both originals are soft-deleted, individually
      // restorable), not the session undo stack.
      renderThemeList();
      renderQuizThemeCheckboxes();
    });
    box.appendChild(mergeBtn);

    const folderBtn = document.createElement("button");
    folderBtn.type = "button";
    folderBtn.textContent = "Group into a new folder";
    folderBtn.addEventListener("click", () => {
      performGroupIntoFolder(target, source, "New folder");
    });
    box.appendChild(folderBtn);
  }

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "secondary";
  cancelBtn.textContent = "Cancel";
  cancelBtn.dataset.immersionKey = "btnCancel";
  cancelBtn.addEventListener("click", closeMergeChooser);
  box.appendChild(cancelBtn);

  modal.appendChild(box);
}

function closeMergeChooser() {
  const modal = document.getElementById("theme-merge-modal");
  if (!modal) return;
  modal.hidden = true;
  modal.innerHTML = "";
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
    if (pendingVerbInfo && pendingVerbInfo.query === tl.toLowerCase()) {
      word.partOfSpeech = pendingVerbInfo.partOfSpeech;
      if (pendingVerbInfo.verbClass) word.verbClass = pendingVerbInfo.verbClass;
      if (pendingVerbInfo.verbType) word.verbType = pendingVerbInfo.verbType;
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
  } else if (
    (activeTheme.language === "es" || activeTheme.language === "fr") &&
    result.partOfSpeech === "verb" &&
    result.verbType
  ) {
    pendingVerbInfo = {
      query: (english ? filledValue : tl).toLowerCase(),
      partOfSpeech: result.partOfSpeech,
      verbType: result.verbType,
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

function handleWordListSortChange(e) {
  wordListSortMode = e.target.value;
  renderWordList();
}

// Sorts a COPY of the words array — Storage.getWords already returns a
// fresh array each call, but .slice() here makes that non-mutation
// explicit rather than relying on that. "newest" sorts by createdAt
// descending (falling back to array order for any very old record that
// somehow lacks it); the two alphabetical modes use localeCompare so
// accented characters (á, é...) and, for Japanese, furigana/kana sort
// sensibly rather than by raw char code.
function sortedWordsForDisplay(words) {
  const sorted = words.slice();
  if (wordListSortMode === "target-az") {
    sorted.sort((a, b) => (a.targetLang || "").localeCompare(b.targetLang || ""));
  } else if (wordListSortMode === "english-az") {
    sorted.sort((a, b) => (a.english || "").localeCompare(b.english || ""));
  } else {
    sorted.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  return sorted;
}

function renderWordList() {
  if (!activeTheme) return;
  const list = document.getElementById("word-list");
  if (!list) return;
  renderThemeList(); // keep each theme's word-count badge in sync (no-op if not on this page)
  const words = sortedWordsForDisplay(Storage.getWords(activeTheme.id));
  list.innerHTML = "";

  // Drop any selected id that's no longer in this list (deleted, or
  // moved out to another theme by a previous bulk action).
  const currentIds = new Set(words.map((w) => w.id));
  Array.from(selectedWordIds).forEach((id) => {
    if (!currentIds.has(id)) selectedWordIds.delete(id);
  });

  if (words.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-hint";
    li.textContent = "No words yet — add one above.";
    li.dataset.immersionKey = "noWordsYetText";
    list.appendChild(li);
    updateWordBulkBar();
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

    if (word.infinitive) {
      const infinitive = document.createElement("span");
      infinitive.className = "word-infinitive";
      infinitive.textContent = `dictionary form: ${word.infinitive}`;
      main.appendChild(infinitive);
    }

    if (word.exampleSentence) {
      const example = document.createElement("span");
      example.className = "word-example";
      example.textContent = `e.g. ${word.exampleSentence}`;
      main.appendChild(example);
    }

    // AI-generated example sentences (from the Reading bubble's "Generate
    // 3 examples" box) — kept separate from the single manually-typed
    // exampleSentence above rather than merging them, since these come as
    // a matched pair of target-language text + English translation.
    if (Array.isArray(word.exampleSentences) && word.exampleSentences.length > 0) {
      const examplesWrap = document.createElement("div");
      examplesWrap.className = "word-ai-examples";
      word.exampleSentences.forEach((ex) => {
        const exLine = document.createElement("span");
        exLine.className = "word-example";
        exLine.textContent = ex.translation ? `e.g. ${ex.text} — ${ex.translation}` : `e.g. ${ex.text}`;
        examplesWrap.appendChild(exLine);
      });
      main.appendChild(examplesWrap);
    }

    const leftWrap = document.createElement("div");
    leftWrap.className = "word-left";

    if (word.id !== movingWordId) {
      const selectCheckbox = document.createElement("input");
      selectCheckbox.type = "checkbox";
      selectCheckbox.className = "word-select-checkbox";
      selectCheckbox.dataset.wordId = word.id;
      selectCheckbox.checked = selectedWordIds.has(word.id);
      selectCheckbox.setAttribute("aria-label", "Select word");
      selectCheckbox.addEventListener("change", () => {
        if (selectCheckbox.checked) selectedWordIds.add(word.id);
        else selectedWordIds.delete(word.id);
        updateWordBulkBar();
      });
      leftWrap.appendChild(selectCheckbox);
    }

    leftWrap.appendChild(main);
    li.appendChild(leftWrap);

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

  updateWordBulkBar();
}

// ---------------------------------------------------------------------
// Bulk move/copy — "Move selected"/"Copy selected" bar above the word
// list. Complements the per-word Move/Copy panel (below) for filing (or
// merging) several words into another theme of the same language at
// once, using the same destination-select + duplicate-checking helpers.
// ---------------------------------------------------------------------

function updateWordBulkBar() {
  const bar = document.getElementById("word-list-bulk-bar");
  if (!bar) return;
  const checkboxes = document.querySelectorAll("#word-list .word-select-checkbox");

  if (checkboxes.length === 0) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;

  const countEl = document.getElementById("word-bulk-selected-count");
  if (countEl) countEl.textContent = selectedWordIds.size ? `${selectedWordIds.size} selected` : "";

  const selectAllCheckbox = document.getElementById("word-select-all-checkbox");
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = selectedWordIds.size > 0 && selectedWordIds.size === checkboxes.length;
    selectAllCheckbox.indeterminate = selectedWordIds.size > 0 && selectedWordIds.size < checkboxes.length;
  }

  const themeSelect = document.getElementById("word-bulk-theme-select");
  if (themeSelect && activeTheme) {
    const previousValue = themeSelect.value;
    renderMoveThemeOptions(themeSelect, previousValue || undefined);
  }

  const moveBtn = document.getElementById("word-bulk-move-btn");
  const copyBtn = document.getElementById("word-bulk-copy-btn");
  if (moveBtn) moveBtn.disabled = selectedWordIds.size === 0;
  if (copyBtn) copyBtn.disabled = selectedWordIds.size === 0;
}

function handleWordSelectAllChange(e) {
  const checked = e.target.checked;
  document.querySelectorAll("#word-list .word-select-checkbox").forEach((cb) => {
    cb.checked = checked;
    if (checked) selectedWordIds.add(cb.dataset.wordId);
    else selectedWordIds.delete(cb.dataset.wordId);
  });
  updateWordBulkBar();
}

function showWordBulkStatus(text) {
  const statusEl = document.getElementById("word-bulk-status");
  if (!statusEl) return;
  statusEl.hidden = false;
  statusEl.textContent = text;
}

function handleWordBulkMove() {
  if (selectedWordIds.size === 0) {
    alert("Select at least one word first.");
    return;
  }
  const select = document.getElementById("word-bulk-theme-select");
  const targetThemeId = resolveMoveDestinationThemeId(select);
  if (!targetThemeId) return;

  let moved = 0;
  let skipped = 0;
  Array.from(selectedWordIds).forEach((wordId) => {
    const result = Storage.moveWordToTheme(wordId, targetThemeId);
    if (result.success) {
      moved++;
      selectedWordIds.delete(wordId);
    } else {
      skipped++;
    }
  });

  const destTheme = Storage.getTheme(targetThemeId);
  const destName = destTheme ? destTheme.name : "that theme";
  let statusText = `Moved ${moved} word${moved === 1 ? "" : "s"} to "${destName}".`;
  if (skipped) statusText += ` ${skipped} left behind (already in "${destName}").`;
  showWordBulkStatus(statusText);

  renderWordList();
}

function handleWordBulkCopy() {
  if (selectedWordIds.size === 0) {
    alert("Select at least one word first.");
    return;
  }
  const select = document.getElementById("word-bulk-theme-select");
  const targetThemeId = resolveMoveDestinationThemeId(select);
  if (!targetThemeId) return;

  let copied = 0;
  let skipped = 0;
  Array.from(selectedWordIds).forEach((wordId) => {
    const result = Storage.copyWordToTheme(wordId, targetThemeId);
    if (result.success) {
      copied++;
    } else {
      skipped++;
    }
  });

  const destTheme = Storage.getTheme(targetThemeId);
  const destName = destTheme ? destTheme.name : "that theme";
  let statusText = `Copied ${copied} word${copied === 1 ? "" : "s"} to "${destName}".`;
  if (skipped) statusText += ` ${skipped} skipped (already in "${destName}").`;
  showWordBulkStatus(statusText);

  renderWordList();
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

  // Manual verb classification. Normally this only ever gets set
  // automatically, as a side effect of leaving one side blank and
  // triggering a dictionary lookup that identifies the word as a verb
  // (see pendingVerbInfo above) — a word typed in on both sides by hand
  // (including anything saved through a sentence test's "+ Add vocab"
  // drawer, which never does a lookup at all) never gets classified,
  // and until now there was no way to fix that after the fact. This is
  // what feeds "pull verbs from your saved themes" on the Conjugation
  // Test / sentence-test config screens — without it, a real verb saved
  // by hand is silently invisible to that feature.
  if (activeTheme && (activeTheme.language === "es" || activeTheme.language === "fr" || activeTheme.language === "ja")) {
    const verbFieldWrap = document.createElement("div");
    verbFieldWrap.className = "edit-verb-field";

    const verbLabel = document.createElement("label");
    const verbCheckbox = document.createElement("input");
    verbCheckbox.type = "checkbox";
    verbCheckbox.className = "edit-is-verb-checkbox";
    verbCheckbox.checked = word.partOfSpeech === "verb";
    verbLabel.appendChild(verbCheckbox);
    verbLabel.appendChild(document.createTextNode(" This is a verb"));
    verbFieldWrap.appendChild(verbLabel);

    const classOptions =
      activeTheme.language === "ja"
        ? [
            ["godan", "Godan (u-verb)"],
            ["ichidan", "Ichidan (ru-verb)"],
            ["irregular-suru", "Irregular (する)"],
            ["irregular-kuru", "Irregular (来る)"],
          ]
        : activeTheme.language === "fr"
        ? [
            ["er", "-er verb"],
            ["ir", "-ir verb"],
            ["re", "-re verb"],
            ["irregular", "Irregular"],
          ]
        : [
            ["ar", "-ar verb"],
            ["er", "-er verb"],
            ["ir", "-ir verb"],
            ["irregular", "Irregular"],
          ];

    const classSelect = document.createElement("select");
    classSelect.className = "edit-verb-class-select";
    classOptions.forEach(([value, label]) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      classSelect.appendChild(opt);
    });
    const currentClass = word.verbClass || word.verbType || classOptions[0][0];
    classSelect.value = currentClass;
    classSelect.hidden = !verbCheckbox.checked;
    verbFieldWrap.appendChild(classSelect);

    verbCheckbox.addEventListener("change", () => {
      classSelect.hidden = !verbCheckbox.checked;
    });

    wrapper.appendChild(verbFieldWrap);
  }

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

  const updates = { english, targetLang, furigana, exampleSentence };

  // Manual verb classification — see the field's own comment in
  // buildWordEditForm for why this exists. Unchecking "This is a verb"
  // explicitly clears the tagging (rather than leaving it untouched) so
  // a mistakenly-tagged word can be un-tagged too, not just tagged.
  const verbCheckbox = wrapper.querySelector(".edit-is-verb-checkbox");
  if (verbCheckbox) {
    const classSelect = wrapper.querySelector(".edit-verb-class-select");
    if (verbCheckbox.checked && classSelect) {
      updates.partOfSpeech = "verb";
      if (activeTheme.language === "ja") {
        updates.verbClass = classSelect.value;
        updates.verbType = null;
      } else {
        updates.verbType = classSelect.value;
        updates.verbClass = null;
      }
    } else {
      updates.partOfSpeech = null;
      updates.verbClass = null;
      updates.verbType = null;
    }
  }

  Storage.updateWord(wordId, updates);
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
