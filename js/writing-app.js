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
  - A saved entry defaults to a read-only view (matching Personal Hub's
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
    const heading = document.getElementById("writing-heading");
    if (heading) heading.textContent = `${WRITING_LANGUAGE_NAMES[lang]} Writing`;
    const backLink = document.getElementById("writing-back-link");
    if (backLink) backLink.href = `language-home.html?lang=${lang}`;
    const header = document.getElementById("writing-header");
    if (header) header.classList.add(`lang-${lang}`);
    const newEntryLink = document.getElementById("new-entry-link");
    if (newEntryLink) newEntryLink.href = `writing-entry.html?lang=${lang}`;
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

function renderEntryList(lang) {
  const list = document.getElementById("entry-list");
  if (!list) return;

  const entries = (lang ? Storage.getWritingEntries(lang) : Storage.getWritingEntries())
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.createdAt - a.createdAt);

  list.innerHTML = "";

  if (entries.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-hint";
    li.textContent = lang
      ? `No ${WRITING_LANGUAGE_NAMES[lang]} entries yet — write your first one above.`
      : "No entries yet — write your first one above.";
    list.appendChild(li);
    return;
  }

  entries.forEach((entry) => {
    const li = document.createElement("li");
    li.className = `theme-item lang-${entry.language}`;
    li.addEventListener("click", () => {
      window.location.href = `writing-entry.html?id=${encodeURIComponent(entry.id)}`;
    });

    const nameEl = document.createElement("span");
    nameEl.className = "theme-name";
    nameEl.textContent = entry.title || "Untitled entry";
    li.appendChild(nameEl);

    const meta = document.createElement("span");
    meta.className = "theme-meta";

    const dateBadge = document.createElement("span");
    dateBadge.className = "folder-badge";
    dateBadge.textContent = entry.date || "";
    meta.appendChild(dateBadge);

    const wordBadge = document.createElement("span");
    wordBadge.className = "folder-badge";
    wordBadge.textContent = `${countWords(entry.text)} words`;
    meta.appendChild(wordBadge);

    if (entry.linkedPassageId) {
      const passage = Storage.getPassage(entry.linkedPassageId);
      if (passage) {
        const linkBadge = document.createElement("span");
        linkBadge.className = `lang-badge lang-badge-${entry.language}`;
        linkBadge.textContent = `Linked: ${passage.title}`;
        meta.appendChild(linkBadge);
      }
    }

    li.appendChild(meta);
    list.appendChild(li);
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
  const vocabCheckBtn = document.getElementById("vocab-check-btn");
  if (vocabCheckBtn) vocabCheckBtn.addEventListener("click", handleVocabCheckClick);
  const grammarCheckBtn = document.getElementById("grammar-check-btn");
  if (grammarCheckBtn) grammarCheckBtn.addEventListener("click", handleGrammarCheckClick);
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
  if (heading) heading.textContent = entry.title || "Untitled entry";

  const dateBadge = document.getElementById("view-entry-date");
  if (dateBadge) dateBadge.textContent = entry.date || "";

  const linkedBadge = document.getElementById("view-entry-linked-badge");
  if (linkedBadge) {
    const passage = entry.linkedPassageId ? Storage.getPassage(entry.linkedPassageId) : null;
    if (passage) {
      linkedBadge.hidden = false;
      linkedBadge.className = `lang-badge lang-badge-${entry.language}`;
      linkedBadge.textContent = `Linked: ${passage.title}`;
    } else {
      linkedBadge.hidden = true;
    }
  }

  const textBox = document.getElementById("view-entry-text");
  if (textBox) renderEntryTextInto(textBox, entry.text || "", entry.correctedWords || [], entry.grammarCorrectedWords || []);

  const status = document.getElementById("vocab-check-status");
  if (status) status.hidden = true;
  const grammarStatus = document.getElementById("grammar-check-status");
  if (grammarStatus) grammarStatus.hidden = true;

  renderGrammarComparePanel(entry);
  renderGrammarNotesPanel(entry);
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
    heading.textContent = entry
      ? entry.title || "Untitled entry"
      : `New ${WRITING_LANGUAGE_NAMES[activeEntryLang]} entry`;
  }

  // Freshly (re)entering edit mode always starts from what's actually
  // saved, so there's nothing pending yet.
  cancelPendingAutosave();
  updateAutosaveStatus(entry ? "All changes saved" : "");

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
  updateAutosaveStatus("Unsaved changes…");
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
  updateAutosaveStatus("Saved");
  syncWritingEntryAppTab(Storage.getWritingEntry(activeEntryId));
}

function updateAutosaveStatus(text) {
  const el = document.getElementById("entry-autosave-status");
  if (el) el.textContent = text;
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
  if (n === 0) countEl.textContent = "No unknown words in this entry yet.";
  else if (n === 1) countEl.textContent = "1 unknown word in this entry.";
  else countEl.textContent = `${n} unknown words in this entry.`;
}

function renderLinkSelectOptions(select, selectedId) {
  if (!select) return;
  select.innerHTML = '<option value="">No link</option>';
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
    alert("Give the entry a title.");
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
// Reuses the same per-language notes as Personal Hub's Helper Notebook
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
  if (!confirm("Delete this entry? This can't be undone.")) return;
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
// that originalText wouldn't know about. Words from OTHER entries (this
// list is per-language, not per-entry) fall back to the old
// most-recently-seen ordering, after everything from this entry.
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

  const currentEntry = entryPersisted ? Storage.getWritingEntry(activeEntryId) : null;
  const orderMap = buildEntryWordOrderMap(currentEntry);

  const words = Storage.getHelperWords(lang)
    .slice()
    .sort((a, b) => {
      const aIdx = orderMap.has(a.english.toLowerCase()) ? orderMap.get(a.english.toLowerCase()) : null;
      const bIdx = orderMap.has(b.english.toLowerCase()) ? orderMap.get(b.english.toLowerCase()) : null;
      if (aIdx !== null && bIdx !== null) return aIdx - bIdx;
      if (aIdx !== null) return -1; // words in this entry always sort before words from elsewhere
      if (bIdx !== null) return 1;
      return (b.lastSeenAt || b.createdAt || 0) - (a.lastSeenAt || a.createdAt || 0);
    });

  list.innerHTML = "";

  if (words.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-hint";
    li.textContent = "No unknown words yet — bracket one like <word> in your writing.";
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
      info.appendChild(pendingEl);
    }

    li.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "helper-word-actions";

    if (w.addedToVocab) {
      const theme = w.addedThemeId ? Storage.getTheme(w.addedThemeId) : null;
      const addedEl = document.createElement("span");
      addedEl.className = "helper-word-added";
      addedEl.textContent = theme ? `✓ Added to — ${theme.name}` : "✓ Added to Vocab";
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
  targetInput.placeholder = WRITING_LANGUAGE_NAMES[helperWord.language] + " word";
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
  const name = prompt("Name for the new theme:");
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
    alert(`Give it a ${WRITING_LANGUAGE_NAMES[helperWord.language]} word before saving.`);
    return;
  }

  const saved = Storage.addWordIfNotDuplicate(themeId, {
    english: helperWord.english,
    targetLang: targetWord,
    furigana: furiganaInput ? furiganaInput.value.trim() : "",
    notes: "",
  });

  if (!saved) {
    alert("That word already exists in that theme — pick a different theme, or it's already covered.");
    return;
  }

  Storage.markHelperWordAddedToVocab(helperWord.id, themeId);
  addingToVocabWordId = null;
  renderHelperWordsPanel(activeEntryLang);
}

function handleDeleteHelperWord(wordId) {
  if (!confirm("Remove this from your Helper Notebook? This doesn't touch anything already saved to your Vocab Bank.")) return;
  Storage.deleteHelperWord(wordId);
  renderHelperWordsPanel(activeEntryLang);
}

// ---- Vocab check ----

async function handleVocabCheckClick() {
  if (!entryPersisted) {
    alert("Save the entry first, then run Vocab check.");
    return;
  }
  const entry = Storage.getWritingEntry(activeEntryId);
  if (!entry) return;

  const uniqueWords = extractBracketWords(entry.text || "");
  if (uniqueWords.length === 0) {
    alert("No < > words left to check.");
    return;
  }

  const btn = document.getElementById("vocab-check-btn");
  const status = document.getElementById("vocab-check-status");
  if (btn) btn.disabled = true;
  if (status) {
    status.hidden = false;
    status.textContent = "Checking...";
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

  const newText = entry.text.replace(BRACKET_PATTERN, (match, inner) => {
    const hit = results[inner.trim().toLowerCase()];
    return hit ? hit.targetWord : match;
  });

  const newCorrectedWords = Array.from(
    new Set([...(entry.correctedWords || []), ...Object.values(results).map((r) => r.targetWord)])
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
      status.textContent = `Couldn't find a translation for: ${failed.join(", ")} — left as-is, try again later.`;
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
    alert("Save the entry first, then run Grammar check.");
    return;
  }
  const entry = Storage.getWritingEntry(activeEntryId);
  if (!entry) return;

  if (!entry.text || !entry.text.trim()) {
    alert("Nothing to check yet — write something first.");
    return;
  }

  // What the entry looked like right before THIS run — kept so View
  // mode can show a before/after comparison stacked one on top of the
  // other, distinct from originalText (frozen at creation, predates
  // every edit and check, not just the most recent Grammar check).
  const textBeforeCheck = entry.text;

  const btn = document.getElementById("grammar-check-btn");
  const status = document.getElementById("grammar-check-status");
  if (btn) btn.disabled = true;
  if (status) {
    status.hidden = false;
    status.textContent = "Checking grammar...";
  }

  const result = await Translate.checkWritingGrammar(entry.text, activeEntryLang);

  if (result.error || typeof result.correctedText !== "string") {
    if (btn) btn.disabled = false;
    if (status) {
      status.hidden = false;
      status.textContent = `Grammar check failed: ${result.error || "the server didn't return a usable result."}`;
    }
    return;
  }

  const corrections = result.corrections || [];
  // Grammar-check corrections get their own tracked list, kept separate
  // from Vocab check's correctedWords — the two are rendered in
  // different colors (red vs blue) so it's obvious which check actually
  // touched a given word, rather than everything being one shade of red
  // regardless of which system did it.
  const newGrammarCorrectedWords = Array.from(
    new Set([...(entry.grammarCorrectedWords || []), ...corrections.map((c) => c.corrected).filter(Boolean)])
  );
  const newGrammarNotes = corrections.map((c) => ({
    id: Storage.uid(),
    original: c.original || "",
    corrected: c.corrected || "",
    explanation: c.explanation || "",
    concept: c.concept || null,
    addedToGrammar: false,
    addedGrammarThemeId: null,
  }));

  Storage.updateWritingEntry(activeEntryId, {
    text: result.correctedText,
    grammarCorrectedWords: newGrammarCorrectedWords,
    grammarNotes: newGrammarNotes,
    textBeforeLastGrammarCheck: textBeforeCheck,
  });

  showViewMode(); // resets grammar-check-status — set its final state after, not before

  if (btn) btn.disabled = false;
  if (status) {
    if (corrections.length === 0) {
      status.hidden = false;
      status.textContent = "No grammar issues found — looks good!";
    } else {
      status.hidden = true; // what changed is visible in red, plus the notes list below
    }
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
  const name = prompt("Name for the new Grammar folder:", concept ? concept.label : "");
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
function renderEntryTextInto(container, text, correctedWords, grammarCorrectedWords) {
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
  const allWords = Array.from(new Set([...vocabSet, ...grammarSet]));

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
    if (grammarSet.has(part)) {
      const span = document.createElement("span");
      span.className = "grammar-corrected-word";
      span.textContent = part;
      container.appendChild(span);
    } else if (vocabSet.has(part)) {
      const span = document.createElement("span");
      span.className = "corrected-word";
      span.textContent = part;
      container.appendChild(span);
    } else {
      container.appendChild(document.createTextNode(part));
    }
  });
}

// ---- Reading-while-writing tabs ----
// Read-only view of a saved passage's text, shown in tabs alongside the
// editor — plain text, no click-to-look-up here (that's what the
// Reading bubble itself is for); this is just something to reference.

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
    const passage = Storage.getPassage(passageId);
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

function switchReadingTab(passageId) {
  activeReadingTabId = passageId;
  renderReadingTabStrip();
  renderReadingTabContent();
}

function openReadingTab(passageId) {
  if (!Storage.getPassage(passageId)) return;
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
  select.innerHTML = '<option value="" disabled selected>Open which passage?</option>';
  const openIds = new Set(openReadingTabIds);
  Storage.getPassages()
    .filter((p) => p.language === activeEntryLang && !openIds.has(p.id))
    .forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.title;
      select.appendChild(opt);
    });
}

function handleEntryTabPlusClick() {
  const plusBtn = document.getElementById("entry-tab-plus");
  const select = document.getElementById("entry-tab-picker");
  if (!select) return;

  const openIds = new Set(openReadingTabIds);
  const available = Storage.getPassages().filter((p) => p.language === activeEntryLang && !openIds.has(p.id));
  if (available.length === 0) {
    alert("No more passages to open — save one from the Reading section first, or every passage in this language is already open.");
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
