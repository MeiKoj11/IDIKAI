/*
  storage.js
  ----------
  Everything the app remembers — themes (folders), words, conjugation
  tables, journal entries, and so on — is synced through the server to
  a real per-user account, so the same data shows up on any device you
  log into. Every function below (getThemes, addWord, etc.) keeps the
  exact same signature it always had; only the two low-level
  readJSON/writeJSON primitives changed, from talking to localStorage
  to talking to an in-memory cache backed by the server.

  How the sync actually works:
    - On page load, a (deliberately synchronous) request to GET
      /api/data fetches this account's entire data blob before any
      other script on the page runs, so every Storage.* call made
      during page setup sees real data immediately — no flash of
      empty state, no need to make every page wait on a promise.
      A synchronous XMLHttpRequest is what makes that possible; it's
      old and technically deprecated, but still works fine for a
      same-origin call like this one, and keeps every other file in
      the app completely unchanged.
    - If that request comes back 401 (not logged in / session
      expired), the browser is redirected straight to login.html
      instead of showing a broken, empty app.
    - Every write (writeJSON) updates the in-memory cache immediately
      (so the rest of the page keeps behaving synchronously, exactly
      like localStorage did) and separately fires off a POST to
      /api/data in the background to persist it — with one silent
      retry if the first attempt fails (e.g. a dropped connection).
*/

let _dataCache = {};

// Set to true only if every load attempt below fails. This is the
// single most important safety flag in the whole sync system: it used
// to be that a failed load silently left _dataCache as {} and the page
// carried on as if the account had no data at all — meaning the very
// next save (adding one word, one entry, anything) would overwrite the
// real server-side value for that key with just the new item, quietly
// destroying everything else that used to be there. writeJSON() below
// refuses to run at all while this flag is set, so a broken load can
// no longer turn into a destructive write.
let _dataLoadFailed = false;

(function loadAccountData() {
  // A single dropped connection or a brief server restart (e.g. the
  // moment a deploy restarts the service) used to be enough to trigger
  // the data-loss bug described above, so this retries a few times —
  // synchronously, matching the rest of this function's already-
  // documented tradeoff — before concluding the load really failed.
  const MAX_ATTEMPTS = 4;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", "/api/data", false); // synchronous, on purpose — see file header
      xhr.send(null);

      if (xhr.status === 401) {
        const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace(`login.html?return=${returnTo}`);
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        _dataCache = JSON.parse(xhr.responseText || "{}");
        return; // success — nothing more to do
      }

      console.warn(`Attempt ${attempt}/${MAX_ATTEMPTS}: could not load your synced data (server returned ${xhr.status}).`);
    } catch (e) {
      console.warn(`Attempt ${attempt}/${MAX_ATTEMPTS}: could not reach the server to load your data.`, e);
    }
  }

  // Every attempt failed. Do NOT let the page continue on with an
  // empty cache — that's exactly what used to silently wipe accounts.
  // Block the page instead and make the failure impossible to miss.
  _dataLoadFailed = true;
  console.error("Could not load your synced data after several attempts — refusing to continue, to protect your saved data.");
  if (typeof document !== "undefined") {
    document.title = "Couldn't load your data";
    document.documentElement.innerHTML =
      '<body style="font-family: system-ui, sans-serif; max-width: 34em; margin: 4em auto; padding: 0 1.5em; line-height: 1.6; color: #221E1C;">' +
      "<h1>Couldn't load your saved data</h1>" +
      "<p>To protect your account, nothing was loaded or changed. This is usually a brief, temporary problem " +
      "(like the server restarting) — waiting a few seconds and reloading almost always fixes it.</p>" +
      '<button onclick="window.location.reload()" style="font-size: 1rem; padding: 0.6em 1.2em; cursor: pointer;">Reload</button>' +
      "</body>";
  }
})();

// Single source of truth for "which languages does this app support" —
// every page's own ?lang= validity check (`langParam === "es" ||
// langParam === "ja"`, scattered across vocab-app.js, writing-app.js,
// grammar-app.js, reading-app.js, speaking-app.js, personal-hub.js)
// should use this instead of its own hardcoded list, so adding a new
// language later is a one-line change here rather than a hunt across
// the whole codebase.
const SUPPORTED_LANGUAGES = ["es", "ja", "fr"];

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
  conjugationCardsSeeded: "grammar.conjugationCardsSeeded",
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
  return Object.prototype.hasOwnProperty.call(_dataCache, key) ? _dataCache[key] : fallback;
}

// Tracks writes that have been handed to fetch() but not yet confirmed
// saved. This is what makes it safe to click straight to another page
// right after a write (e.g. the starter-folders seeding on Grammar's
// list page, which writes the new folders and then immediately writes
// a separate "already set up" flag) — without this, a fast enough
// navigation could carry the browser away before the first write's
// network request finished, silently losing it while the second write
// (and the page after it) sail through fine.
let _pendingWrites = {};

function writeJSON(key, value, isRetry) {
  // Belt-and-suspenders on top of the load-retry/hard-block above: if
  // somehow a write is ever attempted while the initial load never
  // actually succeeded, refuse it outright rather than risk persisting
  // a value computed from an incomplete/empty cache.
  if (_dataLoadFailed) {
    console.error(`Refusing to save "${key}" — your data never finished loading, so saving now could overwrite it.`);
    return;
  }
  _dataCache[key] = value;
  _pendingWrites[key] = value;
  fetch("/api/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  })
    .then((res) => {
      if (res.ok && _pendingWrites[key] === value) delete _pendingWrites[key];
    })
    .catch((e) => {
      if (!isRetry) {
        setTimeout(() => writeJSON(key, value, true), 2000);
      } else {
        console.error(`Could not save "${key}" to the server after retrying — this change may not have synced.`, e);
      }
    });
}

// Last-resort safety net: if the page is being navigated away from or
// closed while a write is still in flight, sendBeacon fires a
// best-effort background request the browser guarantees to actually
// attempt (unlike a normal fetch, which can get cut off mid-navigation).
function flushPendingWrites() {
  Object.keys(_pendingWrites).forEach((key) => {
    const value = _pendingWrites[key];
    try {
      const blob = new Blob([JSON.stringify({ key, value })], { type: "application/json" });
      navigator.sendBeacon("/api/data", blob);
    } catch (e) {
      // Nothing more we can do at this point — the retry-on-fetch-
      // failure path above is the main defense; this is only for the
      // "navigated away mid-request" edge case specifically.
    }
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushPendingWrites);
  window.addEventListener("beforeunload", flushPendingWrites);
}

// Called from the topbar's "Log out" button (see topbar.js).
function logout() {
  fetch("/api/logout", { method: "POST" }).finally(() => {
    window.location.href = "login.html";
  });
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

// Every saved word tagged as a Japanese verb with a known conjugation
// class — the pool the Grammar conjugation-practice quizzes draw from,
// alongside the built-in common-verb list in ja-conjugator.js. Only
// words saved (or re-saved) after the verb-tagging feature shipped will
// have partOfSpeech/verbClass set — see vocab-app.js's pendingVerbInfo.
function getVerbWords(language) {
  const words = readJSON(STORAGE_KEYS.words, []);
  const themeIds = new Set(getThemes().filter((t) => t.language === language).map((t) => t.id));
  return words.filter((w) => themeIds.has(w.themeId) && w.partOfSpeech === "verb" && w.verbClass);
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

// Generic merge-update, mirroring updateWord — used so far only by the
// furigana-review feature (persisting the growing list of looked-up
// words/readings onto the passage itself), but written generically in
// case something else needs to patch a passage later.
function updatePassage(passageId, updates) {
  const passages = readJSON(STORAGE_KEYS.passages, []);
  const passage = passages.find((p) => p.id === passageId);
  if (!passage) return null;
  Object.assign(passage, updates);
  writeJSON(STORAGE_KEYS.passages, passages);
  return passage;
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

// ---- Default conjugation-pattern cards (Japanese only) ----
// Four always-present structure cards seeded into "Tenses and verb
// conjugations" the first time a Japanese Grammar folder list loads —
// the four forms building on 言う/思う (and, for potential, a mix of
// irregular/ichidan/godan verbs) so the progression reads as one
// coherent worked example: 言う "to say" -> 言われる "is said" ->
// 言わせる "make someone say" -> 言わせられる "made to say". Unlike a
// normal structure card, these carry practiceType/conjugationForm
// instead of an AI-classified grammarLabel — grammar-app.js uses that
// pair to render the dedicated local conjugation-practice panel
// (ja-conjugator.js) instead of the generic AI "Test me" panel.
function verbExample(target, translation) {
  return { id: uid(), target, translation, checked: true, corrected: target, note: "" };
}

const CONJUGATION_STARTER_CARDS = [
  {
    header: "Potential (可能形)",
    explanation:
      "The \"can do X\" form — says you're able to do something, not that you're doing it. " +
      "Godan verbs shift their final kana to the e-row and add る (飲む -> 飲める); ichidan verbs " +
      "drop る and add られる (食べる -> 食べられる); する becomes できる and 来る becomes 来られる.",
    examples: [
      verbExample("できる", "can do (potential of する)"),
      verbExample("食べられる", "can eat (potential of 食べる)"),
      verbExample("飲める", "can drink (potential of 飲む)"),
    ],
    conjugationForm: "potential",
  },
  {
    header: "Passive (受身形)",
    explanation:
      "Something happens to the subject rather than the subject doing it — e.g. この本は昔書かれた " +
      "(\"this book was written long ago\", no one implied). It can ALSO imply the action affected " +
      "the speaker, often negatively (\"suffering passive\", 迷惑の受身) — e.g. 友達に日記を読まれた " +
      "(\"my friend read my diary [and I'm annoyed]\"). Godan verbs shift to the a-row and add れる " +
      "(言う -> 言われる); ichidan verbs drop る and add られる (the same ending as potential — " +
      "context tells them apart).",
    examples: [verbExample("言われる", "is said (passive of 言う)"), verbExample("思われる", "is thought / it seems (passive of 思う)")],
    conjugationForm: "passive",
  },
  {
    header: "Causative (使役形)",
    explanation:
      "\"Make/let someone do X\" — the subject causes or permits someone else to act. Godan verbs " +
      "shift to the a-row and add せる (言う -> 言わせる); ichidan verbs drop る and add させる; する " +
      "becomes させる and 来る becomes 来させる.",
    examples: [verbExample("言わせる", "make/let (someone) say (causative of 言う)"), verbExample("思わせる", "make (someone) think (causative of 思う)")],
    conjugationForm: "causative",
  },
  {
    header: "Causative-passive (使役受身形)",
    explanation:
      "\"Made to do X\" — combines causative + passive: someone was forced/made to do something, " +
      "usually against their will. Add られる to the causative stem (言わせる -> 言わせられる); godan " +
      "verbs not ending in す commonly contract this to される (言わせられる -> 言わされる, both correct).",
    examples: [
      verbExample("言わせられる（言わされる）", "was made to say (causative-passive of 言う)"),
      verbExample("思わせられる", "was made to think (causative-passive of 思う)"),
    ],
    conjugationForm: "causativePassive",
  },
];

// One-time content fix: the Passive card originally described passive
// as "is done (to me)" — misleading, since that's only the "suffering/
// indirect passive" reading, not plain passive (e.g. "this book was
// written long ago" has no implied "me"). Patches any already-seeded
// note still carrying that exact old text, regardless of the
// conjugationCardsSeeded gate below (which would otherwise skip it
// entirely once seeding has already happened once).
const STALE_PASSIVE_EXPLANATION_PREFIX = '"Is/was done (to me)"';
function fixStalePassiveExplanation() {
  const notes = readJSON(STORAGE_KEYS.grammarNotes, []);
  let changed = false;
  notes.forEach((n) => {
    if (n.conjugationForm === "passive" && (n.explanation || "").startsWith(STALE_PASSIVE_EXPLANATION_PREFIX)) {
      const fresh = CONJUGATION_STARTER_CARDS.find((c) => c.conjugationForm === "passive");
      if (fresh) {
        n.explanation = fresh.explanation;
        changed = true;
      }
    }
  });
  if (changed) writeJSON(STORAGE_KEYS.grammarNotes, notes);
}

function ensureDefaultConjugationCards(language) {
  if (language !== "ja") return; // this feature is Japanese-specific
  fixStalePassiveExplanation();

  const seeded = readJSON(STORAGE_KEYS.conjugationCardsSeeded, []);
  if (seeded.includes(language)) return;

  ensureDefaultGrammarThemes(language); // guarantees the target folder exists
  const themes = getGrammarThemes(language);
  const folder = themes.find((t) => (t.name || "").toLowerCase() === "tenses and verb conjugations");
  if (!folder) return; // shouldn't happen, but don't crash if it somehow does

  const existingForms = new Set(
    getGrammarNotes(folder.id)
      .map((n) => n.conjugationForm)
      .filter(Boolean)
  );
  CONJUGATION_STARTER_CARDS.forEach((card) => {
    if (existingForms.has(card.conjugationForm)) return;
    addGrammarNote({
      themeId: folder.id,
      header: card.header,
      explanation: card.explanation,
      examples: card.examples,
      variants: [],
      tags: ["conjugation"],
      practiceType: "conjugation",
      conjugationForm: card.conjugationForm,
      grammarLabel: null,
      grammarLabelNote: "",
    });
  });

  seeded.push(language);
  writeJSON(STORAGE_KEYS.conjugationCardsSeeded, seeded);
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
  getVerbWords,
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
  updatePassage,
  getReadingFolders,
  getReadingFolder,
  addReadingFolder,
  getGrammarThemes,
  getGrammarTheme,
  addGrammarTheme,
  updateGrammarTheme,
  deleteGrammarTheme,
  ensureDefaultGrammarThemes,
  ensureDefaultConjugationCards,
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
  logout,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = Storage;
} else {
  window.Storage = Storage;
}
