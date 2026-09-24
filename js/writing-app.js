/*
  writing-app.js
  --------------
  The Writing bubble: dated, private diary-style entries where you type
  the entry text itself, optionally linked to a Reading passage so you
  can pull that text up in a tab alongside the editor to reference
  while you write. One file drives both writing.html (the entry list)
  and writing-entry.html (view/edit a single entry) — each init
  function no-ops if this page doesn't have the element it needs.

  Writing an entry:
  - Wrap a word (or short phrase) you don't know in angle brackets,
    e.g. "<keys>" — the moment that bracket closes, the English text
    gets logged (no AI call, just local text parsing) into the
    per-language Helper Notebook backlog, deduped by word/phrase.
    Angle brackets were chosen over curly braces / square brackets
    because macOS's Japanese input method silently substitutes those
    for Japanese corner brackets (「」/『』) — angle brackets pass
    through as literal ASCII on every input source tested so far.
  - "Vocab check" is a separate, deliberate action: it looks up every
    remaining <word> still in the entry (via the same Claude-backed
    dictionary lookup the Vocab Bank uses), permanently swaps each
    bracket for the real target-language word, and marks those swapped
    words so they render in red every time the entry is viewed — an
    obvious, lasting flag for "this used to be a word you didn't know."
    It also enriches that word's Helper Notebook record with the
    looked-up translation (and, for Japanese, its reading) instead of
    creating a second entry.
  - A saved entry defaults to a read-only view (matching Main Hub's
    view/edit pattern) so the red highlighting has somewhere to live —
    a plain <textarea> can't color part of its own text. Edit switches
    back to the plain typing box.

  Grammar-level checking is a deliberately separate, future concern —
  Vocab check only ever touches bracketed placeholder words.

  Public/teacher-set entries are intentionally not built yet (see the
  "Coming soon" panel on writing.html) — isPublic on every entry is
  always false for now.
*/

const WRITING_LANGUAGE_NAMES = { es: "Spanish", ja: "Japanese", fr: "French" };
const WRITING_LANGUAGE_NAME_KEYS = { es: "langNameEs", ja: "langNameJa", fr: "langNameFr" };

// The learner's own language name ("日本語" instead of "Japanese") when
// immersion is on, otherwise the plain English name — for the handful
// of writing-entry strings that build a sentence around a language name
// (the "New ___ entry" heading, alerts, placeholders).
function displayLanguageName(langCode) {
  const fallback = WRITING_LANGUAGE_NAMES[langCode] || langCode;
  if (typeof t !== "function") return fallback;
  const key = WRITING_LANGUAGE_NAME_KEYS[langCode];
  return key ? t(key, fallback) : fallback;
}

const HELPER_NEW_THEME_VALUE = "__new_helper_theme__";
const WRITING_GRAMMAR_NEW_FOLDER_VALUE = "__new_writing_grammar_folder__";
let addingToVocabWordId = null;
// Which Grammar-check correction currently has its "Add to Grammar"
// folder-picker panel open (mirrors addingToVocabWordId's pattern).
let addingToGrammarNoteId = null;
// A free-form personal note/question per Helper Notebook word ("why is
// this the right one", a usage question, a reminder) — the field a
// future teacher-added-notes feature would slot into, same idea as
// addedToVocab tracking who's already handled a word.
let editingHelperNoteWordId = null;
// Sentence-by-sentence Grammar check (v2): whether the "Show
// corrections" panel is currently open, and which sentence (if any)
// has its "+ Add note" form open right now — both reset to their
// defaults whenever a fresh Grammar check overwrites the results.
let grammarCorrectionsRevealed = false;
let addingNoteForSentenceId = null;
let mistakesPracticeMode = null; // "flashcards" | "test" | null
let mistakesPracticeCards = [];
let mistakesPracticeIndex = 0;
let mistakesFlashcardFlipped = false;
// Which saved Mistakes note (by id) is currently expanded to show its
// full target-translation + explanation, inline under the sentence it
// came from — mirrors addingNoteForSentenceId's single-open pattern.
let viewingSavedNoteId = null;
// Accepts both half-width ASCII angle brackets (< >) and full-width
// Japanese ones (＜ ＞) as equivalent delimiters — Japanese input
// sources sometimes produce the full-width form instead of ASCII
// depending on punctuation settings, so both need to work.
const BRACKET_PATTERN = /[<＜]([^<>＜＞]+)[>＞]/g;

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function countWords(text) {
  const trimmed = (text || "").trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Every unique <word or phrase> in text, in first-seen order, trimmed,
// deduped case-insensitively.
function extractBracketWords(text) {
  const matches = [...(text || "").matchAll(BRACKET_PATTERN)];
  const seen = new Set();
  const words = [];
  matches.forEach((m) => {
    const word = m[1].trim();
    if (!word) return;
    const key = word.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    words.push(word);
  });
  return words;
}

document.addEventListener("DOMContentLoaded", () => {
  initWritingListPage();
  initWritingEntryPage();
  initMistakesPage();
});

// ---------------------------------------------------------------------
// writing.html — the entry list
// ---------------------------------------------------------------------

function initWritingListPage() {
  const list = document.getElementById("entry-list");
  if (!list) return; // not this page

  const langParam = getQueryParam("lang");
  const lang = SUPPORTED_LANGUAGES.includes(langParam) ? langParam : null;

  if (lang) {
    // The H1 stays the generic "Entries" — which language you're in is
    // shown by the topbar's language label + "WRITING" section label
    // instead (see the redesigned pagehead), matching the mockup.
    const backLink = document.getElementById("writing-back-link");
    if (backLink) backLink.href = `language-home.html?lang=${lang}`;
    const header = document.getElementById("writing-header");
    if (header) header.classList.add(`lang-${lang}`);
    document.body.classList.add(`lang-${lang}`);
    const newEntryLink = document.getElementById("new-entry-link");
    if (newEntryLink) newEntryLink.href = `writing-entry.html?lang=${lang}`;
    const mistakesLink = document.getElementById("mistakes-link");
    if (mistakesLink) mistakesLink.href = `mistakes.html?lang=${lang}`;
  }

  renderEntryList(lang);
  initTopbar(lang);
  if (typeof initHubTasks === "function") initHubTasks(lang);
  if (lang) {
    initAppTabs({
      section: "writing",
      language: lang,
      label: `${WRITING_LANGUAGE_NAMES[lang]} Writing`,
      href: `writing.html?lang=${lang}`,
    });
  } else {
    initAppTabs(null);
  }
}

const ENTRY_DATE_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

// entry.date is stored as a plain "YYYY-MM-DD" (from <input type=date>) —
// formatted by hand rather than via toLocaleDateString so the "12 SEP
// 2026" shape matches the mockup regardless of the browser's locale.
function formatEntryDate(dateStr) {
  const parts = (dateStr || "").split("-");
  if (parts.length !== 3) return dateStr || "";
  const [y, m, d] = parts;
  const month = ENTRY_DATE_MONTHS[parseInt(m, 10) - 1] || m;
  return `${parseInt(d, 10)} ${month} ${y}`;
}

// A short plain-text preview of the entry, collapsed to one line —
// there's no stored "excerpt" field, so this is derived from the live
// text the same way the word count already is.
function entrySnippet(text) {
  const collapsed = (text || "").replace(/\s+/g, " ").trim();
  if (!collapsed) return "";
  return collapsed.length > 140 ? `${collapsed.slice(0, 140).trim()}…` : collapsed;
}

// "Checked" means this entry has been through Vocab check and/or
// Grammar check at least once (correctedWords/grammarCorrectedWords
// non-empty) — not that every bracketed word is resolved, since new
// <brackets> can be added after a check. "Draft" is anything that
// hasn't been checked yet at all.
function isEntryChecked(entry) {
  return !!((entry.correctedWords && entry.correctedWords.length) || (entry.grammarCorrectedWords && entry.grammarCorrectedWords.length));
}

function renderEntryList(lang) {
  const list = document.getElementById("entry-list");
  if (!list) return;

  const entries = (lang ? Storage.getWritingEntries(lang) : Storage.getWritingEntries())
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.createdAt - a.createdAt);

  list.innerHTML = "";

  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "page-sub";
    empty.textContent = lang
      ? `No ${WRITING_LANGUAGE_NAMES[lang]} entries yet — write your first one above.`
      : "No entries yet — write your first one above.";
    list.appendChild(empty);
    return;
  }

  entries.forEach((entry) => {
    const card = document.createElement("a");
    card.className = "card card-lift entry-card";
    card.href = `writing-entry.html?id=${encodeURIComponent(entry.id)}`;

    const top = document.createElement("div");
    top.className = "entry-card-top";
    const dateChip = document.createElement("span");
    dateChip.className = "chip";
    dateChip.textContent = formatEntryDate(entry.date);
    top.appendChild(dateChip);
    const statusPill = document.createElement("span");
    const checked = isEntryChecked(entry);
    statusPill.className = checked ? "pill-tag" : "pill-tag pill-tag-outline";
    statusPill.textContent = checked ? "CHECKED" : "DRAFT";
    top.appendChild(statusPill);
    card.appendChild(top);

    const titleEl = document.createElement("h3");
    titleEl.className = "card-title";
    titleEl.style.marginTop = "12px";
    titleEl.textContent = entry.title || "Untitled entry";
    card.appendChild(titleEl);

    const snippet = entrySnippet(entry.text);
    if (snippet) {
      const snippetEl = document.createElement("p");
      snippetEl.className = "card-text";
      snippetEl.textContent = snippet;
      card.appendChild(snippetEl);
    }

    const stats = document.createElement("div");
    stats.className = "entry-card-stats";

    const wordsEl = document.createElement("span");
    wordsEl.textContent = `${countWords(entry.text)} words`;
    stats.appendChild(wordsEl);

    const bracketedCount = extractBracketWords(entry.text).length;
    const bracketedEl = document.createElement("span");
    bracketedEl.textContent = bracketedCount === 0 ? "None left" : `${bracketedCount} bracketed`;
    stats.appendChild(bracketedEl);

    const linkEl = document.createElement("span");
    linkEl.textContent = entry.linkedPassageId && Storage.getPassage(entry.linkedPassageId) ? "Linked passage" : "No link";
    stats.appendChild(linkEl);

    card.appendChild(stats);
    list.appendChild(card);
  });
}

// ---------------------------------------------------------------------
// writing-entry.html — view/edit a single entry
// ---------------------------------------------------------------------

let activeEntryLang = null;
let activeEntryId = null;
let entryPersisted = false;
let openReadingTabIds = [];
let activeReadingTabId = null;

// A pseudo-passage id: opens the Storage Locker as another reference tab
// alongside real reading passages, rather than a separate mechanism.
const LOCKER_TAB_ID = "__storage-locker__";

function getLockerPseudoPassage() {
  return { language: activeEntryLang, title: t("storageLockerTabLabel", "Storage Locker") };
}

// ---- Autosave (edit mode) ----
// Tabs are real page navigations (app-tabs.js), so anything only held in
// the textarea would otherwise vanish the moment you switch to another
// tab. Autosave writes edit-mode changes to Storage a beat after you
// stop typing, so there's nothing left to lose — the manual "Save
// entry" button still exists for flipping into View mode on purpose.
let autosaveTimer = null;
let autosaveDirty = false;
const AUTOSAVE_DELAY_MS = 700;

function initWritingEntryPage() {
  const form = document.getElementById("entry-details-form");
  if (!form) return; // not this page

  const idParam = getQueryParam("id");
  const langParam = getQueryParam("lang");

  const titleInput = document.getElementById("entry-title");
  const dateInput = document.getElementById("entry-date");
  const linkSelect = document.getElementById("entry-link-select");
  const textInput = document.getElementById("entry-text");

  const existingEntry = idParam ? Storage.getWritingEntry(idParam) : null;

  if (existingEntry) {
    activeEntryId = existingEntry.id;
    activeEntryLang = existingEntry.language;
    entryPersisted = true;
    // A Grammar check already run on this entry is stored on it and
    // stays there across visits — open it by default rather than
    // making the learner click "Show corrections" again just to
    // rediscover work that was already saved.
    const existingCheck = existingEntry.grammarSentenceCheck;
    if (
      existingCheck &&
      Array.isArray(existingCheck.sentences) &&
      existingCheck.sentences.some((s) => s.hasMistake)
    ) {
      grammarCorrectionsRevealed = true;
    }
  } else {
    activeEntryLang = SUPPORTED_LANGUAGES.includes(langParam) ? langParam : "es";
    activeEntryId = Storage.uid();
    entryPersisted = false;
  }

  const header = document.getElementById("entry-header");
  if (header) header.classList.add(`lang-${activeEntryLang}`);
  const backLink = document.getElementById("entry-back-link");
  if (backLink) backLink.href = `writing.html?lang=${activeEntryLang}`;
  initTopbar(activeEntryLang);
  if (typeof initHubTasks === "function") initHubTasks(activeEntryLang);
  syncWritingEntryAppTab(existingEntry);

  renderLinkSelectOptions(linkSelect, existingEntry ? existingEntry.linkedPassageId : null);

  if (existingEntry && existingEntry.linkedPassageId && Storage.getPassage(existingEntry.linkedPassageId)) {
    openReadingTab(existingEntry.linkedPassageId);
  }

  // Catch up the Helper Notebook with any brackets already saved on
  // this entry (covers entries saved before a page reload, etc.).
  if (existingEntry) syncHelperWordsFromText(existingEntry.text || "", existingEntry.title);
  renderHelperWordsPanel(activeEntryLang);
  initWritingHelperNotes(activeEntryLang);

  if (existingEntry) {
    showViewMode();
  } else {
    dateInput.value = todayStr();
    showEditMode();
  }

  form.addEventListener("submit", handleEntryDetailsSubmit);
  if (textInput) {
    textInput.addEventListener("input", () => {
      updateWordCount();
      syncHelperWordsFromText(textInput.value, titleInput.value);
      scheduleAutosave();
    });
  }
  if (titleInput) titleInput.addEventListener("input", scheduleAutosave);
  if (dateInput) dateInput.addEventListener("change", scheduleAutosave);
  if (linkSelect) linkSelect.addEventListener("change", scheduleAutosave);

  // Catches every way this page can go away — clicking another tab,
  // clicking Home/a bubble, closing the browser tab — and makes sure a
  // pending autosave actually lands instead of getting cut off mid-debounce.
  window.addEventListener("pagehide", flushAutosave);
  window.addEventListener("beforeunload", flushAutosave);

  // Lets app-tabs.js ask "does this page have unsaved edits right now?"
  // and "save them" before it closes this page's own tab (see
  // closeAppTab in app-tabs.js).
  window.appTabDirtyCheck = () => {
    const editPanel = document.getElementById("entry-details-panel");
    return !!(editPanel && !editPanel.hidden && autosaveDirty);
  };
  window.appTabDirtySave = flushAutosave;

  const editBtn = document.getElementById("edit-entry-btn");
  if (editBtn) editBtn.addEventListener("click", handleEditClick);
  const cancelBtn = document.getElementById("cancel-edit-btn");
  if (cancelBtn) cancelBtn.addEventListener("click", handleCancelEdit);
  const underlineBtn = document.getElementById("underline-selection-btn");
  if (underlineBtn) underlineBtn.addEventListener("click", handleToggleUnderlineSelection);
  const vocabCheckBtn = document.getElementById("vocab-check-btn");
  if (vocabCheckBtn) vocabCheckBtn.addEventListener("click", handleVocabCheckClick);
  const grammarCheckBtn = document.getElementById("grammar-check-btn");
  if (grammarCheckBtn) grammarCheckBtn.addEventListener("click", handleGrammarCheckClick);
  const showCorrectionsBtn = document.getElementById("show-corrections-btn");
  if (showCorrectionsBtn) showCorrectionsBtn.addEventListener("click", handleShowCorrectionsToggle);
  const deleteEntryBtn = document.getElementById("delete-entry-btn");
  if (deleteEntryBtn) deleteEntryBtn.addEventListener("click", handleDeleteEntry);
  const tabPlusBtn = document.getElementById("entry-tab-plus");
  if (tabPlusBtn) tabPlusBtn.addEventListener("click", handleEntryTabPlusClick);
  const tabPicker = document.getElementById("entry-tab-picker");
  if (tabPicker) tabPicker.addEventListener("change", handleEntryTabPickerChange);
  const helperList = document.getElementById("helper-notebook-list");
  if (helperList) helperList.addEventListener("click", handleHelperNotebookListClick);
  const grammarNotesList = document.getElementById("grammar-notes-list");
  if (grammarNotesList) grammarNotesList.addEventListener("click", handleGrammarNotesListClick);
  const grammarSentenceCheckList = document.getElementById("grammar-sentence-check-list");
  if (grammarSentenceCheckList) grammarSentenceCheckList.addEventListener("click", handleGrammarSentenceCheckListClick);
  const viewEntryText = document.getElementById("view-entry-text");
  if (viewEntryText) viewEntryText.addEventListener("click", handleViewEntryTextClick);
}

// Clicking a red (Vocab-check-corrected) word in View mode jumps down to
// that word's Helper Notebook entry instead of making you scan the list
// for it — matched by the resolved target word, since that's what's
// actually rendered red (not the original bracketed English).
function handleViewEntryTextClick(e) {
  if (!e.target.classList || !e.target.classList.contains("corrected-word")) return;

  const targetWord = e.target.textContent;
  const match = Storage.getHelperWords(activeEntryLang).find((w) => w.targetWord === targetWord);
  if (!match) return;

  const li = document.getElementById(`helper-word-${match.id}`);
  if (!li) return;

  li.scrollIntoView({ behavior: "smooth", block: "center" });
  li.classList.add("helper-word-flash");
  setTimeout(() => li.classList.remove("helper-word-flash"), 1500);
}

// ---- View / Edit mode ----

// Entries written before the vocab/grammar color split and the Add-to-
// Grammar feature existed have two problems: their grammarNotes lack an
// `id` (so the "Add to Grammar" button has nothing to key off and never
// renders), and any grammar-check corrections they made landed in the
// old shared correctedWords list instead of grammarCorrectedWords (so
// they render red/vocab-colored instead of blue/grammar-colored).
// grammarNotes already records exactly which phrases came from a
// grammar check, so it's used here as the source of truth to backfill
// ids and re-bucket those phrases — run once per view, silently, and
// persisted so it only ever needs to happen the one time per entry.
function healLegacyGrammarData(entry) {
  if (!entry || !Array.isArray(entry.grammarNotes) || entry.grammarNotes.length === 0) {
    return entry;
  }

  let changed = false;

  const healedNotes = entry.grammarNotes.map((note) => {
    if (note.id) return note;
    changed = true;
    return { id: Storage.uid(), addedToGrammar: false, addedGrammarThemeId: null, ...note };
  });

  const correctedWords = Array.isArray(entry.correctedWords) ? entry.correctedWords.slice() : [];
  const grammarCorrectedWords = Array.isArray(entry.grammarCorrectedWords)
    ? entry.grammarCorrectedWords.slice()
    : [];
  const grammarSet = new Set(grammarCorrectedWords);

  healedNotes.forEach((note) => {
    if (!note.corrected) return;
    const idxInVocab = correctedWords.indexOf(note.corrected);
    if (idxInVocab !== -1) {
      correctedWords.splice(idxInVocab, 1);
      changed = true;
    }
    if (!grammarSet.has(note.corrected)) {
      grammarSet.add(note.corrected);
      grammarCorrectedWords.push(note.corrected);
      changed = true;
    }
  });

  if (!changed) return entry;

  return Storage.updateWritingEntry(entry.id, {
    grammarNotes: healedNotes,
    correctedWords,
    grammarCorrectedWords,
  });
}

function showViewMode() {
  let entry = Storage.getWritingEntry(activeEntryId);
  if (!entry) return;
  entry = healLegacyGrammarData(entry) || entry;

  const viewWrap = document.getElementById("entry-view-wrap");
  const editPanel = document.getElementById("entry-details-panel");
  if (viewWrap) viewWrap.hidden = false;
  if (editPanel) editPanel.hidden = true;

  const heading = document.getElementById("entry-heading");
  if (heading) {
    if (entry.title) {
      heading.textContent = entry.title;
      delete heading.dataset.immersionKey;
    } else {
      heading.textContent = "Untitled entry";
      heading.dataset.immersionKey = "untitledEntryText";
      retranslateImmersionElement(heading);
    }
  }

  const dateBadge = document.getElementById("view-entry-date");
  if (dateBadge) dateBadge.textContent = entry.date || "";

  const linkedBadge = document.getElementById("view-entry-linked-badge");
  if (linkedBadge) {
    const passage = entry.linkedPassageId ? Storage.getPassage(entry.linkedPassageId) : null;
    if (passage) {
      linkedBadge.hidden = false;
      linkedBadge.className = `lang-badge lang-badge-${entry.language}`;
      linkedBadge.textContent = `Linked: ${passage.title}`;
      linkedBadge.dataset.immersionKey = "linkedBadgePrefix";
      linkedBadge.dataset.immersionVars = JSON.stringify({ title: passage.title });
      retranslateImmersionElement(linkedBadge);
    } else {
      linkedBadge.hidden = true;
    }
  }

  const textBox = document.getElementById("view-entry-text");
  if (textBox)
    renderEntryTextInto(
      textBox,
      entry.text || "",
      entry.correctedWords || [],
      entry.grammarCorrectedWords || [],
      entry.underlinedPhrases || []
    );

  const status = document.getElementById("vocab-check-status");
  if (status) status.hidden = true;
  const grammarStatus = document.getElementById("grammar-check-status");
  if (grammarStatus) grammarStatus.hidden = true;

  renderGrammarComparePanel(entry);
  renderGrammarNotesPanel(entry);
  renderGrammarSentenceCheckPanel(entry);
}

function showEditMode() {
  const viewWrap = document.getElementById("entry-view-wrap");
  const editPanel = document.getElementById("entry-details-panel");
  if (viewWrap) viewWrap.hidden = true;
  if (editPanel) editPanel.hidden = false;

  const titleInput = document.getElementById("entry-title");
  const dateInput = document.getElementById("entry-date");
  const linkSelect = document.getElementById("entry-link-select");
  const textInput = document.getElementById("entry-text");
  const cancelBtn = document.getElementById("cancel-edit-btn");

  let entry = entryPersisted ? Storage.getWritingEntry(activeEntryId) : null;
  if (entry) entry = healLegacyGrammarData(entry) || entry;
  const referenceWrap = document.getElementById("edit-reference-wrap");

  if (entry) {
    // Edit mode always opens onto the most up-to-date saved text
    // (including anything Vocab check has already fixed) — that's just
    // entry.text, same source view mode reads from.
    titleInput.value = entry.title || "";
    dateInput.value = entry.date || todayStr();
    textInput.value = entry.text || "";
    renderLinkSelectOptions(linkSelect, entry.linkedPassageId);
    if (cancelBtn) cancelBtn.hidden = false;

    // A <textarea> can't color part of its own text, so these two
    // read-only reference panels sit alongside the editable box: the
    // very original as first written, and the current version with any
    // Vocab-check corrections still visible in red.
    if (referenceWrap) {
      referenceWrap.hidden = false;
      const originalBox = document.getElementById("edit-original-text");
      if (originalBox) {
        originalBox.textContent = entry.originalText || entry.text || "(nothing recorded yet)";
      }
      const correctedBox = document.getElementById("edit-corrected-text");
      if (correctedBox) renderEntryTextInto(correctedBox, entry.text || "", entry.correctedWords || [], entry.grammarCorrectedWords || []);
    }
  } else {
    if (!dateInput.value) dateInput.value = todayStr();
    if (cancelBtn) cancelBtn.hidden = true; // nothing saved to go back to yet
    if (referenceWrap) referenceWrap.hidden = true; // nothing to reference yet
  }

  const heading = document.getElementById("entry-heading");
  if (heading) {
    if (entry && entry.title) {
      heading.textContent = entry.title;
      delete heading.dataset.immersionKey;
      delete heading.dataset.immersionVars;
    } else if (entry) {
      heading.textContent = "Untitled entry";
      heading.dataset.immersionKey = "untitledEntryText";
      delete heading.dataset.immersionVars;
      retranslateImmersionElement(heading);
    } else {
      const langName = displayLanguageName(activeEntryLang);
      heading.textContent = `New ${langName} entry`;
      heading.dataset.immersionKey = "newEntryHeadingTemplate";
      heading.dataset.immersionVars = JSON.stringify({ lang: langName });
      retranslateImmersionElement(heading);
    }
  }

  // Freshly (re)entering edit mode always starts from what's actually
  // saved, so there's nothing pending yet.
  cancelPendingAutosave();
  updateAutosaveStatus(entry ? "All changes saved" : "", entry ? "allChangesSavedStatus" : null);

  updateWordCount();
}

function handleEditClick() {
  showEditMode();
}

function handleCancelEdit() {
  cancelPendingAutosave();
  if (entryPersisted) {
    showViewMode();
  } else {
    window.location.href = `writing.html?lang=${activeEntryLang}`;
  }
}

// ---- Autosave ----

function scheduleAutosave() {
  autosaveDirty = true;
  updateAutosaveStatus("Unsaved changes…", "unsavedChangesStatus");
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(performAutosave, AUTOSAVE_DELAY_MS);
}

// Cancels a pending debounce without writing it — used when leaving
// edit mode through a path that already handles the save itself (a
// manual "Save entry" submit) or deliberately discards it (Cancel).
function cancelPendingAutosave() {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
  autosaveDirty = false;
}

// Forces any pending autosave to land right now, synchronously — called
// on pagehide/beforeunload (leaving the page any way at all) and from
// app-tabs.js right before it closes this page's own tab.
function flushAutosave() {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
  if (autosaveDirty) performAutosave();
  pendingHelperNoteFlushes.forEach((flush) => flush());
}

function performAutosave() {
  autosaveTimer = null;
  const editPanel = document.getElementById("entry-details-panel");
  if (!editPanel || editPanel.hidden) {
    autosaveDirty = false;
    return; // not actively editing — nothing to autosave
  }

  const titleInput = document.getElementById("entry-title");
  const dateInput = document.getElementById("entry-date");
  const linkSelect = document.getElementById("entry-link-select");
  const textInput = document.getElementById("entry-text");
  if (!titleInput || !textInput) {
    autosaveDirty = false;
    return;
  }

  const title = titleInput.value.trim();
  const date = dateInput.value || todayStr();
  const linkedPassageId = linkSelect.value || null;
  const text = textInput.value;

  // A brand-new, completely untouched entry isn't worth persisting yet —
  // there's nothing in it to lose.
  if (!entryPersisted && !title && !text.trim()) {
    autosaveDirty = false;
    updateAutosaveStatus("");
    return;
  }

  if (!entryPersisted) {
    Storage.addWritingEntry({
      id: activeEntryId,
      title,
      date,
      language: activeEntryLang,
      linkedPassageId,
      text,
      correctedWords: [],
      grammarCorrectedWords: [],
    });
    entryPersisted = true;
  } else {
    Storage.updateWritingEntry(activeEntryId, { title, date, linkedPassageId, text });
  }

  autosaveDirty = false;
  updateAutosaveStatus("Saved", "autosaveSavedStatus");
  syncWritingEntryAppTab(Storage.getWritingEntry(activeEntryId));
}

// `key` is the matching IMMERSION_STRINGS entry for `text`, when there
// is one — pass null/omit for the empty-string "nothing to show" case.
function updateAutosaveStatus(text, key) {
  const el = document.getElementById("entry-autosave-status");
  if (!el) return;
  el.textContent = text;
  if (key) {
    el.dataset.immersionKey = key;
    retranslateImmersionElement(el);
  } else {
    delete el.dataset.immersionKey;
    delete el.dataset.immersionOriginal;
  }
}

// Deliberately counts unresolved bracketed words/phrases, not total
// words — a whitespace word count is meaningless for Japanese (which
// doesn't use spaces between words), and this is the number people
// actually care about here: how much is still left to Vocab check.
function updateWordCount() {
  const textInput = document.getElementById("entry-text");
  const countEl = document.getElementById("entry-word-count");
  if (!countEl) return;
  const n = extractBracketWords(textInput ? textInput.value : "").length;
  delete countEl.dataset.immersionVars;
  if (n === 0) {
    countEl.textContent = "No unknown words in this entry yet.";
    countEl.dataset.immersionKey = "noUnknownWordsCountText";
  } else if (n === 1) {
    countEl.textContent = "1 unknown word in this entry.";
    countEl.dataset.immersionKey = "oneUnknownWordCountText";
  } else {
    countEl.textContent = `${n} unknown words in this entry.`;
    countEl.dataset.immersionKey = "unknownWordsCountText";
    countEl.dataset.immersionVars = JSON.stringify({ n });
  }
  retranslateImmersionElement(countEl);
}

function renderLinkSelectOptions(select, selectedId) {
  if (!select) return;
  select.innerHTML = '<option value="" data-immersion-key="noLinkOption">No link</option>';
  Storage.getPassages()
    .filter((p) => p.language === activeEntryLang)
    .forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.title;
      if (p.id === selectedId) opt.selected = true;
      select.appendChild(opt);
    });
}

function handleEntryDetailsSubmit(e) {
  e.preventDefault();
  const titleInput = document.getElementById("entry-title");
  const dateInput = document.getElementById("entry-date");
  const linkSelect = document.getElementById("entry-link-select");
  const textInput = document.getElementById("entry-text");

  const title = titleInput.value.trim();
  if (!title) {
    alert(t("giveEntryTitleAlert", "Give the entry a title."));
    return;
  }
  const date = dateInput.value || todayStr();
  const linkedPassageId = linkSelect.value || null;
  const text = textInput ? textInput.value : "";

  syncHelperWordsFromText(text, title);

  if (!entryPersisted) {
    Storage.addWritingEntry({
      id: activeEntryId,
      title,
      date,
      language: activeEntryLang,
      linkedPassageId,
      text,
      correctedWords: [],
      grammarCorrectedWords: [],
    });
    entryPersisted = true;
  } else {
    Storage.updateWritingEntry(activeEntryId, { title, date, linkedPassageId, text });
  }

  if (linkedPassageId) openReadingTab(linkedPassageId);

  cancelPendingAutosave();
  renderHelperWordsPanel(activeEntryLang);
  showViewMode();
  syncWritingEntryAppTab(Storage.getWritingEntry(activeEntryId));
}

// ---- Helper Notebook: personal / teacher notes ----
// Reuses the same per-language notes as Main Hub's Helper Notebook
// panel (Storage.getHubNotesText/updateHubNotesText) rather than a
// separate per-entry copy — one standing pair of notes per language,
// editable from wherever you happen to be writing.

// Pending helper-note debounce timers, tracked so flushAutosave (already
// wired to pagehide/beforeunload for the entry itself) can also force
// these to land before the page goes away — same reasoning as the
// entry's own autosave: switching tabs shouldn't lose anything.
const pendingHelperNoteFlushes = [];

function initWritingHelperNotes(lang) {
  const personalInput = document.getElementById("helper-personal-note");
  const teacherInput = document.getElementById("helper-teacher-note");
  if (!personalInput || !teacherInput) return;

  const notes = Storage.getHubNotesText(lang);
  personalInput.value = notes.selfNote || "";
  teacherInput.value = notes.teacherNote || "";

  wireHelperNoteAutosave(personalInput, "selfNote", "helper-personal-note-status", lang);
  wireHelperNoteAutosave(teacherInput, "teacherNote", "helper-teacher-note-status", lang);
}

function wireHelperNoteAutosave(input, field, statusId, lang) {
  let timer = null;
  const statusEl = document.getElementById(statusId);

  const commit = () => {
    Storage.updateHubNotesText(lang, { [field]: input.value });
    if (statusEl) {
      statusEl.textContent = "Saved";
      statusEl.dataset.immersionKey = "autosaveSavedStatus";
    }
    timer = null;
  };

  input.addEventListener("input", () => {
    if (statusEl) {
      statusEl.textContent = "Unsaved changes…";
      statusEl.dataset.immersionKey = "unsavedChangesStatus";
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(commit, AUTOSAVE_DELAY_MS);
  });

  pendingHelperNoteFlushes.push(() => {
    if (timer) {
      clearTimeout(timer);
      commit();
    }
  });
}

// Pins writing-entry.html as an app tab once the entry is actually
// saved (a brand-new, not-yet-saved entry has nothing durable to point
// a tab at yet); keeps the tab's label in sync with the entry's title
// across saves/renames.
function syncWritingEntryAppTab(entry) {
  if (!entry) {
    initAppTabs(null);
    return;
  }
  initAppTabs({
    section: "writing",
    language: entry.language,
    label: entry.title || "Untitled entry",
    href: `writing-entry.html?id=${encodeURIComponent(entry.id)}`,
  });
}

function handleDeleteEntry() {
  if (!entryPersisted) {
    cancelPendingAutosave();
    window.location.href = `writing.html?lang=${activeEntryLang}`;
    return;
  }
  if (!confirm(t("deleteEntryConfirm", "Delete this entry? This can't be undone."))) return;
  cancelPendingAutosave(); // a pending autosave must not resurrect what we're about to delete
  Storage.deleteWritingEntry(activeEntryId);
  window.location.href = `writing.html?lang=${activeEntryLang}`;
}

// ---- Helper Notebook (bracket tracking) ----

function syncHelperWordsFromText(text, titleForContext) {
  extractBracketWords(text).forEach((word) => {
    Storage.addOrTouchHelperWord({
      language: activeEntryLang,
      english: word,
      sourceEntryId: activeEntryId,
      sourceEntryTitle: titleForContext || "",
    });
  });
  renderHelperWordsPanel(activeEntryLang);
}

// Words bracketed in THIS entry show in the order they actually appear
// in the text, top to bottom — closer to how you'd scan back through
// what you wrote looking for a specific one. originalText (frozen at
// creation, never touched by edits or Vocab check) is the primary
// source since a checked word's brackets are long gone from the live
// text; text itself is checked too, for anything bracketed since then
// that originalText wouldn't know about.
function buildEntryWordOrderMap(entry) {
  const orderMap = new Map();
  if (!entry) return orderMap;
  let idx = 0;
  [entry.originalText, entry.text].forEach((source) => {
    extractBracketWords(source || "").forEach((w) => {
      const key = w.toLowerCase();
      if (!orderMap.has(key)) orderMap.set(key, idx++);
    });
  });
  return orderMap;
}

function renderHelperWordsPanel(lang) {
  const list = document.getElementById("helper-notebook-list");
  if (!list) return;

  // The helper notebook is strictly per-entry: words bracketed in other
  // entries stay saved (Storage.getHelperWords keeps everything, per
  // language) but only ever surface again when that entry is reopened.
  const currentEntry = entryPersisted ? Storage.getWritingEntry(activeEntryId) : null;
  const orderMap = buildEntryWordOrderMap(currentEntry);

  const words = Storage.getHelperWords(lang)
    .filter((w) => w.sourceEntryId === activeEntryId)
    .slice()
    .sort((a, b) => {
      const aIdx = orderMap.has(a.english.toLowerCase()) ? orderMap.get(a.english.toLowerCase()) : Infinity;
      const bIdx = orderMap.has(b.english.toLowerCase()) ? orderMap.get(b.english.toLowerCase()) : Infinity;
      if (aIdx !== bIdx) return aIdx - bIdx;
      return (b.lastSeenAt || b.createdAt || 0) - (a.lastSeenAt || a.createdAt || 0);
    });

  list.innerHTML = "";

  if (words.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-hint";
    li.textContent = "No unknown words yet — bracket one like <word> in your writing.";
    li.dataset.immersionKey = "noUnknownWordsHelperHint";
    list.appendChild(li);
    return;
  }

  words.forEach((w) => {
    const li = document.createElement("li");
    li.className = "word-item helper-word-item";
    li.id = `helper-word-${w.id}`;

    if (w.id === addingToVocabWordId) {
      li.appendChild(buildAddToVocabPanel(w));
      list.appendChild(li);
      return;
    }

    const info = document.createElement("div");
    info.className = "helper-word-info";

    const englishEl = document.createElement("span");
    englishEl.className = "word-label";
    englishEl.textContent = w.english;
    info.appendChild(englishEl);

    if (w.checked && w.targetWord) {
      const targetEl = document.createElement("span");
      targetEl.className = "helper-word-target";
      targetEl.textContent = w.targetWord;
      info.appendChild(targetEl);

      if (w.furigana) {
        const furiganaEl = document.createElement("span");
        furiganaEl.className = "helper-word-furigana";
        furiganaEl.textContent = w.furigana;
        info.appendChild(furiganaEl);
      }
    } else {
      const pendingEl = document.createElement("span");
      pendingEl.className = "helper-word-pending";
      pendingEl.textContent = "not checked yet";
      pendingEl.dataset.immersionKey = "notCheckedYetHint";
      info.appendChild(pendingEl);
    }

    li.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "helper-word-actions";

    if (w.addedToVocab) {
      const theme = w.addedThemeId ? Storage.getTheme(w.addedThemeId) : null;
      const addedEl = document.createElement("span");
      addedEl.className = "helper-word-added";
      if (theme) {
        addedEl.textContent = `✓ Added to — ${theme.name}`;
        addedEl.dataset.immersionKey = "addedToVocabWithThemeText";
        addedEl.dataset.immersionVars = JSON.stringify({ theme: theme.name });
      } else {
        addedEl.textContent = "✓ Added to Vocab";
        addedEl.dataset.immersionKey = "addedToVocabDefaultText";
      }
      actions.appendChild(addedEl);
    } else {
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "secondary add-to-vocab-btn";
      addBtn.textContent = "Add to Vocab";
      addBtn.dataset.immersionKey = "addToVocabButton";
      addBtn.dataset.wordId = w.id;
      actions.appendChild(addBtn);
    }

    if (!w.notes && w.id !== editingHelperNoteWordId) {
      const addNoteBtn = document.createElement("button");
      addNoteBtn.type = "button";
      addNoteBtn.className = "secondary add-helper-note-btn";
      addNoteBtn.textContent = "+ Note";
      addNoteBtn.dataset.immersionKey = "addNotePlusButton";
      addNoteBtn.dataset.wordId = w.id;
      actions.appendChild(addNoteBtn);
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "secondary delete-helper-word-btn";
    deleteBtn.textContent = "Delete";
    deleteBtn.dataset.immersionKey = "btnDelete";
    deleteBtn.dataset.wordId = w.id;
    actions.appendChild(deleteBtn);

    li.appendChild(actions);

    // A personal note/question about this word — own line, wraps below
    // the rest of the row (a future teacher-notes feature could add to
    // this same field).
    if (w.id === editingHelperNoteWordId) {
      li.appendChild(buildHelperNoteEditor(w));
    } else if (w.notes) {
      const noteBlock = document.createElement("div");
      noteBlock.className = "helper-word-note";

      const noteText = document.createElement("span");
      noteText.className = "helper-word-note-text";
      noteText.textContent = w.notes;
      noteBlock.appendChild(noteText);

      const editNoteBtn = document.createElement("button");
      editNoteBtn.type = "button";
      editNoteBtn.className = "secondary edit-helper-note-btn";
      editNoteBtn.textContent = "Edit note";
      editNoteBtn.dataset.immersionKey = "editNoteButton";
      editNoteBtn.dataset.wordId = w.id;
      noteBlock.appendChild(editNoteBtn);

      li.appendChild(noteBlock);
    }

    list.appendChild(li);
  });
}

function handleHelperNotebookListClick(e) {
  if (e.target.classList.contains("add-to-vocab-btn")) {
    addingToVocabWordId = e.target.dataset.wordId;
    renderHelperWordsPanel(activeEntryLang);
    return;
  }
  if (e.target.classList.contains("delete-helper-word-btn")) {
    handleDeleteHelperWord(e.target.dataset.wordId);
    return;
  }
  if (e.target.classList.contains("add-helper-note-btn") || e.target.classList.contains("edit-helper-note-btn")) {
    editingHelperNoteWordId = e.target.dataset.wordId;
    renderHelperWordsPanel(activeEntryLang);
  }
}

// A small textarea + Save/Cancel for a Helper Notebook word's personal
// note/question — own row, appended after the word's main row.
function buildHelperNoteEditor(helperWord) {
  const wrapper = document.createElement("div");
  wrapper.className = "helper-word-note-edit";

  const textarea = document.createElement("textarea");
  textarea.className = "helper-word-note-input";
  textarea.rows = 2;
  textarea.placeholder = "A question or note about this word (why this form, when to use it, etc.)";
  textarea.dataset.immersionKey = "helperNoteQuestionPlaceholder";
  textarea.value = helperWord.notes || "";
  wrapper.appendChild(textarea);

  const btnRow = document.createElement("div");
  btnRow.className = "helper-word-note-edit-actions";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "Save note";
  saveBtn.dataset.immersionKey = "saveNoteButton";
  saveBtn.addEventListener("click", () => {
    Storage.updateHelperWordNotes(helperWord.id, textarea.value.trim());
    editingHelperNoteWordId = null;
    renderHelperWordsPanel(activeEntryLang);
  });
  btnRow.appendChild(saveBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "secondary";
  cancelBtn.textContent = "Cancel";
  cancelBtn.dataset.immersionKey = "btnCancel";
  cancelBtn.addEventListener("click", () => {
    editingHelperNoteWordId = null;
    renderHelperWordsPanel(activeEntryLang);
  });
  btnRow.appendChild(cancelBtn);

  wrapper.appendChild(btnRow);
  return wrapper;
}

// A word only ever gets to "waiting to be learned" — once you've saved
// it into a real Vocab Bank theme, it's no longer a backlog item, so it
// gets removed from the Helper Notebook on a successful save. The
// target/furigana fields are editable here, not just a blind re-save of
// whatever Vocab check found — useful both for words that were never
// checked (you already know the translation, no need to wait) and for
// fixing a bad lookup by hand before it goes into your permanent deck.
function buildAddToVocabPanel(helperWord) {
  const wrapper = document.createElement("div");
  wrapper.className = "word-move-panel helper-add-vocab-panel";

  const englishLabel = document.createElement("span");
  englishLabel.className = "word-label";
  englishLabel.textContent = helperWord.english;
  wrapper.appendChild(englishLabel);

  const targetInput = document.createElement("input");
  targetInput.type = "text";
  targetInput.className = "helper-add-vocab-input";
  const targetLangName = displayLanguageName(helperWord.language);
  targetInput.placeholder = `${targetLangName} word`;
  targetInput.dataset.immersionKey = "targetWordPlaceholderTemplate";
  targetInput.dataset.immersionVars = JSON.stringify({ lang: targetLangName });
  targetInput.value = helperWord.targetWord || "";
  targetInput.setAttribute("aria-label", "Target-language word");
  wrapper.appendChild(targetInput);

  let furiganaInput = null;
  if (helperWord.language === "ja") {
    furiganaInput = document.createElement("input");
    furiganaInput.type = "text";
    furiganaInput.className = "helper-add-vocab-input";
    furiganaInput.placeholder = "Furigana (optional)";
    furiganaInput.value = helperWord.furigana || "";
    furiganaInput.setAttribute("aria-label", "Furigana");
    wrapper.appendChild(furiganaInput);
  }

  const themeSelect = document.createElement("select");
  themeSelect.className = "word-move-select";
  wrapper.appendChild(themeSelect);
  renderHelperThemeOptions(themeSelect, helperWord.language);
  themeSelect.addEventListener("change", (e) => {
    if (e.target.value !== HELPER_NEW_THEME_VALUE) return;
    createHelperVocabTheme(themeSelect, helperWord.language);
  });

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "Save";
  saveBtn.dataset.immersionKey = "btnSave";
  saveBtn.addEventListener("click", () =>
    handleSaveAddToVocab(helperWord, themeSelect, targetInput, furiganaInput)
  );
  wrapper.appendChild(saveBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "secondary";
  cancelBtn.textContent = "Cancel";
  cancelBtn.dataset.immersionKey = "btnCancel";
  cancelBtn.addEventListener("click", () => {
    addingToVocabWordId = null;
    renderHelperWordsPanel(activeEntryLang);
  });
  wrapper.appendChild(cancelBtn);

  return wrapper;
}

function renderHelperThemeOptions(select, language, selectedId) {
  select.innerHTML = "";
  const themes = Storage.getThemes().filter((t) => t.language === language);
  themes.forEach((theme) => {
    const opt = document.createElement("option");
    opt.value = theme.id;
    opt.textContent = theme.name;
    select.appendChild(opt);
  });

  const newOpt = document.createElement("option");
  newOpt.value = HELPER_NEW_THEME_VALUE;
  newOpt.textContent = "+ Create new theme…";
  newOpt.dataset.immersionKey = "createNewThemeOption";
  select.appendChild(newOpt);

  if (selectedId) {
    select.value = selectedId;
  } else if (themes.length === 0) {
    select.value = HELPER_NEW_THEME_VALUE;
  }
}

// Dedicated function (rather than relying only on the select's "change"
// event) for the cold-start case where no themes exist yet for this
// language — "+ Create new theme…" is then the only option, already
// selected, so its change event never fires. handleSaveAddToVocab calls
// this directly in that case.
function createHelperVocabTheme(select, language) {
  const name = prompt(t("createNewThemeNamePrompt", "Name for the new theme:"));
  const existingThemes = Storage.getThemes().filter((t) => t.language === language);
  if (!name || !name.trim()) {
    renderHelperThemeOptions(select, language, existingThemes.length ? existingThemes[0].id : null);
    return null;
  }
  const theme = Storage.addTheme(name.trim(), language);
  renderHelperThemeOptions(select, language, theme.id);
  return theme;
}

function handleSaveAddToVocab(helperWord, themeSelect, targetInput, furiganaInput) {
  let themeId = themeSelect.value;

  if (!themeId || themeId === HELPER_NEW_THEME_VALUE) {
    const theme = createHelperVocabTheme(themeSelect, helperWord.language);
    if (!theme) return;
    themeId = theme.id;
  }

  const targetWord = targetInput.value.trim();
  if (!targetWord) {
    alert(t("giveWordBeforeSavingAlert", `Give it a ${WRITING_LANGUAGE_NAMES[helperWord.language]} word before saving.`, { lang: displayLanguageName(helperWord.language) }));
    return;
  }

  const saved = Storage.addWordIfNotDuplicate(themeId, {
    english: helperWord.english,
    targetLang: targetWord,
    furigana: furiganaInput ? furiganaInput.value.trim() : "",
    notes: "",
  });

  if (!saved) {
    alert(t("wordAlreadyExistsAlert", "That word already exists in that theme — pick a different theme, or it's already covered."));
    return;
  }

  Storage.markHelperWordAddedToVocab(helperWord.id, themeId);
  addingToVocabWordId = null;
  renderHelperWordsPanel(activeEntryLang);
}

function handleDeleteHelperWord(wordId) {
  if (!confirm(t("removeHelperWordConfirm", "Remove this from your Helper Notebook? This doesn't touch anything already saved to your Vocab Bank."))) return;
  Storage.deleteHelperWord(wordId);
  renderHelperWordsPanel(activeEntryLang);
}

// ---- Vocab check ----

async function handleVocabCheckClick() {
  if (!entryPersisted) {
    alert(t("saveEntryFirstVocabAlert", "Save the entry first, then run Vocab check."));
    return;
  }
  const entry = Storage.getWritingEntry(activeEntryId);
  if (!entry) return;

  const uniqueWords = extractBracketWords(entry.text || "");
  if (uniqueWords.length === 0) {
    alert(t("noWordsToCheckAlert", "No < > words left to check."));
    return;
  }

  const btn = document.getElementById("vocab-check-btn");
  const status = document.getElementById("vocab-check-status");
  if (btn) btn.disabled = true;
  if (status) {
    status.hidden = false;
    status.textContent = "Checking...";
    status.dataset.immersionKey = "checkingVocabStatus";
    delete status.dataset.immersionVars;
    retranslateImmersionElement(status);
  }

  const results = {}; // lowercase word -> { targetWord, furigana }
  const failed = [];

  for (const word of uniqueWords) {
    try {
      const result = await Translate.lookupTranslation(word, "en", activeEntryLang);
      // Japanese uses a completely different script — if the "translation"
      // is literally the same string as the English input, that's not a
      // real translation, it's the model echoing back an unconfident
      // guess. Treat it as a failure rather than inserting English text
      // into a Japanese entry. (Not applied to Spanish, where an
      // identical string, e.g. a loanword like "hotel", can be correct.)
      const isJapaneseEcho =
        activeEntryLang === "ja" && result && result.translation.trim().toLowerCase() === word.trim().toLowerCase();
      if (result && result.translation && !isJapaneseEcho) {
        results[word.toLowerCase()] = { targetWord: result.translation, furigana: result.furigana || null };
      } else {
        failed.push(word);
      }
    } catch (err) {
      console.error(`Vocab check failed for "${word}":`, err);
      failed.push(word);
    }
  }

  // Japanese: a kanji word on its own is ambiguous to a learner still
  // building reading fluency, so the replacement carries its furigana
  // reading right alongside it, the same way it would be written in an
  // annotated text -- e.g. <cat> -> 猫（ねこ）. Words with no kanji (pure
  // kana, or anything in Spanish/French) are left as just the word.
  const KANJI_PATTERN = /[\u4e00-\u9faf]/;
  const displayTextFor = (hit) => {
    if (activeEntryLang === "ja" && hit.furigana && KANJI_PATTERN.test(hit.targetWord)) {
      return `${hit.targetWord}（${hit.furigana}）`;
    }
    return hit.targetWord;
  };

  const newText = entry.text.replace(BRACKET_PATTERN, (match, inner) => {
    const hit = results[inner.trim().toLowerCase()];
    return hit ? displayTextFor(hit) : match;
  });

  const newCorrectedWords = Array.from(
    new Set([...(entry.correctedWords || []), ...Object.values(results).map((r) => displayTextFor(r))])
  );

  Storage.updateWritingEntry(activeEntryId, { text: newText, correctedWords: newCorrectedWords });

  Object.keys(results).forEach((key) => {
    const originalWord = uniqueWords.find((w) => w.toLowerCase() === key);
    Storage.recordHelperWordLookup(activeEntryLang, originalWord, results[key]);
  });

  renderHelperWordsPanel(activeEntryLang);
  showViewMode(); // resets vocab-check-status — set its final state after, not before

  if (btn) btn.disabled = false;
  if (status) {
    if (failed.length > 0) {
      status.hidden = false;
      const failedList = failed.join(", ");
      status.textContent = `Couldn't find a translation for: ${failedList} — left as-is, try again later.`;
      status.dataset.immersionKey = "couldntFindTranslationStatus";
      status.dataset.immersionVars = JSON.stringify({ words: failedList });
      retranslateImmersionElement(status);
    } else {
      status.hidden = true;
    }
  }
}

// ---- Grammar check ----
// Deliberately a separate button/endpoint from Vocab check: Vocab check
// only resolves <bracketed> unknown words via a plain dictionary lookup;
// this reads the WHOLE entry for real sentence-level correctness
// (conjugation, agreement, particles, word order) using a stronger
// model, since that's a much harder reasoning task than one word at a
// time. Kept independent on purpose — a teacher could eventually permit
// one without the other.
async function handleGrammarCheckClick() {
  if (!entryPersisted) {
    alert(t("saveEntryFirstGrammarAlert", "Save the entry first, then run Grammar check."));
    return;
  }
  const entry = Storage.getWritingEntry(activeEntryId);
  if (!entry) return;

  if (!entry.text || !entry.text.trim()) {
    alert(t("nothingToCheckAlert", "Nothing to check yet — write something first."));
    return;
  }

  // Grammar check needs the text to actually be in the target language
  // first — a live check (not a one-time flag) so re-adding <brackets>
  // after a check re-blocks it too, rather than trusting a stale "was
  // checked once" state.
  if (extractBracketWords(entry.text).length > 0) {
    alert(
      t(
        "vocabCheckFirstAlert",
        "Vocab check this entry first — Grammar check can't run while <word> placeholders are still in the text."
      )
    );
    return;
  }

  const btn = document.getElementById("grammar-check-btn");
  const status = document.getElementById("grammar-check-status");
  if (btn) btn.disabled = true;
  if (status) {
    status.hidden = false;
    status.textContent = "Checking grammar — this is a thorough process and might take a couple of minutes!";
    status.dataset.immersionKey = "checkingGrammarStatus";
    delete status.dataset.immersionVars;
    retranslateImmersionElement(status);
  }

  const result = await Translate.checkWritingGrammar(entry.text, activeEntryLang);

  if (result.error || typeof result.correctedText !== "string") {
    if (btn) btn.disabled = false;
    if (status) {
      status.hidden = false;
      const errorText = result.error || "the server didn't return a usable result.";
      status.textContent = `Grammar check failed: ${errorText}`;
      status.dataset.immersionKey = "grammarCheckFailedStatus";
      status.dataset.immersionVars = JSON.stringify({
        error: result.error ? errorText : t("grammarCheckFailedFallback", errorText),
      });
      retranslateImmersionElement(status);
    }
    return;
  }

  // The AI's only job is producing one corrected string for the whole
  // entry (see WRITING_GRAMMAR_CHECK_PROMPT) — it never sees or returns
  // individual sentences. Splitting into sentences, deciding which ones
  // actually changed, and exactly which characters/words changed is all
  // worked out here deterministically (buildGrammarSentenceCheck, an
  // LCS-based text diff against the learner's OWN saved entry.text),
  // never trusted from anything the AI separately reports. Never
  // touches entry.text — the learner's own writing stays exactly as
  // saved.
  const sentences = buildGrammarSentenceCheck(entry.text, result.correctedText, activeEntryLang);

  Storage.updateWritingEntry(activeEntryId, {
    grammarSentenceCheck: { checkedAt: Date.now(), sentences },
  });

  // Fresh results always start collapsed, with no note form open —
  // "Show corrections" reveals them explicitly each time.
  grammarCorrectionsRevealed = false;
  addingNoteForSentenceId = null;

  showViewMode(); // resets grammar-check-status — set its final state after, not before

  if (btn) btn.disabled = false;
  if (status) {
    const mistakeCount = sentences.filter((s) => s.hasMistake).length;
    status.hidden = false;
    if (mistakeCount === 0) {
      status.textContent = "No grammar issues found — looks good!";
      status.dataset.immersionKey = "noGrammarIssuesStatus";
      delete status.dataset.immersionVars;
    } else {
      status.textContent = `Found ${mistakeCount} sentence${mistakeCount === 1 ? "" : "s"} to fix — click "Show corrections" to see them.`;
      status.dataset.immersionKey = "grammarCheckFoundIssuesStatus";
      status.dataset.immersionVars = JSON.stringify({ count: mistakeCount });
    }
    retranslateImmersionElement(status);
  }
}

// Populates the "Before / after grammar check" comparison — the plain
// text right before the most recent Grammar check run, stacked above
// the current (red-highlighted) version, so the two can be read one on
// top of the other rather than only seeing the final corrected result.
// Hidden if there's nothing to compare (never run, or the last run made
// no changes).
function renderGrammarComparePanel(entry) {
  const wrap = document.getElementById("grammar-compare-wrap");
  const beforeBox = document.getElementById("grammar-compare-before");
  const afterBox = document.getElementById("grammar-compare-after");
  if (!wrap || !beforeBox || !afterBox) return;

  const before = entry && entry.textBeforeLastGrammarCheck;
  if (!before || before === entry.text) {
    wrap.hidden = true;
    beforeBox.textContent = "";
    afterBox.innerHTML = "";
    return;
  }

  wrap.hidden = false;
  beforeBox.textContent = before;
  renderEntryTextInto(afterBox, entry.text || "", entry.correctedWords || [], entry.grammarCorrectedWords || []);
}

// Populates the collapsible "What grammar check changed" list from the
// most recent Grammar check run — replaced (not accumulated) each run,
// since old explanations referencing text that's since been edited
// again would just be confusing.
function renderGrammarNotesPanel(entry) {
  const wrap = document.getElementById("grammar-notes-wrap");
  const list = document.getElementById("grammar-notes-list");
  if (!wrap || !list) return;

  const notes = (entry && entry.grammarNotes) || [];
  list.innerHTML = "";

  if (notes.length === 0) {
    wrap.hidden = true;
    return;
  }

  wrap.hidden = false;
  notes.forEach((note) => {
    const li = document.createElement("li");
    li.className = "writing-grammar-note-item";

    if (note.id && note.id === addingToGrammarNoteId) {
      li.appendChild(buildAddToGrammarPanel(note));
      list.appendChild(li);
      return;
    }

    const corrected = document.createElement("span");
    corrected.className = "grammar-note-corrected";
    corrected.textContent = note.corrected || "";
    li.appendChild(corrected);

    if (note.explanation) {
      const explanation = document.createElement("span");
      explanation.className = "grammar-note-explanation";
      explanation.textContent = note.explanation;
      li.appendChild(explanation);
    }

    const actions = document.createElement("span");
    actions.className = "grammar-note-actions";

    if (note.addedToGrammar) {
      const addedEl = document.createElement("span");
      addedEl.className = "helper-word-added";
      addedEl.textContent = "✓ Added to Grammar";
      addedEl.dataset.immersionKey = "addedToGrammarDefaultText";
      actions.appendChild(addedEl);
    } else if (note.id) {
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "secondary add-to-grammar-btn";
      addBtn.textContent = "Add to Grammar";
      addBtn.dataset.immersionKey = "addToGrammarButton";
      addBtn.dataset.noteId = note.id;
      actions.appendChild(addBtn);
    }

    li.appendChild(actions);
    list.appendChild(li);
  });
}

function handleGrammarNotesListClick(e) {
  if (e.target.classList.contains("add-to-grammar-btn")) {
    addingToGrammarNoteId = e.target.dataset.noteId;
    renderGrammarNotesPanel(Storage.getWritingEntry(activeEntryId));
  }
}

// Turns one Grammar-check correction into a real Grammar Bank note —
// the corrected phrase becomes the note's "sentence", the explanation
// Grammar check already gave becomes the note's "notes" field, so
// nothing has to be retyped. Mirrors buildAddToVocabPanel's inline
// folder-picker pattern exactly.
// The new sentence-by-sentence Grammar check display — separate from
// (and shown alongside) the legacy renderGrammarComparePanel/
// renderGrammarNotesPanel, which stay untouched for entries checked
// before this redesign. Sentences with no mistake render nothing at
// all; a sentence with a mistake shows its corrected form directly
// underneath, with the learner's original wording in green immediately
// followed by the fix highlighted in yellow, plus a manual "Save to
// Mistakes" button.
// ---- Deterministic diff between the learner's OWN original text and
// the AI's corrected text (LCS-based) ----
// v2 asked the AI to also echo back "original" per sentence, and that
// backfired: on a subtle one-character error (勉強しないといけい vs
// ...けない) the model sometimes "corrected" the original field too, so
// the diff saw two identical strings and reported no mistake — the
// learner's real error went completely unflagged. Fixed by removing
// "original" from the AI's job entirely: the AI now only returns one
// corrected string for the WHOLE entry (this was already accurate), and
// every "original" half of every comparison comes straight from
// entry.text — the learner's own saved writing, never anything the AI
// echoed. Sentence boundaries are then found from the diff itself
// rather than asked of the AI, so a comma-splice the AI fixes into two
// sentences doesn't need the AI to agree on a matching sentence count.
function tokenizeForDiff(text, language) {
  if (language === "ja") return Array.from(text || "");
  return (text || "").match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]|\s+/gu) || [];
}

// Classic LCS diff: dp[i][j] = length of the longest common subsequence
// of a[i:] and b[j:]. Walking the table from the front then reconstructs
// the actual RAW (unmerged, one op per token) edit script, preferring to
// consume whichever side keeps the most future matches available.
// Unmerged is what groupDiffOpsIntoSentences needs — merging happens per
// sentence afterwards, in mergeDiffOps.
function diffTokensRaw(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "equal", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "del", text: a[i] });
      i++;
    } else {
      ops.push({ type: "ins", text: b[j] });
      j++;
    }
  }
  while (i < n) {
    ops.push({ type: "del", text: a[i] });
    i++;
  }
  while (j < m) {
    ops.push({ type: "ins", text: b[j] });
    j++;
  }
  return ops;
}

// Merges consecutive same-type ops into one span, so e.g. a 3-character
// replacement highlights as one span rather than three.
function mergeDiffOps(rawOps) {
  const merged = [];
  rawOps.forEach((op) => {
    const last = merged[merged.length - 1];
    if (last && last.type === op.type) {
      last.text += op.text;
    } else {
      merged.push({ type: op.type, text: op.text });
    }
  });
  return merged;
}

const JAPANESE_SENTENCE_TERMINATORS = new Set(["。", "！", "？"]);
const DEFAULT_SENTENCE_TERMINATORS = new Set([".", "!", "?"]);

// Groups the raw whole-entry diff into per-"sentence" chunks by cutting
// right after any KEPT (equal or ins) terminator token. Using the kept
// side means: an unchanged sentence break (equal "。") cuts normally; an
// inserted break (the AI splitting a run-on into two) cuts right where
// the new period lands; a deleted break (two sentences merged into one)
// does NOT cut, so both original sentences fold into one combined
// group — no need for the AI to agree on a 1:1 sentence count.
function groupDiffOpsIntoSentences(rawOps, language) {
  const terminators = language === "ja" ? JAPANESE_SENTENCE_TERMINATORS : DEFAULT_SENTENCE_TERMINATORS;
  const groups = [];
  let current = [];
  rawOps.forEach((op) => {
    current.push(op);
    if (op.type !== "del" && terminators.has(op.text)) {
      groups.push(current);
      current = [];
    }
  });
  if (current.length) groups.push(current);
  return groups;
}

function opsToOriginalText(ops) {
  return ops
    .filter((op) => op.type !== "ins")
    .map((op) => op.text)
    .join("");
}

function opsToCorrectedText(ops) {
  return ops
    .filter((op) => op.type !== "del")
    .map((op) => op.text)
    .join("");
}

// The one place a Grammar check's per-sentence result gets built: takes
// the learner's own original text (never touched) and the AI's one
// corrected string, diffs them, and groups the result into sentences.
function buildGrammarSentenceCheck(originalText, correctedText, language) {
  const rawOps = diffTokensRaw(tokenizeForDiff(originalText, language), tokenizeForDiff(correctedText, language));
  const groups = groupDiffOpsIntoSentences(rawOps, language);
  return groups.map((group) => {
    const original = opsToOriginalText(group);
    const corrected = opsToCorrectedText(group);
    return {
      id: Storage.uid(),
      original,
      corrected,
      hasMistake: original !== corrected,
      diffOps: mergeDiffOps(group),
      savedMistakeIds: [],
    };
  });
}

// Renders one side of a diff: "original" keeps equal+del spans (deleted
// text underlined/colored via .mistake-original), "corrected" keeps
// equal+ins spans (inserted text highlighted via .mistake-corrected) —
// only the changed span itself gets the color, matching the "not the
// whole sentence" rule.
function renderDiffInto(container, diffOps, side) {
  container.innerHTML = "";
  (diffOps || []).forEach((op) => {
    if (side === "original" && op.type === "ins") return;
    if (side === "corrected" && op.type === "del") return;
    if (op.type === "equal") {
      container.appendChild(document.createTextNode(op.text));
      return;
    }
    const span = document.createElement("span");
    span.className = op.type === "del" ? "mistake-original" : "mistake-corrected";
    span.textContent = op.text;
    container.appendChild(span);
  });
}

// Every sentence gets its own box: unchanged sentences render once,
// highlighted green ("this is correct"); a mistaken sentence renders as
// a stacked Original/Corrected pair (diff-highlighted) plus its saved
// notes and an "+ Add note" control. The whole panel stays collapsed
// until "Show corrections" is clicked (grammarCorrectionsRevealed).
function renderGrammarSentenceCheckPanel(entry) {
  const wrap = document.getElementById("grammar-sentence-check-wrap");
  const list = document.getElementById("grammar-sentence-check-list");
  const toggleBtn = document.getElementById("show-corrections-btn");
  if (!wrap || !list) return;

  const check = entry && entry.grammarSentenceCheck;
  const sentences = check && Array.isArray(check.sentences) ? check.sentences : [];

  if (sentences.length === 0) {
    wrap.hidden = true;
    if (toggleBtn) toggleBtn.hidden = true;
    return;
  }

  if (toggleBtn) {
    toggleBtn.hidden = false;
    toggleBtn.textContent = grammarCorrectionsRevealed ? "Hide corrections" : "Show corrections";
    toggleBtn.dataset.immersionKey = grammarCorrectionsRevealed ? "hideCorrectionsButton" : "showCorrectionsButton";
    retranslateImmersionElement(toggleBtn);
  }
  wrap.hidden = !grammarCorrectionsRevealed;

  const allMistakes = Storage.getWritingMistakes(activeEntryLang);
  list.innerHTML = "";

  sentences.forEach((s) => {
    const item = document.createElement("div");
    item.className = "grammar-sentence-check-item";

    if (!s.hasMistake) {
      item.classList.add("grammar-sentence-correct");
      const p = document.createElement("p");
      p.className = "grammar-sentence-corrected";
      p.textContent = s.corrected;
      item.appendChild(p);
      list.appendChild(item);
      return;
    }

    const originalLabel = document.createElement("p");
    originalLabel.className = "grammar-sentence-box-label";
    originalLabel.textContent = "Original";
    originalLabel.dataset.immersionKey = "originalLabel";
    item.appendChild(originalLabel);

    const originalLine = document.createElement("p");
    originalLine.className = "grammar-sentence-original";
    renderDiffInto(originalLine, s.diffOps, "original");
    item.appendChild(originalLine);

    const correctedLabel = document.createElement("p");
    correctedLabel.className = "grammar-sentence-box-label";
    correctedLabel.textContent = "Corrected";
    correctedLabel.dataset.immersionKey = "correctedLabel";
    item.appendChild(correctedLabel);

    const correctedLine = document.createElement("p");
    correctedLine.className = "grammar-sentence-corrected";
    renderDiffInto(correctedLine, s.diffOps, "corrected");
    item.appendChild(correctedLine);

    const notesWrap = document.createElement("div");
    notesWrap.className = "grammar-sentence-notes";

    (s.savedMistakeIds || []).forEach((mid) => {
      const saved = allMistakes.find((m) => m.id === mid);
      if (!saved) return;
      const row = document.createElement("div");
      row.className = "grammar-sentence-note-row";

      const summaryBtn = document.createElement("button");
      summaryBtn.type = "button";
      summaryBtn.className = "grammar-sentence-note-summary-btn";
      summaryBtn.textContent = `${saved.flagged ? "🚩 " : "✓ "}${saved.english || "(flagged, no text yet)"}`;
      summaryBtn.dataset.viewNoteId = saved.id;
      row.appendChild(summaryBtn);

      if (viewingSavedNoteId === saved.id) {
        const detail = document.createElement("div");
        detail.className = "grammar-sentence-note-detail";
        if (saved.corrected) {
          const targetP = document.createElement("p");
          targetP.className = "grammar-sentence-note-detail-target";
          targetP.textContent = saved.corrected;
          detail.appendChild(targetP);
        }
        if (saved.mistakeNote) {
          const noteP = document.createElement("p");
          noteP.className = "grammar-sentence-note-detail-explain";
          noteP.textContent = saved.mistakeNote;
          detail.appendChild(noteP);
        }
        if (!saved.corrected && !saved.mistakeNote) {
          const emptyP = document.createElement("p");
          emptyP.className = "grammar-sentence-note-detail-explain";
          emptyP.textContent = "Flagged to look at later — no note written yet.";
          emptyP.dataset.immersionKey = "flaggedNoNoteYetText";
          detail.appendChild(emptyP);
        }
        row.appendChild(detail);
      }

      notesWrap.appendChild(row);
    });

    if (s.id === addingNoteForSentenceId) {
      notesWrap.appendChild(buildAddMistakeNoteForm(s));
    } else {
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "secondary add-mistake-note-btn";
      addBtn.textContent = "+ Add note";
      addBtn.dataset.immersionKey = "addMistakeNoteButton";
      addBtn.dataset.sentenceId = s.id;
      notesWrap.appendChild(addBtn);
    }

    item.appendChild(notesWrap);
    list.appendChild(item);
  });
}

// The manual "add to Mistakes" form — deliberately blank (not
// auto-filled from the AI) so saving one means actually writing the
// English and the corrected sentence out again, not just clicking a
// button. The Original/Corrected sentence stays visible above this
// form as reference while typing. Multiple of these can be saved per
// sentence, one at a time.
function buildAddMistakeNoteForm(sentence) {
  const form = document.createElement("div");
  form.className = "add-mistake-note-form";

  const englishInput = document.createElement("input");
  englishInput.type = "text";
  englishInput.className = "add-mistake-english-input";
  englishInput.placeholder = "English";
  englishInput.dataset.immersionKey = "addMistakeEnglishPlaceholder";

  const targetInput = document.createElement("input");
  targetInput.type = "text";
  targetInput.className = "add-mistake-target-input";
  const targetLangName = displayLanguageName(activeEntryLang);
  targetInput.placeholder = t("addMistakeTargetPlaceholder", `Correct translation in ${targetLangName}`, {
    lang: targetLangName,
  });
  targetInput.dataset.immersionKey = "addMistakeTargetPlaceholder";
  targetInput.dataset.immersionVars = JSON.stringify({ lang: targetLangName });

  const noteInput = document.createElement("textarea");
  noteInput.rows = 2;
  noteInput.className = "add-mistake-explanation-input";
  noteInput.placeholder = "What was the mistake, and why? (optional)";
  noteInput.dataset.immersionKey = "addMistakeNotePlaceholder";

  const flagLabel = document.createElement("label");
  flagLabel.className = "add-mistake-flag-label";
  const flagCheckbox = document.createElement("input");
  flagCheckbox.type = "checkbox";
  flagLabel.appendChild(flagCheckbox);
  const flagText = document.createElement("span");
  flagText.textContent = "Flag to look at later";
  flagText.dataset.immersionKey = "flagForLaterLabel";
  flagLabel.appendChild(flagText);

  const actions = document.createElement("div");
  actions.className = "add-mistake-note-actions";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "Save";
  saveBtn.dataset.immersionKey = "btnSave";
  saveBtn.addEventListener("click", () => {
    handleSaveMistakeNote(sentence.id, englishInput.value, targetInput.value, noteInput.value, flagCheckbox.checked);
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "secondary";
  cancelBtn.textContent = "Cancel";
  cancelBtn.dataset.immersionKey = "btnCancel";
  cancelBtn.addEventListener("click", () => {
    addingNoteForSentenceId = null;
    showViewMode();
  });

  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);

  form.appendChild(englishInput);
  form.appendChild(targetInput);
  form.appendChild(noteInput);
  form.appendChild(flagLabel);
  form.appendChild(actions);
  return form;
}

function handleSaveMistakeNote(sentenceId, english, target, mistakeNote, flagged) {
  // Flagging something "to look at later" is meant to be a one-click
  // action when you don't yet understand the mistake well enough to
  // write it out — only a real (unflagged) note requires actually
  // writing the English/target pair back out.
  if (!flagged && (!english.trim() || !target.trim())) {
    alert(t("mistakeNoteRequiredFieldsAlert", "Write both the English and the corrected sentence before saving — or just flag it to look at later."));
    return;
  }

  const entry = Storage.getWritingEntry(activeEntryId);
  if (!entry || !entry.grammarSentenceCheck) return;
  const sentence = entry.grammarSentenceCheck.sentences.find((s) => s.id === sentenceId);
  if (!sentence) return;

  const saved = Storage.addWritingMistake({
    language: activeEntryLang,
    english: english.trim(),
    corrected: target.trim(),
    mistakeNote: mistakeNote.trim(),
    flagged: !!flagged,
    original: sentence.original || "",
    aiCorrected: sentence.corrected || "",
    sourceEntryId: activeEntryId,
    sourceEntryTitle: entry.title || "",
  });

  const updatedSentences = entry.grammarSentenceCheck.sentences.map((s) =>
    s.id === sentenceId ? { ...s, savedMistakeIds: [...(s.savedMistakeIds || []), saved.id] } : s
  );
  Storage.updateWritingEntry(activeEntryId, {
    grammarSentenceCheck: { ...entry.grammarSentenceCheck, sentences: updatedSentences },
  });

  addingNoteForSentenceId = null;
  showViewMode();
}

function handleGrammarSentenceCheckListClick(e) {
  const viewBtn = e.target.closest(".grammar-sentence-note-summary-btn");
  if (viewBtn) {
    const id = viewBtn.dataset.viewNoteId;
    viewingSavedNoteId = viewingSavedNoteId === id ? null : id;
    showViewMode();
    return;
  }
  const addBtn = e.target.closest(".add-mistake-note-btn");
  if (!addBtn) return;
  addingNoteForSentenceId = addBtn.dataset.sentenceId;
  showViewMode();
}

function handleShowCorrectionsToggle() {
  grammarCorrectionsRevealed = !grammarCorrectionsRevealed;
  showViewMode();
}


function buildAddToGrammarPanel(note) {
  const wrapper = document.createElement("div");
  wrapper.className = "word-move-panel grammar-add-panel";

  const correctedLabel = document.createElement("span");
  correctedLabel.className = "grammar-note-corrected";
  correctedLabel.textContent = note.corrected || "";
  wrapper.appendChild(correctedLabel);

  // Only trust the tag if it's a concept the frontend also knows about
  // AND applies to this entry's language — protects against a stale or
  // mismatched tag silently steering a note into the wrong kind of
  // folder.
  const concept =
    note.concept && grammarConceptAppliesToLanguage(note.concept, activeEntryLang)
      ? getGrammarConcept(note.concept)
      : null;

  if (concept) {
    const conceptHint = document.createElement("p");
    conceptHint.className = "hint grammar-concept-hint";
    conceptHint.textContent = `Recognized pattern: ${concept.label} — suggested a matching folder below so you can practice this later.`;
    conceptHint.dataset.immersionKey = "recognizedPatternHint";
    conceptHint.dataset.immersionVars = JSON.stringify({ label: concept.label });
    wrapper.appendChild(conceptHint);
  }

  const themeSelect = document.createElement("select");
  themeSelect.className = "word-move-select";
  wrapper.appendChild(themeSelect);
  renderGrammarFolderOptions(themeSelect, activeEntryLang, null, concept);
  themeSelect.addEventListener("change", (e) => {
    if (e.target.value !== WRITING_GRAMMAR_NEW_FOLDER_VALUE) return;
    createGrammarFolderFromWriting(themeSelect, activeEntryLang, concept);
  });

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "Save";
  saveBtn.dataset.immersionKey = "btnSave";
  saveBtn.addEventListener("click", () => handleSaveAddToGrammar(note, themeSelect));
  wrapper.appendChild(saveBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "secondary";
  cancelBtn.textContent = "Cancel";
  cancelBtn.dataset.immersionKey = "btnCancel";
  cancelBtn.addEventListener("click", () => {
    addingToGrammarNoteId = null;
    renderGrammarNotesPanel(Storage.getWritingEntry(activeEntryId));
  });
  wrapper.appendChild(cancelBtn);

  return wrapper;
}

function renderGrammarFolderOptions(select, language, selectedId, concept) {
  select.innerHTML = "";
  const themes = Storage.getGrammarThemes(language);
  themes.forEach((theme) => {
    const opt = document.createElement("option");
    opt.value = theme.id;
    opt.textContent = theme.name;
    select.appendChild(opt);
  });

  const newOpt = document.createElement("option");
  newOpt.value = WRITING_GRAMMAR_NEW_FOLDER_VALUE;
  newOpt.textContent = concept ? `+ Create "${concept.label}" folder…` : "+ Create new folder…";
  select.appendChild(newOpt);

  if (selectedId) {
    select.value = selectedId;
    return;
  }

  // A recognized concept takes priority: prefer an existing folder
  // already tagged with this exact concept so repeated corrections of
  // the same pattern collect in one place instead of scattering, and
  // otherwise default straight to creating one (with the concept's name
  // pre-suggested) rather than leaving the pick to chance.
  if (concept) {
    const matching = themes.find((t) => t.practiceConcept === concept.key);
    select.value = matching ? matching.id : WRITING_GRAMMAR_NEW_FOLDER_VALUE;
    return;
  }

  if (themes.length === 0) {
    select.value = WRITING_GRAMMAR_NEW_FOLDER_VALUE;
  }
}

// Dedicated function (rather than relying only on the select's "change"
// event) for the cold-start case where no folders exist yet — mirrors
// createHelperVocabTheme's reasoning exactly. When creating a folder for
// a recognized concept, the prompt is pre-filled with its label and the
// new folder is tagged with practiceConcept so it becomes practice-able.
function createGrammarFolderFromWriting(select, language, concept) {
  const name = prompt(t("createNewGrammarFolderPrompt", "Name for the new Grammar folder:"), concept ? concept.label : "");
  const existingThemes = Storage.getGrammarThemes(language);
  if (!name || !name.trim()) {
    renderGrammarFolderOptions(select, language, existingThemes.length ? existingThemes[0].id : null, concept);
    return null;
  }
  const theme = Storage.addGrammarTheme(name.trim(), language, concept ? concept.key : null);
  renderGrammarFolderOptions(select, language, theme.id, concept);
  return theme;
}

function handleSaveAddToGrammar(note, themeSelect) {
  let themeId = themeSelect.value;
  const concept =
    note.concept && grammarConceptAppliesToLanguage(note.concept, activeEntryLang)
      ? getGrammarConcept(note.concept)
      : null;

  if (!themeId || themeId === WRITING_GRAMMAR_NEW_FOLDER_VALUE) {
    const theme = createGrammarFolderFromWriting(themeSelect, activeEntryLang, concept);
    if (!theme) return;
    themeId = theme.id;
  }

  // "explanation" is what the AI said was wrong (read-only, from the
  // check itself); "notes" is left blank for the learner's own optional
  // note — the two used to be conflated into one field, which meant
  // there was nowhere left to actually write something yourself.
  Storage.addGrammarNote({
    themeId,
    sentence: note.corrected || "",
    translation: "",
    explanation: note.explanation || "",
    notes: "",
    tags: ["from grammar check"],
  });

  const entry = Storage.getWritingEntry(activeEntryId);
  if (entry) {
    const updatedNotes = (entry.grammarNotes || []).map((n) =>
      n.id === note.id ? { ...n, addedToGrammar: true, addedGrammarThemeId: themeId } : n
    );
    Storage.updateWritingEntry(activeEntryId, { grammarNotes: updatedNotes });
  }

  addingToGrammarNoteId = null;
  renderGrammarNotesPanel(Storage.getWritingEntry(activeEntryId));
}

// Renders text into container, wrapping any exact occurrence of a
// corrected word in a red <span class="corrected-word">. Plain text
// otherwise — this is why view mode exists as a separate read-only
// surface: a <textarea> can't style part of its own value.
// correctedWords (Vocab check) render red; grammarCorrectedWords
// (Grammar check) render blue — two separate, independently-accumulated
// lists so it's always obvious which check touched a given word, rather
// than one shade of red regardless of source.
function renderEntryTextInto(container, text, correctedWords, grammarCorrectedWords, underlinedPhrases) {
  container.innerHTML = "";

  if (!text) {
    const empty = document.createElement("p");
    empty.className = "empty-hint";
    empty.textContent = "No writing yet — click Edit to add some.";
    empty.dataset.immersionKey = "noWritingYetText";
    container.appendChild(empty);
    return;
  }

  const vocabSet = new Set((correctedWords || []).filter(Boolean));
  const grammarSet = new Set((grammarCorrectedWords || []).filter(Boolean));
  // Purely a formatting choice the learner made themselves (see
  // handleToggleUnderlineSelection) — independent of, and layered on
  // top of, the vocab/grammar-correction highlighting above, so a
  // phrase can be both a correction AND underlined at once.
  const underlineSet = new Set((underlinedPhrases || []).filter(Boolean));
  const allWords = Array.from(new Set([...vocabSet, ...grammarSet, ...underlineSet]));

  if (allWords.length === 0) {
    container.textContent = text;
    return;
  }

  // Longest match first, so a shorter corrected word that's also a
  // substring of a longer corrected phrase gets matched as the fuller
  // phrase rather than split apart.
  allWords.sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(${allWords.map(escapeRegExp).join("|")})`, "g");
  const parts = text.split(pattern);

  parts.forEach((part) => {
    if (!part) return;
    const classes = [];
    if (grammarSet.has(part)) classes.push("grammar-corrected-word");
    else if (vocabSet.has(part)) classes.push("corrected-word");
    if (underlineSet.has(part)) classes.push("user-underlined-phrase");

    if (classes.length === 0) {
      container.appendChild(document.createTextNode(part));
      return;
    }
    const span = document.createElement("span");
    span.className = classes.join(" ");
    span.textContent = part;
    container.appendChild(span);
  });
}

// The learner selects some text inside the read-only saved-entry view
// and clicks "Underline" — toggles that exact phrase in/out of
// entry.underlinedPhrases (mirrors how correctedWords/
// grammarCorrectedWords are stored: a set of literal substrings matched
// back onto entry.text on every render, not offsets, so it survives a
// later Vocab/Grammar check re-render without drifting). Pure display —
// never touches entry.text itself, so it can't affect diffing or
// bracket-word detection.
function handleToggleUnderlineSelection() {
  const textBox = document.getElementById("view-entry-text");
  const selection = window.getSelection();
  if (!textBox || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
    alert(t("selectTextToUnderlineAlert", "Select some text in your saved entry above first."));
    return;
  }

  const range = selection.getRangeAt(0);
  if (!textBox.contains(range.commonAncestorContainer)) {
    alert(t("selectTextToUnderlineAlert", "Select some text in your saved entry above first."));
    return;
  }

  const phrase = selection.toString().trim();
  if (!phrase) {
    alert(t("selectTextToUnderlineAlert", "Select some text in your saved entry above first."));
    return;
  }

  const entry = Storage.getWritingEntry(activeEntryId);
  if (!entry) return;
  if (!(entry.text || "").includes(phrase)) {
    // Can happen if the selection crosses two separately-highlighted
    // spans and picks up stray whitespace differences — ask for a
    // tighter selection rather than silently storing something that'll
    // never match on render.
    alert(t("underlineSelectionTooComplexAlert", "Couldn't underline that selection — try selecting a shorter, simpler stretch of text."));
    return;
  }

  const existing = entry.underlinedPhrases || [];
  const updated = existing.includes(phrase) ? existing.filter((p) => p !== phrase) : [...existing, phrase];

  Storage.updateWritingEntry(activeEntryId, { underlinedPhrases: updated });
  selection.removeAllRanges();
  showViewMode();
}

// ---- Reading-while-writing tabs ----
// Read-only view of a saved passage's text, shown in tabs alongside the
// editor — plain text, no click-to-look-up here (that's what the
// Reading bubble itself is for); this is just something to reference.

// ---------------------------------------------------------------------
// mistakes.html — saved sentence-check fixes (Storage.getWritingMistakes)
// ---------------------------------------------------------------------

function initMistakesPage() {
  const list = document.getElementById("mistakes-list");
  if (!list) return; // not this page

  const langParam = getQueryParam("lang");
  const lang = SUPPORTED_LANGUAGES.includes(langParam) ? langParam : null;

  if (lang) {
    const backLink = document.getElementById("mistakes-back-link");
    if (backLink) backLink.href = `writing.html?lang=${lang}`;
    const header = document.getElementById("mistakes-header");
    if (header) header.classList.add(`lang-${lang}`);
    document.body.classList.add(`lang-${lang}`);
  }

  if (isFlaggedOnlyView()) {
    const heading = document.getElementById("mistakes-heading");
    if (heading) {
      heading.textContent = "Flagged grammar points";
      heading.dataset.immersionKey = "flaggedGrammarPointsTitle";
    }
    const intro = document.getElementById("mistakes-intro");
    if (intro) {
      intro.textContent = "Mistakes you flagged to look at later — for independent research, outside this app.";
      intro.dataset.immersionKey = "flaggedGrammarPointsIntro";
    }
  }

  renderMistakesList(lang);
  initTopbar(lang);
  if (typeof initHubTasks === "function") initHubTasks(lang);
  if (lang) {
    initAppTabs({
      section: "writing",
      language: lang,
      label: `${WRITING_LANGUAGE_NAMES[lang]} Writing`,
      href: `writing.html?lang=${lang}`,
    });
  } else {
    initAppTabs(null);
  }

  list.addEventListener("click", handleMistakesListClick);

  const flashcardsBtn = document.getElementById("mistakes-flashcards-btn");
  if (flashcardsBtn) flashcardsBtn.addEventListener("click", handleMistakesFlashcardsClick);
  const testBtn = document.getElementById("mistakes-test-btn");
  if (testBtn) testBtn.addEventListener("click", handleMistakesTestClick);
}

function isFlaggedOnlyView() {
  return getQueryParam("flagged") === "1";
}

function renderMistakesList(lang) {
  const list = document.getElementById("mistakes-list");
  if (!list) return;

  const mistakes = Storage.getWritingMistakes(lang)
    .filter((m) => (isFlaggedOnlyView() ? !!m.flagged : true))
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  list.innerHTML = "";

  if (mistakes.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-hint";
    if (isFlaggedOnlyView()) {
      li.textContent = "No flagged grammar points yet — tick \"flag to look at later\" when saving a mistake from a Grammar check.";
      li.dataset.immersionKey = "noFlaggedGrammarPointsHint";
    } else {
      li.textContent = "No mistakes saved yet — save one from a Grammar check on a Writing entry.";
      li.dataset.immersionKey = "noMistakesSavedHint";
    }
    list.appendChild(li);
    return;
  }

  mistakes.forEach((m) => {
    const li = document.createElement("li");
    li.className = "word-item helper-word-item mistake-item";
    li.id = `mistake-${m.id}`;

    const info = document.createElement("div");
    info.className = "helper-word-info";
    const englishEl = document.createElement("span");
    englishEl.className = "word-label";
    englishEl.textContent = m.english || "(no translation saved)";
    info.appendChild(englishEl);
    if (m.flagged) {
      const flagEl = document.createElement("span");
      flagEl.className = "helper-word-pending";
      flagEl.textContent = "🚩 Flagged";
      flagEl.dataset.immersionKey = "flaggedForLaterText";
      info.appendChild(flagEl);
    }
    li.appendChild(info);

    // english/corrected are the learner's own retyped pair — plain
    // text, no diff-highlighting (that's for the AI's version on the
    // Writing entry itself, not this saved note).
    const correctedLine = document.createElement("p");
    correctedLine.className = "grammar-sentence-corrected";
    correctedLine.textContent = m.corrected || "";
    li.appendChild(correctedLine);

    if (m.mistakeNote) {
      const noteEl = document.createElement("p");
      noteEl.className = "helper-word-note-text";
      noteEl.textContent = m.mistakeNote;
      li.appendChild(noteEl);
    }

    if (m.sourceEntryTitle) {
      const sourceEl = document.createElement("span");
      sourceEl.className = "helper-word-pending";
      sourceEl.textContent = `From: ${m.sourceEntryTitle}`;
      li.appendChild(sourceEl);
    }

    const actions = document.createElement("div");
    actions.className = "helper-word-actions";
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "secondary delete-mistake-btn";
    deleteBtn.textContent = "Delete";
    deleteBtn.dataset.immersionKey = "btnDelete";
    deleteBtn.dataset.mistakeId = m.id;
    actions.appendChild(deleteBtn);
    li.appendChild(actions);

    list.appendChild(li);
  });
}

function handleMistakesListClick(e) {
  const deleteBtn = e.target.closest(".delete-mistake-btn");
  if (!deleteBtn) return;
  if (!confirm(t("deleteMistakeConfirm", "Delete this saved mistake?"))) return;
  Storage.deleteWritingMistake(deleteBtn.dataset.mistakeId);
  const langParam = getQueryParam("lang");
  const lang = SUPPORTED_LANGUAGES.includes(langParam) ? langParam : null;
  renderMistakesList(lang);
}

// ---------------------------------------------------------------------
// Mistakes — flashcards + typed self-test practice
// ---------------------------------------------------------------------

function getMistakesPracticePool(lang) {
  return Storage.getWritingMistakes(lang)
    .filter((m) => (isFlaggedOnlyView() ? !!m.flagged : true))
    .filter((m) => (m.english || "").trim() && (m.corrected || "").trim());
}

function handleMistakesFlashcardsClick() {
  const langParam = getQueryParam("lang");
  const lang = SUPPORTED_LANGUAGES.includes(langParam) ? langParam : null;
  mistakesPracticeCards = getMistakesPracticePool(lang);
  if (mistakesPracticeCards.length === 0) {
    alert(
      t(
        "noMistakesToPracticeAlert",
        "No saved mistakes with both an English and target-language sentence yet — add some from a Grammar check first."
      )
    );
    return;
  }
  mistakesPracticeMode = "flashcards";
  mistakesPracticeIndex = 0;
  mistakesFlashcardFlipped = false;
  renderMistakesPracticePanel();
}

function handleMistakesTestClick() {
  const langParam = getQueryParam("lang");
  const lang = SUPPORTED_LANGUAGES.includes(langParam) ? langParam : null;
  mistakesPracticeCards = getMistakesPracticePool(lang);
  if (mistakesPracticeCards.length === 0) {
    alert(
      t(
        "noMistakesToPracticeAlert",
        "No saved mistakes with both an English and target-language sentence yet — add some from a Grammar check first."
      )
    );
    return;
  }
  mistakesPracticeMode = "test";
  mistakesPracticeIndex = 0;
  renderMistakesPracticePanel();
}

function closeMistakesPractice() {
  mistakesPracticeMode = null;
  mistakesPracticeCards = [];
  mistakesPracticeIndex = 0;
  mistakesFlashcardFlipped = false;
  renderMistakesPracticePanel();
}

function renderMistakesPracticePanel() {
  const panel = document.getElementById("mistakes-practice-panel");
  const list = document.getElementById("mistakes-list");
  const actions = document.getElementById("mistakes-actions");
  if (!panel) return;

  if (!mistakesPracticeMode) {
    panel.hidden = true;
    panel.innerHTML = "";
    if (list) list.hidden = false;
    if (actions) actions.hidden = false;
    return;
  }

  if (list) list.hidden = true;
  if (actions) actions.hidden = true;
  panel.hidden = false;
  panel.innerHTML = "";

  const card = mistakesPracticeCards[mistakesPracticeIndex];
  if (!card) {
    closeMistakesPractice();
    return;
  }

  const counter = document.createElement("p");
  counter.className = "practice-counter";
  counter.textContent = `${mistakesPracticeIndex + 1} / ${mistakesPracticeCards.length}`;
  panel.appendChild(counter);

  const box = document.createElement("div");
  box.className = "practice-card-box";
  panel.appendChild(box);

  const front = document.createElement("p");
  front.className = "practice-card-front";
  front.textContent = card.english;
  box.appendChild(front);

  if (mistakesPracticeMode === "flashcards") {
    if (mistakesFlashcardFlipped) {
      const back = document.createElement("p");
      back.className = "practice-card-back";
      back.textContent = card.corrected;
      box.appendChild(back);
    } else {
      const flipBtn = document.createElement("button");
      flipBtn.type = "button";
      flipBtn.className = "secondary practice-flip-btn";
      flipBtn.textContent = "Flip";
      flipBtn.dataset.immersionKey = "btnFlip";
      flipBtn.addEventListener("click", () => {
        mistakesFlashcardFlipped = true;
        renderMistakesPracticePanel();
      });
      box.appendChild(flipBtn);
    }
  } else {
    const answerInput = document.createElement("textarea");
    answerInput.className = "practice-answer-input";
    answerInput.rows = 2;
    answerInput.placeholder = t("practiceAnswerPlaceholder", "Write it in the target language…");
    box.appendChild(answerInput);

    const checkBtn = document.createElement("button");
    checkBtn.type = "button";
    checkBtn.className = "secondary practice-check-btn";
    checkBtn.textContent = "Check";
    checkBtn.dataset.immersionKey = "btnCheck";
    checkBtn.addEventListener("click", () => {
      if (box.querySelector(".practice-card-back")) return;
      const back = document.createElement("p");
      back.className = "practice-card-back";
      back.textContent = card.corrected;
      box.appendChild(back);
    });
    box.appendChild(checkBtn);
  }

  const nav = document.createElement("div");
  nav.className = "practice-nav";
  panel.appendChild(nav);

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "secondary";
  prevBtn.textContent = "← Prev";
  prevBtn.dataset.immersionKey = "btnPrev";
  prevBtn.disabled = mistakesPracticeIndex === 0;
  prevBtn.addEventListener("click", () => {
    mistakesPracticeIndex = Math.max(0, mistakesPracticeIndex - 1);
    mistakesFlashcardFlipped = false;
    renderMistakesPracticePanel();
  });
  nav.appendChild(prevBtn);

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "secondary";
  nextBtn.textContent = "Next →";
  nextBtn.dataset.immersionKey = "btnNext";
  nextBtn.disabled = mistakesPracticeIndex === mistakesPracticeCards.length - 1;
  nextBtn.addEventListener("click", () => {
    mistakesPracticeIndex = Math.min(mistakesPracticeCards.length - 1, mistakesPracticeIndex + 1);
    mistakesFlashcardFlipped = false;
    renderMistakesPracticePanel();
  });
  nav.appendChild(nextBtn);

  const doneBtn = document.createElement("button");
  doneBtn.type = "button";
  doneBtn.className = "secondary";
  doneBtn.textContent = "Done";
  doneBtn.dataset.immersionKey = "btnDone";
  doneBtn.addEventListener("click", closeMistakesPractice);
  nav.appendChild(doneBtn);
}


function buildReadingTabElement(passageId, passage, activeId) {
  const tab = document.createElement("div");
  tab.className = `vocab-tab lang-${passage.language}` + (passageId === activeId ? " active" : "");
  tab.dataset.passageId = passageId;
  tab.addEventListener("click", () => switchReadingTab(passageId));

  const label = document.createElement("span");
  label.className = "vocab-tab-label";
  label.textContent = passage.title;
  tab.appendChild(label);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "vocab-tab-close";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", `Close ${passage.title} tab`);
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeReadingTab(passageId);
  });
  tab.appendChild(closeBtn);

  return tab;
}

function renderReadingTabStrip() {
  const tabsContainer = document.getElementById("entry-tab-strip-tabs");
  if (!tabsContainer) return;
  tabsContainer.innerHTML = "";
  openReadingTabIds.forEach((passageId) => {
    const passage = passageId === LOCKER_TAB_ID ? getLockerPseudoPassage() : Storage.getPassage(passageId);
    if (!passage) return;
    tabsContainer.appendChild(buildReadingTabElement(passageId, passage, activeReadingTabId));
  });
}

function renderReadingTabContent() {
  const content = document.getElementById("entry-tab-content");
  if (!content) return;
  content.innerHTML = "";

  if (!activeReadingTabId) {
    const empty = document.createElement("p");
    empty.className = "hint entry-tab-empty";
    empty.textContent = "No passage open — click + to add one, or link one above.";
    empty.dataset.immersionKey = "noPassageOpenHint";
    content.appendChild(empty);
    return;
  }

  if (activeReadingTabId === LOCKER_TAB_ID) {
    renderLockerTabContent(content);
    return;
  }

  const passage = Storage.getPassage(activeReadingTabId);
  if (!passage) return;

  const title = document.createElement("h3");
  title.textContent = passage.title;
  content.appendChild(title);

  const text = document.createElement("p");
  text.className = "entry-tab-passage-text";
  text.textContent = passage.text;
  content.appendChild(text);
}

// Storage Locker items are metadata only (no real file uploads yet) — a
// link opens in a new tab, a document just shows its type + note.
function renderLockerTabContent(content) {
  const title = document.createElement("h3");
  title.textContent = t("storageLockerTabLabel", "Storage Locker");
  content.appendChild(title);

  const items = Storage.getStorageLockerItems(activeEntryLang);
  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint entry-tab-empty";
    empty.textContent = "Nothing saved in the Storage Locker yet.";
    empty.dataset.immersionKey = "lockerEmptyFromWritingHint";
    content.appendChild(empty);
    return;
  }

  const list = document.createElement("ul");
  list.className = "word-list entry-tab-locker-list";
  items
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .forEach((item) => {
      const isLink = item.kind ? item.kind === "link" : !(item.fileKey || item.docType);

      const li = document.createElement("li");
      li.className = "word-item helper-word-item";

      const info = document.createElement("div");
      info.className = "helper-word-info";

      const titleEl = document.createElement(isLink ? "a" : "span");
      titleEl.className = "word-label";
      titleEl.textContent = item.title || (isLink ? item.url : "Untitled");
      if (isLink) {
        titleEl.href = item.url;
        titleEl.target = "_blank";
        titleEl.rel = "noopener";
      }
      info.appendChild(titleEl);

      const meta = document.createElement("span");
      meta.className = "helper-word-pending";
      meta.textContent = isLink ? "Link" : (item.docType || "Document");
      info.appendChild(meta);

      li.appendChild(info);

      if (item.note) {
        const noteEl = document.createElement("div");
        noteEl.className = "helper-word-note-text";
        noteEl.textContent = item.note;
        li.appendChild(noteEl);
      }

      list.appendChild(li);
    });
  content.appendChild(list);
}

function switchReadingTab(passageId) {
  activeReadingTabId = passageId;
  renderReadingTabStrip();
  renderReadingTabContent();
}

function openReadingTab(passageId) {
  if (passageId !== LOCKER_TAB_ID && !Storage.getPassage(passageId)) return;
  if (!openReadingTabIds.includes(passageId)) {
    openReadingTabIds.push(passageId);
  }
  switchReadingTab(passageId);
}

function closeReadingTab(passageId) {
  const wasActive = activeReadingTabId === passageId;
  openReadingTabIds = openReadingTabIds.filter((id) => id !== passageId);
  if (wasActive) {
    activeReadingTabId = openReadingTabIds[openReadingTabIds.length - 1] || null;
  }
  renderReadingTabStrip();
  renderReadingTabContent();
}

function renderReadingTabPickerOptions() {
  const select = document.getElementById("entry-tab-picker");
  if (!select) return;
  select.innerHTML = '<option value="" disabled selected>Open which reference?</option>';
  const openIds = new Set(openReadingTabIds);
  Storage.getPassages()
    .filter((p) => p.language === activeEntryLang && !openIds.has(p.id))
    .forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.title;
      select.appendChild(opt);
    });
  if (!openIds.has(LOCKER_TAB_ID)) {
    const lockerOpt = document.createElement("option");
    lockerOpt.value = LOCKER_TAB_ID;
    lockerOpt.textContent = t("storageLockerTabLabel", "Storage Locker");
    select.appendChild(lockerOpt);
  }
}

function handleEntryTabPlusClick() {
  const plusBtn = document.getElementById("entry-tab-plus");
  const select = document.getElementById("entry-tab-picker");
  if (!select) return;

  const openIds = new Set(openReadingTabIds);
  const available = Storage.getPassages().filter((p) => p.language === activeEntryLang && !openIds.has(p.id));
  const lockerAvailable = !openIds.has(LOCKER_TAB_ID);
  if (available.length === 0 && !lockerAvailable) {
    alert(t("noMoreReferencesAlert", "Nothing left to open — save a passage from the Reading section first, or every reference is already open."));
    return;
  }

  renderReadingTabPickerOptions();
  select.hidden = false;
  if (plusBtn) plusBtn.hidden = true;
  select.focus();
}

function handleEntryTabPickerChange(e) {
  const passageId = e.target.value;
  if (!passageId) return;
  openReadingTab(passageId);

  const select = document.getElementById("entry-tab-picker");
  const plusBtn = document.getElementById("entry-tab-plus");
  if (select) {
    select.value = "";
    select.hidden = true;
  }
  if (plusBtn) plusBtn.hidden = false;
}
