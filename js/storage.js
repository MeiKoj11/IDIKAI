/*
  storage.js
  ----------
  Everything the Vocab Bank needs to remember lives in the browser's
  localStorage: themes (folders), words, and saved verb conjugation
  tables. No backend, no accounts — it all stays on this device, and
  works fully offline.
*/

const STORAGE_KEYS = {
  themes: "vocabBank.themes",
  words: "vocabBank.words",
  conjugationTables: "vocabBank.conjugationTables",
  srs: "vocabBank.srs",
  passages: "reading.passages",
  readingFolders: "reading.folders",
  grammarThemes: "grammar.themes",
  grammarNotes: "grammar.notes",
  grammarStarterSeeded: "grammar.starterSeeded",
  speakingEntries: "speaking.entries",
  writingEntries: "writing.entries",
  writingHelperWords: "writing.helperWords",
  personalNotes: "personalHub.notes",
  hubTasks: "hub.tasks",
  hubTaskFolders: "hub.taskFolders",
  hubReminders: "hub.reminders",
  hubNotesText: "hub.notesText",
};

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn(`Could not read "${key}" from storage, using default.`, e);
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---- Themes ----

function getThemes() {
  return readJSON(STORAGE_KEYS.themes, []);
}

function getTheme(themeId) {
  return getThemes().find((t) => t.id === themeId) || null;
}

function addTheme(name, language) {
  const themes = getThemes();
  const theme = { id: uid(), name, language };
  themes.push(theme);
  writeJSON(STORAGE_KEYS.themes, themes);
  return theme;
}

function renameTheme(themeId, newName) {
  const themes = getThemes();
  const theme = themes.find((t) => t.id === themeId);
  if (!theme) return null;
  theme.name = newName;
  writeJSON(STORAGE_KEYS.themes, themes);
  return theme;
}

// Cascades to every word saved under this theme too, so deleting a
// theme doesn't leave orphaned flashcards with no folder behind.
function deleteTheme(themeId) {
  const themes = getThemes().filter((t) => t.id !== themeId);
  writeJSON(STORAGE_KEYS.themes, themes);

  const words = readJSON(STORAGE_KEYS.words, []).filter((w) => w.themeId !== themeId);
  writeJSON(STORAGE_KEYS.words, words);
}

// ---- Words ----

function getWords(themeId) {
  const words = readJSON(STORAGE_KEYS.words, []);
  return themeId ? words.filter((w) => w.themeId === themeId) : words;
}

function addWord(word) {
  const words = readJSON(STORAGE_KEYS.words, []);
  const entry = { id: uid(), createdAt: Date.now(), ...word };
  words.push(entry);
  writeJSON(STORAGE_KEYS.words, words);
  return entry;
}

function updateWord(wordId, updates) {
  const words = readJSON(STORAGE_KEYS.words, []);
  const word = words.find((w) => w.id === wordId);
  if (!word) return null;
  Object.assign(word, updates);
  writeJSON(STORAGE_KEYS.words, words);
  return word;
}

function deleteWord(wordId) {
  const words = readJSON(STORAGE_KEYS.words, []).filter((w) => w.id !== wordId);
  writeJSON(STORAGE_KEYS.words, words);
}

// A flashcard counts as an exact duplicate if both sides match an
// existing word in the same theme, case-insensitively. excludeId lets
// editing a word skip matching against itself.
function isDuplicateWord(themeId, word, excludeId) {
  if (!themeId) return false;
  return getWords(themeId).some(
    (w) =>
      w.id !== excludeId &&
      w.english.trim().toLowerCase() === word.english.trim().toLowerCase() &&
      w.targetLang.trim().toLowerCase() === word.targetLang.trim().toLowerCase()
  );
}

// Returns the saved word, or null if it was a duplicate — callers decide
// how to tell the user (an alert in the Vocab Bank UI, inline text in
// the Reading UI, etc). Used by both the Vocab Bank add-word form and
// the Reading page's "add this looked-up word" button.
function addWordIfNotDuplicate(themeId, word, excludeId) {
  if (isDuplicateWord(themeId, word, excludeId)) return null;
  return addWord({ themeId, ...word });
}

// Moves a word to a different theme (e.g. it was filed under the wrong
// one). Refuses if the word would end up an exact duplicate of one
// already in the destination theme. Returns { success, word, reason }
// so the caller can show a clear message either way.
function moveWordToTheme(wordId, targetThemeId) {
  const words = readJSON(STORAGE_KEYS.words, []);
  const word = words.find((w) => w.id === wordId);
  if (!word) return { success: false, word: null, reason: "not-found" };
  if (word.themeId === targetThemeId) return { success: false, word: null, reason: "same-theme" };
  if (isDuplicateWord(targetThemeId, word)) return { success: false, word: null, reason: "duplicate" };
  word.themeId = targetThemeId;
  writeJSON(STORAGE_KEYS.words, words);
  return { success: true, word, reason: null };
}

// Same idea, but leaves the original word in place and adds a new copy
// under the destination theme instead. Same duplicate protection.
function copyWordToTheme(wordId, targetThemeId) {
  const words = readJSON(STORAGE_KEYS.words, []);
  const word = words.find((w) => w.id === wordId);
  if (!word) return { success: false, word: null, reason: "not-found" };
  if (isDuplicateWord(targetThemeId, word)) return { success: false, word: null, reason: "duplicate" };
  const { id, createdAt, themeId, ...rest } = word;
  const entry = addWord({ themeId: targetThemeId, ...rest });
  return { success: true, word: entry, reason: null };
}

// ---- Conjugation tables ----
// One merged table per verb infinitive, so re-saving the same verb
// (e.g. adding more tenses later) updates the existing table instead
// of creating a duplicate.

function getConjugationTables() {
  return readJSON(STORAGE_KEYS.conjugationTables, []);
}

function getConjugationTable(infinitive) {
  return getConjugationTables().find((t) => t.infinitive === infinitive) || null;
}

function saveConjugationTable(newTable) {
  const tables = getConjugationTables();
  const existing = tables.find((t) => t.infinitive === newTable.infinitive);
  if (existing) {
    // Merge: keep any previously-saved tenses/persons, add the new ones.
    existing.forms = Object.assign({}, existing.forms, newTable.forms);
  } else {
    tables.push(newTable);
  }
  writeJSON(STORAGE_KEYS.conjugationTables, tables);
  return getConjugationTable(newTable.infinitive);
}

// ---- Spaced repetition stats ----
// Keyed by an arbitrary "card id" string the app assigns (a word's id,
// or a made-up key like "verb:comer:present:yo" for conjugation drills).

function getSrsStats(cardId) {
  const all = readJSON(STORAGE_KEYS.srs, {});
  return all[cardId] || null;
}

function saveSrsStats(cardId, stats) {
  const all = readJSON(STORAGE_KEYS.srs, {});
  all[cardId] = stats;
  writeJSON(STORAGE_KEYS.srs, all);
}

// ---- Reading passages ----

function getPassages() {
  return readJSON(STORAGE_KEYS.passages, []);
}

function getPassage(passageId) {
  return getPassages().find((p) => p.id === passageId) || null;
}

function addPassage(passage) {
  const passages = readJSON(STORAGE_KEYS.passages, []);
  const entry = { id: uid(), createdAt: Date.now(), ...passage };
  passages.push(entry);
  writeJSON(STORAGE_KEYS.passages, passages);
  return entry;
}

function deletePassage(passageId) {
  const passages = readJSON(STORAGE_KEYS.passages, []).filter((p) => p.id !== passageId);
  writeJSON(STORAGE_KEYS.passages, passages);
}

// ---- Reading folders ----
// Purely organizational — a passage without a folderId is just an
// uncategorized/"random" passage, same as today, so this is additive
// and doesn't change anything for passages saved before folders existed.

function getReadingFolders(language) {
  const folders = readJSON(STORAGE_KEYS.readingFolders, []);
  return language ? folders.filter((f) => f.language === language) : folders;
}

function getReadingFolder(folderId) {
  return getReadingFolders().find((f) => f.id === folderId) || null;
}

function addReadingFolder(name, language) {
  const folders = getReadingFolders();
  const folder = { id: uid(), name, language };
  folders.push(folder);
  writeJSON(STORAGE_KEYS.readingFolders, folders);
  return folder;
}

// ---- Grammar notes ----
// A separate folder/note system from Vocab Bank — folders here are
// grammar concepts ("Reflexive idioms", "Sequence of tenses") rather
// than vocabulary categories, so they get their own namespace instead
// of reusing vocabBank.themes.
//
// Grammar started Spanish-only, so folders saved before the language
// field existed have no "language" property at all — getGrammarThemes()
// treats a missing language as "es" so that old data still shows up
// exactly where it always did instead of vanishing from both lists.

function getGrammarThemes(language) {
  const themes = readJSON(STORAGE_KEYS.grammarThemes, []);
  return language ? themes.filter((t) => (t.language || "es") === language) : themes;
}

function getGrammarTheme(themeId) {
  return getGrammarThemes().find((t) => t.id === themeId) || null;
}

// practiceConcept (optional) tags a folder as matching a recognized
// grammar concept from grammar-concepts.js (e.g. "verb-transitivity") —
// that's what unlocks the "Practice this grammar point" option on the
// folder page. Left null for ordinary, hand-created folders.
function addGrammarTheme(name, language, practiceConcept) {
  const themes = getGrammarThemes();
  const theme = { id: uid(), name, language: language || "es", practiceConcept: practiceConcept || null };
  themes.push(theme);
  writeJSON(STORAGE_KEYS.grammarThemes, themes);
  return theme;
}

function updateGrammarTheme(themeId, updates) {
  const themes = readJSON(STORAGE_KEYS.grammarThemes, []);
  const theme = themes.find((t) => t.id === themeId);
  if (!theme) return null;
  Object.assign(theme, updates);
  writeJSON(STORAGE_KEYS.grammarThemes, themes);
  return theme;
}

// Cascades to every note saved under this folder too, so deleting a
// folder doesn't leave orphaned notes with no folder behind (mirrors
// deleteTheme for Vocab Bank).
function deleteGrammarTheme(themeId) {
  const themes = getGrammarThemes().filter((t) => t.id !== themeId);
  writeJSON(STORAGE_KEYS.grammarThemes, themes);

  const notes = readJSON(STORAGE_KEYS.grammarNotes, []).filter((n) => n.themeId !== themeId);
  writeJSON(STORAGE_KEYS.grammarNotes, notes);
}

// ---- Default "starter" grammar folders ----
// A brand-new Grammar section for a language starts as an intimidating
// blank list — these two always-present starter folders give it some
// initial shape without forcing a rigid taxonomy on everything else;
// the learner can still rename, delete, or add anything on top. Same
// two names for both languages, seeded once per language ever —
// tracked separately from the folders themselves so deleting one on
// purpose doesn't bring it back on the next visit.
const GRAMMAR_STARTER_THEME_NAMES = ["Sentence structures", "Tenses and verb conjugations"];

function ensureDefaultGrammarThemes(language) {
  if (!language) return;
  const seeded = readJSON(STORAGE_KEYS.grammarStarterSeeded, []);
  if (seeded.includes(language)) return;

  const existingNames = new Set(getGrammarThemes(language).map((t) => (t.name || "").toLowerCase()));
  GRAMMAR_STARTER_THEME_NAMES.forEach((name) => {
    if (!existingNames.has(name.toLowerCase())) {
      addGrammarTheme(name, language);
    }
  });

  seeded.push(language);
  writeJSON(STORAGE_KEYS.grammarStarterSeeded, seeded);
}

// A grammar note is free-form (no fixed schema — see addGrammarNote/
// updateGrammarNote below), but the "structure card" flow (grammar-add-
// note.html + buildGrammarNoteCard in grammar-app.js) reads/writes these
// fields specifically:
//   header       — short name for the pattern, e.g. "Intention" (string)
//   explanation  — the pattern described in the learner's own words
//   examples     — [{ id, target, translation, checked, corrected, note }]
//                  target/translation are what the learner wrote; once
//                  checked via /check-example-sentence, "checked" is true
//                  and "corrected"/"note" hold the AI's result (corrected
//                  === target when nothing needed fixing).
//   variants     — [{ id, label, examples: [ ...same shape as above ] }]
//                  a related-but-different form of the same pattern
//                  (e.g. the 1st-person vs 3rd-person てほしい/てほしがる
//                  split) nested under the same card instead of living
//                  as its own folder entry.
// A note created through the older single-sentence flows (Reading's
// phrase-select handoff, Writing's "Add to Grammar") has none of these —
// buildGrammarNoteCard falls back to its original sentence/translation/
// pattern rendering when "header" is absent, so old notes keep working
// unchanged.

function getGrammarNotes(themeId) {
  const notes = readJSON(STORAGE_KEYS.grammarNotes, []);
  return themeId ? notes.filter((n) => n.themeId === themeId) : notes;
}

function getGrammarNote(noteId) {
  return getGrammarNotes().find((n) => n.id === noteId) || null;
}

function addGrammarNote(note) {
  const notes = readJSON(STORAGE_KEYS.grammarNotes, []);
  const entry = { id: uid(), createdAt: Date.now(), ...note };
  notes.push(entry);
  writeJSON(STORAGE_KEYS.grammarNotes, notes);
  return entry;
}

function updateGrammarNote(noteId, updates) {
  const notes = readJSON(STORAGE_KEYS.grammarNotes, []);
  const note = notes.find((n) => n.id === noteId);
  if (!note) return null;
  Object.assign(note, updates);
  writeJSON(STORAGE_KEYS.grammarNotes, notes);
  return note;
}

function deleteGrammarNote(noteId) {
  const notes = readJSON(STORAGE_KEYS.grammarNotes, []).filter((n) => n.id !== noteId);
  writeJSON(STORAGE_KEYS.grammarNotes, notes);
}

// ---- Speaking entries ----
// A short journal-style entry with a recorded-audio clip, optionally
// linked to something to read aloud while recording (currently a
// Reading passage — a Writing entry will slot in as another linkable
// type once that section exists, hence the generic linkedType/linkedId
// pair instead of a passage-only field).
//
// The recording itself lives in IndexedDB (see audio-store.js), not
// here — localStorage can't hold binary audio well. Entries here only
// keep the title/date/link; deleting one is the caller's job to pair
// with AudioStore.deleteRecording(entryId) so the audio doesn't become
// an orphan.
//
// isPublic is unused for now (reserved for a future "your teacher can
// see this" feature) — every entry is private until that's built.

function getSpeakingEntries(language) {
  const entries = readJSON(STORAGE_KEYS.speakingEntries, []);
  return language ? entries.filter((e) => e.language === language) : entries;
}

function getSpeakingEntry(entryId) {
  return getSpeakingEntries().find((e) => e.id === entryId) || null;
}

function addSpeakingEntry(entry) {
  const entries = readJSON(STORAGE_KEYS.speakingEntries, []);
  const record = { id: uid(), createdAt: Date.now(), isPublic: false, ...entry };
  entries.push(record);
  writeJSON(STORAGE_KEYS.speakingEntries, entries);
  return record;
}

function updateSpeakingEntry(entryId, updates) {
  const entries = readJSON(STORAGE_KEYS.speakingEntries, []);
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return null;
  Object.assign(entry, updates);
  writeJSON(STORAGE_KEYS.speakingEntries, entries);
  return entry;
}

function deleteSpeakingEntry(entryId) {
  const entries = readJSON(STORAGE_KEYS.speakingEntries, []).filter((e) => e.id !== entryId);
  writeJSON(STORAGE_KEYS.speakingEntries, entries);
}

// ---- Writing entries ----
// A dated, titled diary-style entry — you type the entry text itself
// (the `text` field), same journal shape as Speaking's entries but
// written instead of recorded. Also optionally linkable to a Reading
// passage so you can pull that text up alongside the editor to
// reference while you write.
//
// isPublic is unused for now (reserved for a future "your teacher can
// see this" feature) — every entry is private until that's built.

function getWritingEntries(language) {
  const entries = readJSON(STORAGE_KEYS.writingEntries, []);
  return language ? entries.filter((e) => e.language === language) : entries;
}

function getWritingEntry(entryId) {
  return getWritingEntries().find((e) => e.id === entryId) || null;
}

function addWritingEntry(entry) {
  const entries = readJSON(STORAGE_KEYS.writingEntries, []);
  const record = { id: uid(), createdAt: Date.now(), isPublic: false, text: "", ...entry };
  // Frozen at creation, on purpose — this is "what I actually first
  // wrote," never touched again by later edits or Vocab checks, so
  // there's always a way to see the very original.
  record.originalText = record.text;
  entries.push(record);
  writeJSON(STORAGE_KEYS.writingEntries, entries);
  return record;
}

function updateWritingEntry(entryId, updates) {
  const entries = readJSON(STORAGE_KEYS.writingEntries, []);
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return null;
  Object.assign(entry, updates);
  writeJSON(STORAGE_KEYS.writingEntries, entries);
  return entry;
}

function deleteWritingEntry(entryId) {
  const entries = readJSON(STORAGE_KEYS.writingEntries, []).filter((e) => e.id !== entryId);
  writeJSON(STORAGE_KEYS.writingEntries, entries);
}

// ---- Writing Helper Notebook ----
// A per-language backlog of English words you've bracketed (<word>) in
// Writing entries because you didn't know the target-language word yet.
// The moment you type a closed bracket, addOrTouchHelperWord logs a
// bare English note here — no lookup, no AI call, just a local record
// that this word came up. Vocab Check later enriches that SAME record
// (via recordHelperWordLookup) with the looked-up target word — and,
// for Japanese, its reading — rather than creating a second entry.
// Deduped per language by the English word (case-insensitive), so the
// same word coming up in multiple entries only ever has one record.

function getHelperWords(language) {
  const words = readJSON(STORAGE_KEYS.writingHelperWords, []);
  return language ? words.filter((w) => w.language === language) : words;
}

function findHelperWord(language, english) {
  const words = readJSON(STORAGE_KEYS.writingHelperWords, []);
  const key = english.trim().toLowerCase();
  return words.find((w) => w.language === language && w.english.trim().toLowerCase() === key) || null;
}

function addOrTouchHelperWord({ language, english, sourceEntryId, sourceEntryTitle }) {
  const words = readJSON(STORAGE_KEYS.writingHelperWords, []);
  const key = english.trim().toLowerCase();
  const existing = words.find((w) => w.language === language && w.english.trim().toLowerCase() === key);
  if (existing) {
    existing.lastSeenAt = Date.now();
    existing.sourceEntryId = sourceEntryId;
    existing.sourceEntryTitle = sourceEntryTitle;
    writeJSON(STORAGE_KEYS.writingHelperWords, words);
    return existing;
  }
  const record = {
    id: uid(),
    language,
    english: english.trim(),
    targetWord: null,
    furigana: null,
    checked: false,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    sourceEntryId,
    sourceEntryTitle,
  };
  words.push(record);
  writeJSON(STORAGE_KEYS.writingHelperWords, words);
  return record;
}

function recordHelperWordLookup(language, english, { targetWord, furigana }) {
  const words = readJSON(STORAGE_KEYS.writingHelperWords, []);
  const key = english.trim().toLowerCase();
  let record = words.find((w) => w.language === language && w.english.trim().toLowerCase() === key);
  if (!record) {
    record = { id: uid(), language, english: english.trim(), createdAt: Date.now() };
    words.push(record);
  }
  record.targetWord = targetWord || null;
  record.furigana = furigana || null;
  record.checked = true;
  record.lastSeenAt = Date.now();
  writeJSON(STORAGE_KEYS.writingHelperWords, words);
  return record;
}

function deleteHelperWord(wordId) {
  const words = readJSON(STORAGE_KEYS.writingHelperWords, []).filter((w) => w.id !== wordId);
  writeJSON(STORAGE_KEYS.writingHelperWords, words);
}

// Saving a word into a real Vocab Bank theme no longer removes it from
// the Helper Notebook — it stays as a visible record of everything
// you've looked up, just marked so "Add to Vocab" doesn't get offered
// again for it. Deleting is a separate, manual action (deleteHelperWord).
function markHelperWordAddedToVocab(wordId, themeId) {
  const words = readJSON(STORAGE_KEYS.writingHelperWords, []);
  const word = words.find((w) => w.id === wordId);
  if (!word) return null;
  word.addedToVocab = true;
  word.addedThemeId = themeId || null;
  writeJSON(STORAGE_KEYS.writingHelperWords, words);
  return word;
}

// A free-form personal note/question on a Helper Notebook word — "why
// is this the right word", a usage question, a reminder — separate from
// the looked-up translation. Written by the learner now; the field is
// generic enough that a future teacher-notes feature could add to the
// same record without a schema change.
function updateHelperWordNotes(wordId, notes) {
  const words = readJSON(STORAGE_KEYS.writingHelperWords, []);
  const word = words.find((w) => w.id === wordId);
  if (!word) return null;
  word.notes = notes || "";
  writeJSON(STORAGE_KEYS.writingHelperWords, words);
  return word;
}

// ---- Personal Hub ----
// The "make your own bubble" space — freeform note cards (a title plus
// a block of text) with no imposed structure, so a to-do list, a random
// idea, or anything else all fit the same simple shape. Per-language,
// same as everything else in a language's hub.

function getPersonalNotes(language) {
  const notes = readJSON(STORAGE_KEYS.personalNotes, []);
  return language ? notes.filter((n) => n.language === language) : notes;
}

function getPersonalNote(noteId) {
  return getPersonalNotes().find((n) => n.id === noteId) || null;
}

function addPersonalNote(note) {
  const notes = readJSON(STORAGE_KEYS.personalNotes, []);
  const entry = { id: uid(), createdAt: Date.now(), ...note };
  notes.push(entry);
  writeJSON(STORAGE_KEYS.personalNotes, notes);
  return entry;
}

function updatePersonalNote(noteId, updates) {
  const notes = readJSON(STORAGE_KEYS.personalNotes, []);
  const note = notes.find((n) => n.id === noteId);
  if (!note) return null;
  Object.assign(note, updates);
  writeJSON(STORAGE_KEYS.personalNotes, notes);
  return note;
}

function deletePersonalNote(noteId) {
  const notes = readJSON(STORAGE_KEYS.personalNotes, []).filter((n) => n.id !== noteId);
  writeJSON(STORAGE_KEYS.personalNotes, notes);
}

// ---- Hub to-do widget ----
// A small task list that lives directly on a language's hub page (not
// tucked inside a bubble) — quick things like "finish reading" or "do
// homework" you want visible at a glance without navigating anywhere.
// Two independent booleans per task (not one "status" enum) because a
// task can be started-but-not-finished, which a single done/not-done
// flag can't represent.

function getTasks(language) {
  const tasks = readJSON(STORAGE_KEYS.hubTasks, []);
  return language ? tasks.filter((t) => t.language === language) : tasks;
}

function addTask(task) {
  const tasks = readJSON(STORAGE_KEYS.hubTasks, []);
  const entry = { id: uid(), createdAt: Date.now(), started: false, completed: false, folderId: null, ...task };
  tasks.push(entry);
  writeJSON(STORAGE_KEYS.hubTasks, tasks);
  return entry;
}

function updateTask(taskId, updates) {
  const tasks = readJSON(STORAGE_KEYS.hubTasks, []);
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return null;
  Object.assign(task, updates);
  writeJSON(STORAGE_KEYS.hubTasks, tasks);
  return task;
}

function deleteTask(taskId) {
  const tasks = readJSON(STORAGE_KEYS.hubTasks, []).filter((t) => t.id !== taskId);
  writeJSON(STORAGE_KEYS.hubTasks, tasks);
}

// ---- Hub to-do folders ----
// Purely organizational grouping for the to-do widget's tasks, same
// additive pattern as Reading's passage folders — a task without a
// folderId is just "Unfiled", same as every task before folders existed.

function getTaskFolders(language) {
  const folders = readJSON(STORAGE_KEYS.hubTaskFolders, []);
  return language ? folders.filter((f) => f.language === language) : folders;
}

function getTaskFolder(folderId) {
  return getTaskFolders().find((f) => f.id === folderId) || null;
}

function addTaskFolder(name, language) {
  const folders = getTaskFolders();
  const folder = { id: uid(), name, language };
  folders.push(folder);
  writeJSON(STORAGE_KEYS.hubTaskFolders, folders);
  return folder;
}

function deleteTaskFolder(folderId) {
  const folders = readJSON(STORAGE_KEYS.hubTaskFolders, []).filter((f) => f.id !== folderId);
  writeJSON(STORAGE_KEYS.hubTaskFolders, folders);
  // Tasks in the deleted folder fall back to Unfiled rather than
  // vanishing or pointing at a folder that no longer exists.
  const tasks = readJSON(STORAGE_KEYS.hubTasks, []);
  let changed = false;
  tasks.forEach((t) => {
    if (t.folderId === folderId) {
      t.folderId = null;
      changed = true;
    }
  });
  if (changed) writeJSON(STORAGE_KEYS.hubTasks, tasks);
}

// ---- Helper Notebook hub panel (Personal Hub) ----
// Two quick-add reminder lists ("late" and "homework" — just short
// lines, no started/completed tracking like the to-do widget has) plus
// a standing pair of notes fields. Distinct from Writing's own Helper
// Notebook (bracketed vocab words) and from the hub to-do widget above
// — this is its own simple thing, per-language like everything else.

function getHubReminders(language, category) {
  const reminders = readJSON(STORAGE_KEYS.hubReminders, []);
  return reminders.filter((r) => (!language || r.language === language) && (!category || r.category === category));
}

function addHubReminder(reminder) {
  const reminders = readJSON(STORAGE_KEYS.hubReminders, []);
  const entry = { id: uid(), createdAt: Date.now(), ...reminder };
  reminders.push(entry);
  writeJSON(STORAGE_KEYS.hubReminders, reminders);
  return entry;
}

function deleteHubReminder(reminderId) {
  const reminders = readJSON(STORAGE_KEYS.hubReminders, []).filter((r) => r.id !== reminderId);
  writeJSON(STORAGE_KEYS.hubReminders, reminders);
}

// Notes to self / notes to teacher — one standing pair per language,
// not a list of entries (unlike Personal Hub's freeform bubbles below),
// so it's always the same two boxes rather than something you create.
function getHubNotesText(language) {
  const all = readJSON(STORAGE_KEYS.hubNotesText, {});
  return all[language] || { selfNote: "", teacherNote: "" };
}

function updateHubNotesText(language, updates) {
  const all = readJSON(STORAGE_KEYS.hubNotesText, {});
  all[language] = { ...(all[language] || { selfNote: "", teacherNote: "" }), ...updates };
  writeJSON(STORAGE_KEYS.hubNotesText, all);
  return all[language];
}

const Storage = {
  getThemes,
  getTheme,
  addTheme,
  renameTheme,
  deleteTheme,
  getWords,
  addWord,
  updateWord,
  deleteWord,
  isDuplicateWord,
  addWordIfNotDuplicate,
  moveWordToTheme,
  copyWordToTheme,
  getConjugationTables,
  getConjugationTable,
  saveConjugationTable,
  getSrsStats,
  saveSrsStats,
  getPassages,
  getPassage,
  addPassage,
  deletePassage,
  getReadingFolders,
  getReadingFolder,
  addReadingFolder,
  getGrammarThemes,
  getGrammarTheme,
  addGrammarTheme,
  updateGrammarTheme,
  deleteGrammarTheme,
  ensureDefaultGrammarThemes,
  getGrammarNotes,
  getGrammarNote,
  addGrammarNote,
  updateGrammarNote,
  deleteGrammarNote,
  getSpeakingEntries,
  getSpeakingEntry,
  addSpeakingEntry,
  updateSpeakingEntry,
  deleteSpeakingEntry,
  getWritingEntries,
  getWritingEntry,
  addWritingEntry,
  updateWritingEntry,
  deleteWritingEntry,
  getHelperWords,
  findHelperWord,
  addOrTouchHelperWord,
  recordHelperWordLookup,
  markHelperWordAddedToVocab,
  updateHelperWordNotes,
  deleteHelperWord,
  getPersonalNotes,
  getPersonalNote,
  addPersonalNote,
  updatePersonalNote,
  deletePersonalNote,
  getTasks,
  addTask,
  updateTask,
  deleteTask,
  getTaskFolders,
  getTaskFolder,
  addTaskFolder,
  deleteTaskFolder,
  getHubReminders,
  addHubReminder,
  deleteHubReminder,
  getHubNotesText,
  updateHubNotesText,
  uid,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = Storage;
} else {
  window.Storage = Storage;
}
