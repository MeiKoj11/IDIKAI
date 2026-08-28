/*
  reading-app.js
  --------------
  The Reading bubble: save passages, then read them with click-to-look-up
  (reusing the same Claude/MyMemory backend as Vocab Bank) and a
  one-click "add to a Vocab Bank theme" from the lookup result.

  Spanish passages are tokenized into whitespace-delimited words, each
  individually clickable. Japanese has no spaces, so real word
  segmentation is a much harder problem — instead, each individual KANJI
  character is made clickable, and the backend figures out (from
  context) what word/compound it's actually part of. Hiragana/katakana
  aren't individually interactive yet. See handleKanjiClick() below.
*/

const NEW_THEME_VALUE = "__new_theme__";
const GRAMMAR_NEW_THEME_VALUE = "__new_grammar_theme__";
const READING_NEW_FOLDER_VALUE = "__new_reading_folder__";
const READING_NO_FOLDER_VALUE = ""; // "no folder" in the create form — just an uncategorized/random passage
const READING_FILTER_NO_FOLDER_VALUE = "__no_folder__"; // "only uncategorized" in the filter dropdown
const READING_FILTER_ALL_VALUE = ""; // "all folders" in the filter dropdown

let currentPassage = null;
let selectedWord = null; // the word currently shown in the lookup panel
// AI-generated example sentences currently pending a save — cleared/replaced
// whenever a lookup panel is reopened for a new word, and attached to the
// word record only if "Save to vocab"/"Add to theme" is actually clicked.
let pendingVocabExamples = null;
let pendingLookupExamples = null;
// The language context for reading.html (from ?lang=es|ja) — filters the
// passage list, sets the new-passage default language, and picks the
// OCR language pack. passage.html doesn't need this: it reads the
// language straight off the loaded passage instead (authoritative).
let activeReadingLang = null;
// Which folder the passage list is currently filtered to — purely
// organizational, same idea as Vocab Bank themes / Grammar folders, but
// optional (a passage without a folder is just uncategorized).
let activeFolderFilter = READING_FILTER_ALL_VALUE;

const READING_LANGUAGE_NAMES = { es: "Spanish", ja: "Japanese", fr: "French" };

document.addEventListener("DOMContentLoaded", () => {
  const langParam = new URLSearchParams(window.location.search).get("lang");
  if (SUPPORTED_LANGUAGES.includes(langParam)) {
    activeReadingLang = langParam;
    const heading = document.getElementById("reading-heading");
    if (heading) heading.textContent = `${READING_LANGUAGE_NAMES[langParam]} Reading`;
    const backLink = document.getElementById("reading-back-link");
    if (backLink) backLink.href = `language-home.html?lang=${langParam}`;
    const header = document.getElementById("reading-header");
    if (header) header.classList.add(`lang-${langParam}`);
    const textLabel = document.getElementById("passage-text-label");
    if (textLabel) textLabel.textContent = `Text (${READING_LANGUAGE_NAMES[langParam]})`;
    const intro = document.getElementById("passages-intro");
    if (intro) {
      intro.textContent =
        langParam === "ja"
          ? "Paste in a piece of Japanese text — a song, an article, whatever you're studying — and click any kanji while reading to look it up and save it straight to a Vocab Bank theme."
          : `Paste in a piece of ${READING_LANGUAGE_NAMES[langParam]} text — a song, an article, whatever you're studying — and click any word while reading to look it up and save it straight to a Vocab Bank theme.`;
    }
  }

  renderPassageFolderFilter();
  renderPassageFolderSelect();
  renderPassageList();

  const folderFilterSelect = document.getElementById("passage-folder-filter");
  if (folderFilterSelect) folderFilterSelect.addEventListener("change", handlePassageFolderFilterChange);

  const folderSelect = document.getElementById("passage-folder-select");
  if (folderSelect) folderSelect.addEventListener("change", handlePassageFolderSelectChange);

  const newFolderBtn = document.getElementById("passage-new-folder-btn");
  if (newFolderBtn) newFolderBtn.addEventListener("click", createPassageFolder);

  const form = document.getElementById("new-passage-form");
  if (form) form.addEventListener("submit", handleNewPassageSubmit);

  const imageInput = document.getElementById("passage-image-input");
  if (imageInput) imageInput.addEventListener("change", handlePassageImageSelected);

  const dropzone = document.getElementById("image-dropzone");
  if (dropzone) {
    // dragover must be prevented for drop to fire at all.
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("dragover");
    });
    dropzone.addEventListener("drop", handlePassageImageDrop);
  }

  const escalateBtn = document.getElementById("escalate-to-claude-ocr");
  if (escalateBtn) escalateBtn.addEventListener("click", handleEscalateToClaudeOcr);

  const passageId = new URLSearchParams(window.location.search).get("id");
  if (passageId) {
    currentPassage = Storage.getPassage(passageId);
    if (currentPassage) {
      document.getElementById("passage-title-heading").textContent = currentPassage.title;
      const readerHint = document.getElementById("reader-hint");
      if (readerHint) {
        readerHint.textContent =
          currentPassage.language === "ja"
            ? "Click any kanji to look it up. Drag to select a phrase or sentence to save a grammar note."
            : "Click any word to look it up. Drag to select a phrase or sentence to save a grammar note.";
      }
      renderPassageReader();
      renderThemeOptions();
      renderSideNotesList();
      updateGrammarNoteCount();
    } else {
      const notFoundEl = document.getElementById("passage-text-display");
      notFoundEl.textContent = "Passage not found.";
      notFoundEl.dataset.immersionKey = "passageNotFoundText";
    }
  }

  const addBtn = document.getElementById("add-looked-up-word");
  if (addBtn) addBtn.addEventListener("click", handleAddLookedUpWord);

  const lookupExamplesBtn = document.getElementById("lookup-generate-examples-btn");
  if (lookupExamplesBtn) lookupExamplesBtn.addEventListener("click", handleGenerateLookupExamplesClick);

  const vocabExamplesBtn = document.getElementById("vocab-generate-examples-btn");
  if (vocabExamplesBtn) vocabExamplesBtn.addEventListener("click", handleGenerateVocabExamplesClick);

  const deleteBtn = document.getElementById("delete-passage");
  if (deleteBtn) deleteBtn.addEventListener("click", handleDeletePassage);

  const themeSelect = document.getElementById("add-to-theme-select");
  if (themeSelect) themeSelect.addEventListener("change", handleThemeSelectChange);

  const newThemeBtn = document.getElementById("add-to-theme-new-theme-btn");
  if (newThemeBtn) newThemeBtn.addEventListener("click", createReadingLookupTheme);

  const readerContainer = document.getElementById("passage-text-display");
  if (readerContainer) readerContainer.addEventListener("mouseup", handlePassageSelection);

  const saveGrammarBtn = document.getElementById("save-grammar-note");
  if (saveGrammarBtn) saveGrammarBtn.addEventListener("click", handleSaveGrammarNoteClick);

  const saveGrammarPhraseAsVocabBtn = document.getElementById("save-grammar-phrase-as-vocab");
  if (saveGrammarPhraseAsVocabBtn) saveGrammarPhraseAsVocabBtn.addEventListener("click", handleSaveGrammarPhraseAsVocabClick);

  const toggleBtn = document.getElementById("toggle-grammar-panel");
  if (toggleBtn) toggleBtn.addEventListener("click", toggleGrammarSidePanel);

  const closeBtn = document.getElementById("close-grammar-panel");
  if (closeBtn) closeBtn.addEventListener("click", closeGrammarSidePanel);

  const cancelBtn = document.getElementById("cancel-side-note");
  if (cancelBtn) cancelBtn.addEventListener("click", hideSideNoteForm);

  const sideForm = document.getElementById("side-grammar-note-form");
  if (sideForm) sideForm.addEventListener("submit", handleSideNoteFormSubmit);

  const revealKanjiBtn = document.getElementById("reveal-kanji-meaning");
  if (revealKanjiBtn) revealKanjiBtn.addEventListener("click", handleRevealKanjiMeaning);

  const addKanjiBtn = document.getElementById("add-kanji-to-vocab");
  if (addKanjiBtn) addKanjiBtn.addEventListener("click", handleAddKanjiToVocabClick);

  const showKanjiBtn = document.getElementById("show-kanji-in-vocab");
  if (showKanjiBtn) showKanjiBtn.addEventListener("click", handleShowKanjiInVocabClick);

  const vocabAddForm = document.getElementById("vocab-add-form");
  if (vocabAddForm) vocabAddForm.addEventListener("submit", handleVocabAddFormSubmit);

  const vocabThemeSelect = document.getElementById("vocab-add-theme-select");
  if (vocabThemeSelect) vocabThemeSelect.addEventListener("change", handleVocabAddThemeSelectChange);

  const newVocabThemeBtn = document.getElementById("vocab-add-new-theme-btn");
  if (newVocabThemeBtn) newVocabThemeBtn.addEventListener("click", createVocabAddTheme);

  const cancelVocabBtn = document.getElementById("cancel-vocab-add");
  if (cancelVocabBtn) cancelVocabBtn.addEventListener("click", handleCancelVocabAdd);

  const sideThemeSelect = document.getElementById("side-note-theme-select");
  if (sideThemeSelect) sideThemeSelect.addEventListener("change", handleSideThemeSelectChange);

  const newSideFolderBtn = document.getElementById("side-note-new-folder-btn");
  if (newSideFolderBtn) newSideFolderBtn.addEventListener("click", createGrammarSideFolder);

  initSplitResize();

  // Global topbar — reading.html's list uses activeReadingLang (from
  // ?lang=), passage.html has no such filter but knows its own passage's
  // language directly once loaded.
  initTopbar(activeReadingLang || (currentPassage ? currentPassage.language : null));
  if (typeof initHubTasks === "function") {
    initHubTasks(activeReadingLang || (currentPassage ? currentPassage.language : null));
  }

  if (currentPassage) {
    initAppTabs({
      section: "reading",
      language: currentPassage.language,
      label: currentPassage.title || "Untitled passage",
      href: `passage.html?id=${encodeURIComponent(currentPassage.id)}`,
    });
  } else if (document.getElementById("passage-list") && activeReadingLang) {
    initAppTabs({
      section: "reading",
      language: activeReadingLang,
      label: `${READING_LANGUAGE_NAMES[activeReadingLang]} Reading`,
      href: `reading.html?lang=${activeReadingLang}`,
    });
  } else {
    initAppTabs(null);
  }
});

// ---------------------------------------------------------------------
// Passage list + creation
// ---------------------------------------------------------------------

// Whitespace word-counting doesn't mean much for Japanese (no spaces),
// so that badge shows a character count there instead.
function wordCount(text, lang) {
  if (lang === "ja") return text.replace(/\s+/g, "").length;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function renderPassageList() {
  const list = document.getElementById("passage-list");
  if (!list) return;
  const allPassages = Storage.getPassages();
  let passages = activeReadingLang ? allPassages.filter((p) => p.language === activeReadingLang) : allPassages;
  if (activeFolderFilter === READING_FILTER_NO_FOLDER_VALUE) {
    passages = passages.filter((p) => !p.folderId);
  } else if (activeFolderFilter) {
    passages = passages.filter((p) => p.folderId === activeFolderFilter);
  }
  list.innerHTML = "";

  if (passages.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-hint";
    if (activeFolderFilter && activeFolderFilter !== READING_FILTER_ALL_VALUE) {
      li.textContent = "No passages in this folder yet.";
      li.dataset.immersionKey = "noPassagesInFolderYetText";
    } else if (activeReadingLang) {
      // Mixes a static hint with the language name — too many interpolated
      // combinations to give a fixed translation key, so this one variant
      // is left in English by design (matches the pattern used for other
      // dynamic/interpolated messages across the app).
      li.textContent = `No ${READING_LANGUAGE_NAMES[activeReadingLang]} passages yet — paste some text below to get started.`;
    } else {
      li.textContent = "No passages yet — paste some text below to get started.";
      li.dataset.immersionKey = "noPassagesYetText";
    }
    list.appendChild(li);
    return;
  }

  passages.forEach((p) => {
    const li = document.createElement("li");
    li.className = `theme-item lang-${p.language}`; // reuse the same card look as theme cards
    li.addEventListener("click", () => {
      window.location.href = `passage.html?id=${encodeURIComponent(p.id)}`;
    });

    const nameEl = document.createElement("span");
    nameEl.className = "theme-name";
    nameEl.textContent = p.title;
    li.appendChild(nameEl);

    const meta = document.createElement("span");
    meta.className = "theme-meta";

    const folder = p.folderId ? Storage.getReadingFolder(p.folderId) : null;
    if (folder) {
      const folderBadge = document.createElement("span");
      folderBadge.className = "folder-badge";
      folderBadge.textContent = folder.name;
      meta.appendChild(folderBadge);
    }

    const countBadge = document.createElement("span");
    countBadge.className = "word-count-badge";
    const count = wordCount(p.text, p.language);
    countBadge.textContent = p.language === "ja" ? `${count} characters` : `${count} words`;
    meta.appendChild(countBadge);
    li.appendChild(meta);

    list.appendChild(li);
  });
}

// The folder FILTER above the passage list — "All folders", "No folder"
// (uncategorized passages), then each real folder. Purely a view
// filter, so it never offers "+ New folder" — that's only on the create
// form below.
function renderPassageFolderFilter() {
  const select = document.getElementById("passage-folder-filter");
  if (!select) return;
  select.innerHTML = "";

  const allOpt = document.createElement("option");
  allOpt.value = READING_FILTER_ALL_VALUE;
  allOpt.textContent = "All folders";
  allOpt.dataset.immersionKey = "allFoldersOption";
  select.appendChild(allOpt);

  const noneOpt = document.createElement("option");
  noneOpt.value = READING_FILTER_NO_FOLDER_VALUE;
  noneOpt.textContent = "No folder (random passages)";
  noneOpt.dataset.immersionKey = "noFolderRandomPassagesOption";
  select.appendChild(noneOpt);

  const folders = Storage.getReadingFolders(activeReadingLang || undefined);
  folders.forEach((folder) => {
    const opt = document.createElement("option");
    opt.value = folder.id;
    opt.textContent = folder.name;
    select.appendChild(opt);
  });

  select.value = activeFolderFilter;
}

function handlePassageFolderFilterChange(e) {
  activeFolderFilter = e.target.value;
  renderPassageList();
}

// The folder select on the CREATE form — "No folder (random passage)" is
// the default so passage creation works exactly as it always has if you
// don't care about organizing this one, plus "+ New folder…" to set one
// up inline without leaving this page.
function renderPassageFolderSelect(selectedId) {
  const select = document.getElementById("passage-folder-select");
  if (!select) return;
  select.innerHTML = "";

  const noneOpt = document.createElement("option");
  noneOpt.value = READING_NO_FOLDER_VALUE;
  noneOpt.textContent = "No folder (random passage)";
  noneOpt.dataset.immersionKey = "noFolderRandomPassageOption";
  select.appendChild(noneOpt);

  const folders = Storage.getReadingFolders(activeReadingLang || undefined);
  folders.forEach((folder) => {
    const opt = document.createElement("option");
    opt.value = folder.id;
    opt.textContent = folder.name;
    select.appendChild(opt);
  });

  const newOpt = document.createElement("option");
  newOpt.value = READING_NEW_FOLDER_VALUE;
  newOpt.textContent = "+ New folder…";
  newOpt.dataset.immersionKey = "newFolderOption";
  select.appendChild(newOpt);

  select.value = selectedId || READING_NO_FOLDER_VALUE;
}

// Does the actual prompt+save+re-render — called both from the select's
// "change" event (picking "+ New folder…" when other folders already
// exist) AND directly from a dedicated "+ New" button (see
// #passage-new-folder-btn) that works no matter what the select's
// current value is. That button exists specifically because a <select>
// with only ONE option (cold start, no folders yet) never fires "change"
// when you "pick" the option that was already selected by default — the
// button sidesteps that entirely instead of relying on a submit-time
// fallback.
function createPassageFolder() {
  const name = prompt("Name for the new folder:");
  if (!name || !name.trim()) {
    renderPassageFolderSelect(READING_NO_FOLDER_VALUE);
    return;
  }

  const folder = Storage.addReadingFolder(name.trim(), activeReadingLang || "es");
  renderPassageFolderSelect(folder.id);
  renderPassageFolderFilter();
}

function handlePassageFolderSelectChange(e) {
  if (e.target.value !== READING_NEW_FOLDER_VALUE) return;
  createPassageFolder();
}

function handleNewPassageSubmit(e) {
  e.preventDefault();
  const titleInput = document.getElementById("passage-title");
  const textInput = document.getElementById("passage-text");
  const title = titleInput.value.trim();
  const text = textInput.value.trim();

  if (!title || !text) {
    alert("Give the passage a title and paste some text.");
    return;
  }

  const folderSelect = document.getElementById("passage-folder-select");
  let folderId = folderSelect ? folderSelect.value : READING_NO_FOLDER_VALUE;
  if (folderId === READING_NEW_FOLDER_VALUE) {
    // Same cold-start case as the other folder/theme selects: if
    // "+ New folder…" is somehow still selected at submit time (e.g. the
    // prompt above was cancelled), just treat this passage as
    // uncategorized rather than blocking the save.
    folderId = READING_NO_FOLDER_VALUE;
  }

  const passage = Storage.addPassage({
    title,
    text,
    language: activeReadingLang || "es",
    folderId: folderId || null,
  });
  window.location.href = `passage.html?id=${encodeURIComponent(passage.id)}`;
}

// Reads a File as a data URL and splits it into the raw base64 payload
// plus its MIME type — what the backend's vision call needs.
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result; // "data:image/png;base64,AAAA..."
      const commaIndex = dataUrl.indexOf(",");
      resolve({ base64: dataUrl.slice(commaIndex + 1), mediaType: file.type || "image/png" });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Screenshot -> text runs in two tiers:
//   1. Local OCR (Tesseract.js, in-browser, free, works on anything
//      including copyrighted book pages since nothing leaves your
//      computer) runs first, always.
//   2. If Tesseract's own confidence score comes back low (a messy,
//      angled, or low-res screenshot), we keep its best-effort text but
//      offer a button to re-read it with Claude's vision model instead,
//      which is far more accurate but costs a small amount of API usage
//      and can't be used for verbatim copyrighted text.
// This keeps the common case (clean screenshots of things you're
// allowed to reproduce) free and fast, while still making the more
// accurate option one click away when it's actually needed.
const LOCAL_OCR_CONFIDENCE_THRESHOLD = 70; // Tesseract's 0-100 mean-confidence score.

let tesseractWorker = null; // lazy singleton, reused across uploads on this page
let tesseractWorkerLang = null; // which OCR language pack it was created with
let lastUploadedImageFile = null; // so the "try Claude instead" button can reuse it

const TESSERACT_LANG_CODES = { es: "spa", ja: "jpn", fr: "fra" };

async function getTesseractWorker() {
  if (typeof Tesseract === "undefined") {
    throw new Error("Local text reader didn't load (check your internet connection).");
  }
  const wantedLang = TESSERACT_LANG_CODES[activeReadingLang] || "spa";
  if (!tesseractWorker || tesseractWorkerLang !== wantedLang) {
    tesseractWorker = await Tesseract.createWorker(wantedLang);
    tesseractWorkerLang = wantedLang;
  }
  return tesseractWorker;
}

// Returns { text, confidence } — confidence is Tesseract's own 0-100
// mean-confidence score for the recognition.
async function runLocalOcr(file) {
  const worker = await getTesseractWorker();
  const { data } = await worker.recognize(file);
  return {
    text: (data.text || "").trim(),
    confidence: typeof data.confidence === "number" ? data.confidence : 0,
  };
}

// Returns { text, error } — the existing Claude vision backend call.
async function runClaudeOcr(file) {
  const { base64, mediaType } = await fileToBase64(file);
  return Translate.extractTextFromImage(base64, mediaType);
}

function setImageStatus(message) {
  const status = document.getElementById("image-extract-status");
  if (status) {
    status.hidden = false;
    status.textContent = message;
  }
}

function showEscalateButton(show) {
  const btn = document.getElementById("escalate-to-claude-ocr");
  if (btn) btn.hidden = !show;
}

function fillPassageTextarea(text, { replace } = {}) {
  const textarea = document.getElementById("passage-text");
  if (!textarea) return;
  if (replace || !textarea.value.trim()) {
    textarea.value = text;
  } else {
    textarea.value = `${textarea.value.trim()}\n\n${text}`;
  }
}

// Shared by both the file-picker input and drag-and-drop.
async function processImageFile(file) {
  if (!file) return;
  if (!file.type || !file.type.startsWith("image/")) {
    setImageStatus("That doesn't look like an image — drop or choose a screenshot instead.");
    return;
  }

  lastUploadedImageFile = file;
  showEscalateButton(false);
  setImageStatus("Reading text locally…");

  try {
    const { text, confidence } = await runLocalOcr(file);
    if (!text) {
      setImageStatus("Couldn't find any readable text locally — you can try Claude's more accurate reader instead.");
      showEscalateButton(true);
      return;
    }

    fillPassageTextarea(text);
    if (confidence >= LOCAL_OCR_CONFIDENCE_THRESHOLD) {
      setImageStatus("Text read locally — check it over before saving.");
    } else {
      setImageStatus(
        "This screenshot looks a bit tricky to read, so the text above is a best-effort local guess — " +
          "want a more accurate pass?"
      );
      showEscalateButton(true);
    }
  } catch (err) {
    console.error("Local OCR failed:", err);
    setImageStatus(`Local text reading failed (${err.message || "unknown error"}) — try Claude's reader instead.`);
    showEscalateButton(true);
  }
}

// Manually-triggered second pass using Claude's vision model — more
// accurate, but costs a small amount of API usage and won't work on
// verbatim copyrighted text (e.g. book excerpts).
async function handleEscalateToClaudeOcr() {
  if (!lastUploadedImageFile) return;
  showEscalateButton(false);
  setImageStatus("Asking Claude to read the image (more accurate, small API cost)…");

  try {
    const { text, error } = await runClaudeOcr(lastUploadedImageFile);
    if (!text) {
      setImageStatus(`Claude couldn't read it either — ${error || "unknown error"}`);
      showEscalateButton(true);
      return;
    }
    fillPassageTextarea(text, { replace: true });
    setImageStatus("Text filled in below using Claude's reader — check it over before saving.");
  } catch (err) {
    console.error("Claude OCR failed:", err);
    setImageStatus(`Claude couldn't read it either — ${err.message || "unknown error"}`);
    showEscalateButton(true);
  }
}

async function handlePassageImageSelected(e) {
  const file = e.target.files && e.target.files[0];
  await processImageFile(file);
  e.target.value = ""; // allow re-selecting the same file later
}

async function handlePassageImageDrop(e) {
  e.preventDefault();
  const dropzone = document.getElementById("image-dropzone");
  if (dropzone) dropzone.classList.remove("dragover");
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  await processImageFile(file);
}

function handleDeletePassage() {
  if (!currentPassage) return;
  if (!confirm(`Delete "${currentPassage.title}"? This can't be undone.`)) return;
  Storage.deletePassage(currentPassage.id);
  window.location.href = "reading.html";
}

// ---------------------------------------------------------------------
// Reader — click any word to look it up
// ---------------------------------------------------------------------

// Text pasted from PDFs, apps, or websites often has a hard line break
// at every wrapped line, not just at actual paragraph breaks — rendered
// verbatim that looks like the passage randomly breaks mid-sentence.
// This collapses those "fake" single line breaks into spaces while
// keeping real paragraph breaks (a blank line) intact.
function normalizeWhitespace(text, lang) {
  // Spanish: wrapped lines get joined back with a space. Japanese has no
  // spaces between words at all, so a "line wrap" and a real line break
  // look identical — joining with "" (nothing) is the only option that
  // doesn't invent spaces in the middle of words.
  const joiner = lang === "ja" ? "" : " ";
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((para) => para.replace(/\s*\n\s*/g, joiner).replace(/[ \t]+/g, lang === "ja" ? "" : " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

// Splits a single paragraph into alternating whitespace / non-whitespace
// tokens so it can be re-joined exactly, while still making each word
// (letters, plus any attached punctuation) individually clickable.
function tokenizePassage(text) {
  return text.split(/(\s+)/);
}

// Strips leading/trailing punctuation so "hablo." looks up "hablo".
// \p{L} = any Unicode letter, so accented Spanish letters count.
function stripPunctuation(token) {
  return token.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
}

// Kanji (CJK Unified Ideographs, plus the Extension A block used for
// some rarer ones) — this is what's individually clickable in Japanese
// passages. Hiragana/katakana fall outside these ranges and are left as
// plain (non-interactive) text alongside the kanji spans.
function isKanji(char) {
  return /[一-鿿㐀-䶿]/.test(char);
}

// The backend needs a sentence, not the whole passage, to correctly
// identify which compound a clicked kanji belongs to. Since Japanese
// doesn't reliably space-delimit anything, this just walks outward from
// the click to the nearest sentence-ending punctuation (。！？, or a
// paragraph edge) on either side.
function extractJapaneseSentenceContext(paragraphText, charIndex) {
  const enders = "。！？";
  let start = 0;
  for (let i = charIndex - 1; i >= 0; i--) {
    if (enders.includes(paragraphText[i])) {
      start = i + 1;
      break;
    }
  }
  let end = paragraphText.length;
  for (let i = charIndex; i < paragraphText.length; i++) {
    if (enders.includes(paragraphText[i])) {
      end = i + 1;
      break;
    }
  }
  return paragraphText.slice(start, end).trim();
}

// Japanese paragraphs render character-by-character: every kanji becomes
// its own clickable span (context resolved per-click via the backend,
// see handleKanjiClick), everything else (hiragana, katakana, punctuation)
// is plain text.
function renderJapaneseParagraph(paragraphText) {
  const p = document.createElement("p");
  Array.from(paragraphText).forEach((char, index) => {
    if (!isKanji(char)) {
      p.appendChild(document.createTextNode(char));
      return;
    }
    const span = document.createElement("span");
    span.className = "clickable-word clickable-kanji";
    span.textContent = char;
    span.dataset.kanji = char;
    const context = extractJapaneseSentenceContext(paragraphText, index);
    span.addEventListener("click", () => handleKanjiClick(span, char, context));
    p.appendChild(span);
  });
  return p;
}

function renderPassageReader() {
  const container = document.getElementById("passage-text-display");
  if (!container || !currentPassage) return;

  container.innerHTML = "";
  const lang = currentPassage.language;
  const paragraphs = normalizeWhitespace(currentPassage.text, lang).split(/\n\n/);

  paragraphs.forEach((paragraphText) => {
    if (lang === "ja") {
      container.appendChild(renderJapaneseParagraph(paragraphText));
      return;
    }
    const p = document.createElement("p");
    tokenizePassage(paragraphText).forEach((token) => {
      const core = stripPunctuation(token);
      if (!token || !core) {
        p.appendChild(document.createTextNode(token));
        return;
      }
      const span = document.createElement("span");
      span.className = "clickable-word";
      span.textContent = token;
      span.dataset.word = core;
      span.addEventListener("click", () => handleWordClick(span, core));
      p.appendChild(span);
    });
    container.appendChild(p);
  });
}

// Builds the "grammar" caption for a recognized conjugated verb form,
// e.g. "saber (to know) — imperfect subjunctive, yo".
function formatConjugationInfo(ci) {
  const parts = [`${ci.infinitive} (${ci.infinitiveEnglish})`, ci.tense];
  if (ci.person) parts[1] = `${ci.tense}, ${ci.person}`;
  return parts.join(" — ");
}

async function handleWordClick(span, word) {
  document.querySelectorAll(".clickable-word.selected").forEach((el) => el.classList.remove("selected"));
  span.classList.add("selected");
  selectedWord = word;

  const grammarPanel = document.getElementById("grammar-panel");
  if (grammarPanel) grammarPanel.hidden = true;

  const panel = document.getElementById("lookup-panel");
  panel.hidden = false;
  document.getElementById("lookup-word").textContent = word;
  const lookupResultEl = document.getElementById("lookup-result");
  lookupResultEl.textContent = "Looking up…";
  lookupResultEl.dataset.immersionKey = "lookingUpStatus";
  document.getElementById("lookup-grammar").textContent = "";
  document.getElementById("add-looked-up-word").hidden = true;

  // A fresh lookup invalidates any examples generated for whatever word
  // was shown here before.
  pendingLookupExamples = null;
  const examplesBtn = document.getElementById("lookup-generate-examples-btn");
  const examplesStatus = document.getElementById("lookup-examples-status");
  const examplesList = document.getElementById("lookup-examples-list");
  if (examplesBtn) examplesBtn.hidden = true;
  if (examplesStatus) {
    examplesStatus.hidden = true;
    examplesStatus.textContent = "";
    delete examplesStatus.dataset.immersionKey;
  }
  if (examplesList) {
    examplesList.hidden = true;
    examplesList.innerHTML = "";
  }

  // Was hardcoded to "es" — harmless while Spanish was the only non-
  // Japanese language, but wrong for any other passage language (e.g.
  // French), so it now reads the passage's own language.
  const wordClickLang = (currentPassage && currentPassage.language) || "es";
  const result = await Translate.lookupTranslation(word, wordClickLang, "en");
  if (!result || !result.translation) {
    const noResultEl = document.getElementById("lookup-result");
    noResultEl.textContent = "No translation found — you can still add it manually from Vocab Bank.";
    noResultEl.dataset.immersionKey = "noTranslationFoundHint";
    return;
  }

  // This is the actual looked-up translation (dynamic, user-facing data,
  // not app UI chrome) — must NOT carry over the "lookingUpStatus" key
  // from above, or immersion mode would incorrectly overwrite it.
  const finalResultEl = document.getElementById("lookup-result");
  delete finalResultEl.dataset.immersionKey;
  finalResultEl.textContent = result.translation;
  document.getElementById("add-looked-up-word").dataset.english = result.translation;
  document.getElementById("add-looked-up-word").hidden = false;
  if (examplesBtn) examplesBtn.hidden = false;

  if (result.conjugationInfo) {
    document.getElementById("lookup-grammar").textContent = formatConjugationInfo(result.conjugationInfo);
    document.getElementById("add-looked-up-word").dataset.grammar = formatConjugationInfo(result.conjugationInfo);
    document.getElementById("add-looked-up-word").dataset.infinitive = result.conjugationInfo.infinitive || "";
    document.getElementById("add-looked-up-word").dataset.infinitiveEnglish = result.conjugationInfo.infinitiveEnglish || "";
  } else {
    delete document.getElementById("add-looked-up-word").dataset.grammar;
    delete document.getElementById("add-looked-up-word").dataset.infinitive;
    delete document.getElementById("add-looked-up-word").dataset.infinitiveEnglish;
  }
}

async function handleGenerateLookupExamplesClick() {
  if (!selectedWord) return;
  const status = document.getElementById("lookup-examples-status");
  const list = document.getElementById("lookup-examples-list");
  const meaning = document.getElementById("add-looked-up-word").dataset.english || "";
  list.hidden = true;
  list.innerHTML = "";
  status.hidden = false;
  status.textContent = "Generating…";
  status.dataset.immersionKey = "generatingExamplesStatus";

  const examplesLang = (currentPassage && currentPassage.language) || "es";
  const { examples, error } = await Translate.generateExampleSentences(selectedWord, examplesLang, meaning);

  if (!examples) {
    console.error("generate-examples failed:", error);
    status.textContent = "Couldn't generate examples — try again.";
    status.dataset.immersionKey = "generateExamplesFailedHint";
    pendingLookupExamples = null;
    return;
  }

  status.hidden = true;
  status.textContent = "";
  delete status.dataset.immersionKey;
  pendingLookupExamples = examples;
  renderExamplesList(list, examples);
}

// ---------------------------------------------------------------------
// Kanji lookup (Japanese passages only) — click any kanji for its
// furigana/meaning (resolved as part of whatever word/compound it's
// actually in, via the surrounding sentence), then either add it
// straight to the Vocab Bank or, if it's already saved, jump to it.
// ---------------------------------------------------------------------

// Scans every saved word in every Japanese theme for one whose target-
// language side is (or contains) this word/compound — used both to show
// the "you already know this!" notice and to power "show in vocab".
function findExistingJapaneseWord(word) {
  if (!word) return null;
  const japaneseThemeIds = new Set(Storage.getThemes().filter((t) => t.language === "ja").map((t) => t.id));
  const match = Storage.getWords().find(
    (w) => japaneseThemeIds.has(w.themeId) && w.targetLang && w.targetLang.trim() === word.trim()
  );
  if (!match) return null;
  return { word: match, theme: Storage.getTheme(match.themeId) };
}

// Fills in the furigana/meaning text for a lookup result — split out
// from runKanjiLookup so the "already in your deck" path can call this
// only once the learner asks to reveal it (see handleRevealKanjiMeaning)
// instead of immediately.
//
// When exactly one kanji was clicked and it turned out to be part of a
// larger compound, the character's own standalone meaning (kanjiMeaning)
// is genuinely different information from the compound's combined
// meaning — showing only the compound meaning made it look like that
// was the character's own meaning, which it usually isn't. Both get
// shown, clearly labeled apart.
function displayKanjiResult(kanji, result) {
  const charMeaningEl = document.getElementById("kanji-char-meaning");
  const meaningEl = document.getElementById("kanji-meaning");
  // Always dynamic, looked-up content from here on — clear any leftover
  // "lookingUpStatus" key so immersion mode doesn't mistranslate it.
  delete meaningEl.dataset.immersionKey;
  document.getElementById("kanji-furigana").textContent = result.furigana || "";

  const isSingleChar = Array.from(kanji).length === 1;
  const isPartOfLargerWord = result.word && result.word !== kanji;

  if (isSingleChar && isPartOfLargerWord && result.kanjiMeaning) {
    charMeaningEl.hidden = false;
    charMeaningEl.textContent = `${kanji} by itself: ${result.kanjiMeaning}`;
    meaningEl.textContent = `As part of ${result.word}: ${result.meaning || ""}`;
  } else {
    charMeaningEl.hidden = true;
    charMeaningEl.textContent = "";
    meaningEl.textContent = result.meaning || "";
  }
}

// Shared by both a single-kanji click and a drag-selected kanji
// compound (see handleKanjiSelectionLookup below) — "kanji" here can be
// one character or a short run of them, "context" is the sentence
// they're part of.
async function runKanjiLookup(kanji, context) {
  const grammarPanel = document.getElementById("grammar-panel");
  if (grammarPanel) grammarPanel.hidden = true;
  const wordPanel = document.getElementById("lookup-panel");
  if (wordPanel) wordPanel.hidden = true;

  const panel = document.getElementById("kanji-panel");
  if (!panel) return;
  panel.hidden = false;
  document.getElementById("kanji-char").textContent = kanji;
  document.getElementById("kanji-furigana").textContent = "";
  document.getElementById("kanji-char-meaning").hidden = true;
  const kanjiMeaningEl = document.getElementById("kanji-meaning");
  kanjiMeaningEl.textContent = "Looking up…";
  kanjiMeaningEl.dataset.immersionKey = "lookingUpStatus";
  const notice = document.getElementById("kanji-deck-notice");
  notice.hidden = true;
  document.getElementById("add-kanji-to-vocab").hidden = true;
  document.getElementById("show-kanji-in-vocab").hidden = true;
  const revealBtn = document.getElementById("reveal-kanji-meaning");
  revealBtn.hidden = true;

  const result = await Translate.lookupKanji(kanji, context);
  if (!result || !result.word) {
    // Show the real reason when we have one (server unreachable, server
    // error, empty result, etc) instead of always blaming the server —
    // the server can easily be running fine and this endpoint still
    // failed for its own reason.
    const failedMeaningEl = document.getElementById("kanji-meaning");
    delete failedMeaningEl.dataset.immersionKey;
    failedMeaningEl.textContent = (result && result.error) || "No lookup found — check the server is running.";
    return;
  }

  const addBtn = document.getElementById("add-kanji-to-vocab");
  const showBtn = document.getElementById("show-kanji-in-vocab");
  addBtn.dataset.word = result.word;
  addBtn.dataset.furigana = result.furigana || "";
  addBtn.dataset.meaning = result.meaning || "";
  showBtn.dataset.word = kanji;

  // Deliberately checked against "kanji" (exactly what was clicked or
  // selected) rather than "result.word" (the backend's contextually-
  // resolved compound). Clicking one kanji that's merely PART OF a
  // compound you've saved isn't the same as knowing that compound — e.g.
  // clicking 言 alone shouldn't say "you know this" just because 言葉 is
  // in your deck. Only an exact match — the same combination of kanji
  // you actually saved — counts as "already known".
  const existing = findExistingJapaneseWord(kanji);
  if (existing) {
    // Already-known word: don't hand over the answer straight away —
    // show only the "you know this" nudge and a "Show meaning" button,
    // so the learner has to try recalling it first.
    notice.hidden = false;
    notice.textContent = "You should know this kanji — it's in your deck! Try to recall it before revealing.";
    notice.dataset.immersionKey = "kanjiInDeckNotice";
    showBtn.hidden = false;
    addBtn.hidden = true;
    const clearedMeaningEl = document.getElementById("kanji-meaning");
    delete clearedMeaningEl.dataset.immersionKey;
    clearedMeaningEl.textContent = "";
    revealBtn.hidden = false;
    revealBtn.dataset.kanji = kanji;
    revealBtn.dataset.word = result.word;
    revealBtn.dataset.furigana = result.furigana || "";
    revealBtn.dataset.meaning = result.meaning || "";
    revealBtn.dataset.kanjiMeaning = result.kanjiMeaning || "";
  } else {
    // New word: nothing to test yet, so just show it.
    displayKanjiResult(kanji, result);
    addBtn.hidden = false;
    showBtn.hidden = true;
  }
}

function handleRevealKanjiMeaning() {
  const btn = document.getElementById("reveal-kanji-meaning");
  displayKanjiResult(btn.dataset.kanji || "", {
    word: btn.dataset.word || "",
    furigana: btn.dataset.furigana || "",
    meaning: btn.dataset.meaning || "",
    kanjiMeaning: btn.dataset.kanjiMeaning || "",
  });
  btn.hidden = true;
}

function handleKanjiClick(span, kanji, context) {
  document.querySelectorAll(".clickable-kanji.selected").forEach((el) => el.classList.remove("selected"));
  span.classList.add("selected");
  return runKanjiLookup(kanji, context);
}

// Drag-selecting a run of kanji (one character or a whole compound) is
// the same lookup as clicking a single kanji, just resolved directly
// from the selected text instead of guessed from a one-character click
// — see handlePassageSelection below for how this gets routed to here
// vs. the grammar-note phrase flow.
function handleKanjiSelectionLookup(text) {
  document.querySelectorAll(".clickable-kanji.selected").forEach((el) => el.classList.remove("selected"));
  const normalized = normalizeWhitespace(currentPassage.text, "ja");
  const idx = normalized.indexOf(text);
  const context = idx === -1 ? text : extractJapaneseSentenceContext(normalized, idx);
  return runKanjiLookup(text, context);
}

function handleAddKanjiToVocabClick() {
  const addBtn = document.getElementById("add-kanji-to-vocab");
  openGrammarSidePanel("vocab");
  showVocabAddForm({
    word: addBtn.dataset.word || "",
    furigana: addBtn.dataset.furigana || "",
    meaning: addBtn.dataset.meaning || "",
  });

  const bottomPanel = document.getElementById("kanji-panel");
  if (bottomPanel) bottomPanel.hidden = true;
}

function handleShowKanjiInVocabClick() {
  const showBtn = document.getElementById("show-kanji-in-vocab");
  const existing = findExistingJapaneseWord(showBtn.dataset.word || "");
  if (!existing) return;

  openGrammarSidePanel("vocab");
  showVocabExisting(existing);

  const bottomPanel = document.getElementById("kanji-panel");
  if (bottomPanel) bottomPanel.hidden = true;
}

// ---------------------------------------------------------------------
// Phrase selection — drag-select a phrase/sentence for a grammar note
// ---------------------------------------------------------------------

// Every character in the selection is kanji (isKanji, imported from the
// character-tokenization section above) — a drag-select over a whole
// compound like 言葉, as opposed to a phrase/sentence that also has
// hiragana/particles mixed in.
function isAllKanji(text) {
  return text.length > 0 && Array.from(text).every((ch) => isKanji(ch));
}

// A plain click (no drag) leaves the browser selection collapsed, so
// this only fires for an actual multi-character drag-select — normal
// single-word clicks keep working through each span's own listener
// above, untouched.
function handlePassageSelection() {
  const selection = window.getSelection ? window.getSelection() : null;
  if (!selection || selection.isCollapsed) return;

  const text = selection.toString().trim();
  if (!text) return;

  const container = document.getElementById("passage-text-display");
  if (!container || !container.contains(selection.anchorNode)) return;

  // Japanese: highlighting a run of pure kanji (one character or a
  // whole compound, e.g. 言葉) is a vocabulary lookup, not a grammar
  // note — same destination as clicking a single kanji, just resolved
  // directly from the selected text instead of guessed from context.
  // A selection with any hiragana/katakana/punctuation mixed in (a real
  // phrase or sentence) falls through to the grammar-note flow below.
  if (currentPassage && currentPassage.language === "ja" && isAllKanji(text)) {
    handleKanjiSelectionLookup(text);
    return;
  }

  // Word-count doesn't work for Japanese (no spaces to split on — the
  // whole selection would count as "1 word" and always get rejected),
  // so this requires a minimum number of actual characters instead,
  // which works for either language.
  if (text.replace(/\s+/g, "").length < 3) return;

  showGrammarPanel(text);
}

async function showGrammarPanel(phrase) {
  const wordPanel = document.getElementById("lookup-panel");
  if (wordPanel) wordPanel.hidden = true;

  const panel = document.getElementById("grammar-panel");
  if (!panel) return;
  panel.hidden = false;

  document.getElementById("grammar-phrase").textContent = phrase;
  document.getElementById("grammar-furigana").textContent = "";
  const grammarTranslationEl = document.getElementById("grammar-translation");
  grammarTranslationEl.textContent = "Looking up…";
  grammarTranslationEl.dataset.immersionKey = "lookingUpStatus";
  const dictFormEl = document.getElementById("grammar-dictionary-form");
  if (dictFormEl) {
    dictFormEl.hidden = true;
    dictFormEl.textContent = "";
  }
  document.getElementById("grammar-structure-text").textContent = "";
  document.getElementById("grammar-hint-text").textContent = "";
  document.getElementById("save-grammar-note").hidden = true;
  const vocabBtn = document.getElementById("save-grammar-phrase-as-vocab");
  if (vocabBtn) vocabBtn.hidden = true;

  const context = currentPassage ? currentPassage.text : "";
  const result = await Translate.explainGrammar(phrase, context);

  const saveBtn = document.getElementById("save-grammar-note");
  saveBtn.dataset.phrase = phrase;

  if (!result || !result.translation) {
    const failedTranslationEl = document.getElementById("grammar-translation");
    failedTranslationEl.textContent = "Couldn't look this up automatically — you can still save it and write your own notes.";
    failedTranslationEl.dataset.immersionKey = "grammarLookupFailedHint";
    saveBtn.dataset.translation = "";
    saveBtn.dataset.structure = "";
    saveBtn.dataset.explanation = "";
  } else {
    const successTranslationEl = document.getElementById("grammar-translation");
    delete successTranslationEl.dataset.immersionKey;
    successTranslationEl.textContent = result.translation;
    document.getElementById("grammar-furigana").textContent = result.furigana || "";
    document.getElementById("grammar-structure-text").textContent = result.structure || "";
    document.getElementById("grammar-hint-text").textContent = result.explanation || "";
    saveBtn.dataset.translation = result.translation;
    saveBtn.dataset.structure = result.structure || "";
    saveBtn.dataset.explanation = result.explanation || "";

    // Only filled in when the phrase turned out to be a single inflected
    // verb (see GRAMMAR_EXPLAIN_PROMPT) — a full phrase/sentence leaves
    // this null, so the row just stays hidden for those.
    if (dictFormEl && result.dictionaryForm) {
      dictFormEl.hidden = false;
      dictFormEl.textContent = result.dictionaryFormEnglish
        ? `Dictionary form: ${result.dictionaryForm} (${result.dictionaryFormEnglish})`
        : `Dictionary form: ${result.dictionaryForm}`;
    }

    // The same phrase can just as easily be a vocab item as a grammar
    // note (a single conjugated word dragged/selected, not just a full
    // sentence pattern) — offering both lets the learner pick whichever
    // actually fits instead of forcing everything through "grammar note".
    if (vocabBtn) {
      vocabBtn.dataset.word = phrase;
      vocabBtn.dataset.furigana = result.furigana || "";
      vocabBtn.dataset.meaning = result.translation;
      vocabBtn.dataset.infinitive = result.dictionaryForm || "";
      vocabBtn.dataset.infinitiveEnglish = result.dictionaryFormEnglish || "";
      vocabBtn.hidden = false;
    }
  }
  saveBtn.hidden = false;
}

function handleSaveGrammarPhraseAsVocabClick() {
  const btn = document.getElementById("save-grammar-phrase-as-vocab");
  openGrammarSidePanel("vocab");
  showVocabAddForm({
    word: btn.dataset.word || "",
    furigana: btn.dataset.furigana || "",
    meaning: btn.dataset.meaning || "",
    infinitive: btn.dataset.infinitive ? `${btn.dataset.infinitive}${btn.dataset.infinitiveEnglish ? ` (${btn.dataset.infinitiveEnglish})` : ""}` : "",
  });

  const bottomPanel = document.getElementById("grammar-panel");
  if (bottomPanel) bottomPanel.hidden = true;
}

// Opens the in-page grammar notes panel with a form pre-filled from the
// phrase you just looked up — no page navigation, so the passage stays
// visible on the right the whole time.
function handleSaveGrammarNoteClick() {
  const btn = document.getElementById("save-grammar-note");
  openGrammarSidePanel("grammar");
  showSideNoteForm({
    sentence: btn.dataset.phrase || "",
    translation: btn.dataset.translation || "",
    structure: btn.dataset.structure || "",
    explanation: btn.dataset.explanation || "",
  });

  const bottomPanel = document.getElementById("grammar-panel");
  if (bottomPanel) bottomPanel.hidden = true;
}

// ---------------------------------------------------------------------
// Grammar side panel — in-page notes form + list, resizable against the
// passage reader instead of navigating to a separate page.
// ---------------------------------------------------------------------

// Swaps the side panel between its two content modes without touching
// the open/close/resize mechanics (same panel element, same divider,
// same remembered width) — "grammar" is the notes form/list built
// earlier, "vocab" is the kanji add/existing-word display added for
// Japanese Reading.
function showPanelMode(mode) {
  const title = document.getElementById("side-panel-title");
  const grammarContent = document.getElementById("grammar-mode-content");
  const vocabContent = document.getElementById("vocab-panel-content");
  if (title) title.textContent = mode === "vocab" ? "Vocab" : "Grammar notes";
  if (grammarContent) grammarContent.hidden = mode === "vocab";
  if (vocabContent) vocabContent.hidden = mode !== "vocab";
}

function openGrammarSidePanel(mode) {
  const panel = document.getElementById("grammar-side-panel");
  const divider = document.getElementById("split-divider");
  const main = document.getElementById("reading-main");
  if (panel) panel.hidden = false;
  if (divider) divider.hidden = false;
  if (main) main.classList.add("main-wide");
  showPanelMode(mode || "grammar");
}

function closeGrammarSidePanel() {
  const panel = document.getElementById("grammar-side-panel");
  const divider = document.getElementById("split-divider");
  const main = document.getElementById("reading-main");
  if (panel) panel.hidden = true;
  if (divider) divider.hidden = true;
  if (main) main.classList.remove("main-wide");
  hideSideNoteForm();
  hideVocabPanelContent();
}

function toggleGrammarSidePanel() {
  const panel = document.getElementById("grammar-side-panel");
  if (!panel) return;
  if (panel.hidden) {
    openGrammarSidePanel("grammar");
  } else {
    closeGrammarSidePanel();
  }
}

function showSideNoteForm(prefill) {
  const form = document.getElementById("side-grammar-note-form");
  if (!form) return;
  form.hidden = false;

  document.getElementById("side-note-sentence-display").textContent = prefill.sentence || "";
  document.getElementById("side-note-translation-display").textContent = prefill.translation || "";

  const details = document.getElementById("side-note-hint-details");
  document.getElementById("side-note-structure-text").textContent = prefill.structure || "";
  document.getElementById("side-note-explanation-text").textContent = prefill.explanation || "";
  if (details) details.hidden = !(prefill.structure || prefill.explanation);

  document.getElementById("side-note-notes").value = "";
  document.getElementById("side-note-tags").value = "";
  renderSideThemeOptions();

  form.dataset.sentence = prefill.sentence || "";
  form.dataset.translation = prefill.translation || "";
}

function hideSideNoteForm() {
  const form = document.getElementById("side-grammar-note-form");
  if (form) form.hidden = true;
}

function renderSideThemeOptions(selectId) {
  const select = document.getElementById("side-note-theme-select");
  if (!select) return;
  select.innerHTML = "";

  const noteLang = currentPassage ? currentPassage.language : "es";
  const themes = Storage.getGrammarThemes(noteLang);
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

// See createPassageFolder() above for why this also has a dedicated
// button (#side-note-new-folder-btn) instead of relying only on the
// select's "change" event.
function createGrammarSideFolder() {
  const name = prompt("Name for the new folder:");
  const noteLang = currentPassage ? currentPassage.language : "es";
  const existingThemes = Storage.getGrammarThemes(noteLang);
  if (!name || !name.trim()) {
    renderSideThemeOptions(existingThemes.length ? existingThemes[0].id : null);
    return;
  }

  const theme = Storage.addGrammarTheme(name.trim(), noteLang);
  renderSideThemeOptions(theme.id);
}

function handleSideThemeSelectChange(e) {
  if (e.target.value !== GRAMMAR_NEW_THEME_VALUE) return;
  createGrammarSideFolder();
}

function handleSideNoteFormSubmit(e) {
  e.preventDefault();
  const form = document.getElementById("side-grammar-note-form");
  const themeSelect = document.getElementById("side-note-theme-select");
  let themeId = themeSelect.value;

  if (!themeId || themeId === GRAMMAR_NEW_THEME_VALUE) {
    // Covers the case where "+ New folder…" was the ONLY option (no
    // folders exist yet) and was already selected by default — a
    // <select>'s change event never fires for "picking" a value that
    // was already selected, so this is the reliable fallback rather
    // than depending on handleSideThemeSelectChange having run.
    const name = prompt("Name for the new folder:");
    if (!name || !name.trim()) return;
    const theme = Storage.addGrammarTheme(name.trim(), currentPassage ? currentPassage.language : "es");
    renderSideThemeOptions(theme.id);
    themeId = theme.id;
  }

  Storage.addGrammarNote({
    themeId,
    sentence: form.dataset.sentence || "",
    translation: form.dataset.translation || "",
    notes: document.getElementById("side-note-notes").value.trim(),
    tags: document
      .getElementById("side-note-tags")
      .value.trim()
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    sourcePassageId: currentPassage ? currentPassage.id : null,
    sourcePassageTitle: currentPassage ? currentPassage.title : null,
  });

  hideSideNoteForm();
  renderSideNotesList();
  updateGrammarNoteCount();
}

// ---------------------------------------------------------------------
// Vocab mode of the side panel — either shows a kanji/word that's
// already saved (with a link to open it in the full Vocab Bank), or a
// form to add a newly-looked-up kanji straight into a theme.
// ---------------------------------------------------------------------

function hideVocabPanelContent() {
  const existing = document.getElementById("vocab-existing-display");
  if (existing) existing.hidden = true;
  const form = document.getElementById("vocab-add-form");
  if (form) form.hidden = true;
}

function showVocabExisting(match) {
  hideVocabPanelContent();
  const existing = document.getElementById("vocab-existing-display");
  if (!existing) return;
  existing.hidden = false;

  const vocabDeckNoticeEl = document.getElementById("vocab-deck-notice-detail");
  vocabDeckNoticeEl.textContent = "You should know this kanji — it's in your deck!";
  vocabDeckNoticeEl.dataset.immersionKey = "kanjiInDeckNoticeShort";
  document.getElementById("vocab-existing-word").textContent = match.word.targetLang;
  document.getElementById("vocab-existing-furigana").textContent = match.word.furigana || "";
  document.getElementById("vocab-existing-meaning").textContent = match.word.english;
  document.getElementById("vocab-existing-theme").textContent = match.theme ? `Folder: ${match.theme.name}` : "";

  const link = document.getElementById("open-full-vocab-link");
  if (link && match.theme) link.href = `theme.html?id=${encodeURIComponent(match.theme.id)}`;
}

function showVocabAddForm(prefill) {
  hideVocabPanelContent();
  const form = document.getElementById("vocab-add-form");
  if (!form) return;
  form.hidden = false;

  document.getElementById("vocab-add-word").value = (prefill && prefill.word) || "";
  document.getElementById("vocab-add-furigana").value = (prefill && prefill.furigana) || "";
  document.getElementById("vocab-add-meaning").value = (prefill && prefill.meaning) || "";
  document.getElementById("vocab-add-infinitive").value = (prefill && prefill.infinitive) || "";
  renderVocabAddThemeOptions();

  // Each time this panel is (re)opened for a word, any example sentences
  // generated for a PREVIOUS word are stale — clear them out rather than
  // risk saving the wrong word's examples if the learner forgets to
  // regenerate before hitting save.
  pendingVocabExamples = null;
  const status = document.getElementById("vocab-examples-status");
  const list = document.getElementById("vocab-examples-list");
  if (status) {
    status.hidden = true;
    status.textContent = "";
    delete status.dataset.immersionKey;
  }
  if (list) {
    list.hidden = true;
    list.innerHTML = "";
  }
}

async function handleGenerateVocabExamplesClick() {
  const word = document.getElementById("vocab-add-word").value.trim();
  const meaning = document.getElementById("vocab-add-meaning").value.trim();
  if (!word) return;

  const status = document.getElementById("vocab-examples-status");
  const list = document.getElementById("vocab-examples-list");
  list.hidden = true;
  list.innerHTML = "";
  status.hidden = false;
  status.textContent = "Generating…";
  status.dataset.immersionKey = "generatingExamplesStatus";

  const examplesLang = currentPassage ? currentPassage.language : "es";
  const { examples, error } = await Translate.generateExampleSentences(word, examplesLang, meaning);

  if (!examples) {
    console.error("generate-examples failed:", error);
    status.textContent = "Couldn't generate examples — try again.";
    status.dataset.immersionKey = "generateExamplesFailedHint";
    pendingVocabExamples = null;
    return;
  }

  status.hidden = true;
  status.textContent = "";
  delete status.dataset.immersionKey;
  pendingVocabExamples = examples;
  renderExamplesList(list, examples);
}

// Shared by the vocab-add panel and the word-lookup panel — a plain
// bulleted list, target-language sentence first with its English
// translation right underneath in smaller, muted text.
function renderExamplesList(listEl, examples) {
  listEl.innerHTML = "";
  examples.forEach((ex) => {
    const li = document.createElement("li");
    const textLine = document.createElement("div");
    textLine.className = "example-text";
    textLine.textContent = ex.text || "";
    const translationLine = document.createElement("div");
    translationLine.className = "example-translation";
    translationLine.textContent = ex.translation || "";
    li.appendChild(textLine);
    li.appendChild(translationLine);
    listEl.appendChild(li);
  });
  listEl.hidden = false;
}

function renderVocabAddThemeOptions(selectId) {
  const select = document.getElementById("vocab-add-theme-select");
  if (!select) return;
  select.innerHTML = "";

  const vocabAddLang = currentPassage ? currentPassage.language : "es";
  const themes = Storage.getThemes().filter((t) => t.language === vocabAddLang);
  themes.forEach((theme) => {
    const opt = document.createElement("option");
    opt.value = theme.id;
    opt.textContent = theme.name;
    select.appendChild(opt);
  });

  const newOpt = document.createElement("option");
  newOpt.value = NEW_THEME_VALUE;
  newOpt.textContent = "+ Create new theme…";
  newOpt.dataset.immersionKey = "createNewThemeOption";
  select.appendChild(newOpt);

  if (selectId) {
    select.value = selectId;
  } else if (themes.length === 0) {
    select.value = NEW_THEME_VALUE;
  }
}

// See createPassageFolder() above for why this also has a dedicated
// button (#vocab-add-new-theme-btn) instead of relying only on the
// select's "change" event.
function createVocabAddTheme() {
  const name = prompt("Name for the new theme:");
  const vocabAddLang = currentPassage ? currentPassage.language : "es";
  const existingThemes = Storage.getThemes().filter((t) => t.language === vocabAddLang);
  if (!name || !name.trim()) {
    renderVocabAddThemeOptions(existingThemes.length ? existingThemes[0].id : null);
    return;
  }

  const theme = Storage.addTheme(name.trim(), vocabAddLang);
  renderVocabAddThemeOptions(theme.id);
}

function handleVocabAddThemeSelectChange(e) {
  if (e.target.value !== NEW_THEME_VALUE) return;
  createVocabAddTheme();
}

function handleVocabAddFormSubmit(e) {
  e.preventDefault();
  const themeSelect = document.getElementById("vocab-add-theme-select");
  let themeId = themeSelect.value;

  if (!themeId || themeId === NEW_THEME_VALUE) {
    // Same cold-start case as the grammar folder select: if no themes in
    // this passage's language exist yet, "+ Create new theme…" is the
    // only, pre-selected option, so its change event never fires — handle
    // it here instead.
    const name = prompt("Name for the new theme:");
    if (!name || !name.trim()) return;
    const theme = Storage.addTheme(name.trim(), currentPassage ? currentPassage.language : "es");
    renderVocabAddThemeOptions(theme.id);
    themeId = theme.id;
  }

  const word = document.getElementById("vocab-add-word").value.trim();
  const furigana = document.getElementById("vocab-add-furigana").value.trim();
  const meaning = document.getElementById("vocab-add-meaning").value.trim();
  const infinitive = document.getElementById("vocab-add-infinitive").value.trim();
  if (!word || !meaning) return;

  const saved = Storage.addWordIfNotDuplicate(themeId, {
    english: meaning,
    targetLang: word,
    furigana,
    notes: "",
    infinitive,
    exampleSentences: pendingVocabExamples || undefined,
  });

  if (saved) {
    alert(`${word} — added to your vocab deck.`);
  } else {
    alert(`${word} is already in that theme.`);
  }
  closeGrammarSidePanel();
}

function handleCancelVocabAdd() {
  hideVocabPanelContent();
}

function updateGrammarNoteCount() {
  const badge = document.getElementById("grammar-note-count");
  if (!badge || !currentPassage) return;
  const count = Storage.getGrammarNotes().filter((n) => n.sourcePassageId === currentPassage.id).length;
  badge.textContent = String(count);
}

function renderSideNotesList() {
  const list = document.getElementById("side-grammar-notes-list");
  if (!list || !currentPassage) return;

  const notes = Storage.getGrammarNotes().filter((n) => n.sourcePassageId === currentPassage.id);
  list.innerHTML = "";

  if (notes.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-hint";
    li.textContent = "No notes saved from this passage yet.";
    li.dataset.immersionKey = "noNotesSavedFromPassageText";
    list.appendChild(li);
    return;
  }

  notes
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach((note) => list.appendChild(buildSideNoteCard(note)));
}

function buildSideNoteCard(note) {
  const li = document.createElement("li");
  li.className = "word-item grammar-note-item";

  const sentenceEl = document.createElement("div");
  sentenceEl.className = "grammar-note-sentence";
  sentenceEl.textContent = note.sentence;
  li.appendChild(sentenceEl);

  if (note.notes) {
    const notesEl = document.createElement("p");
    notesEl.textContent = note.notes;
    li.appendChild(notesEl);
  }

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

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "secondary delete-note-btn";
  deleteBtn.textContent = "Delete";
  deleteBtn.dataset.immersionKey = "btnDelete";
  deleteBtn.addEventListener("click", () => {
    if (!confirm("Delete this note? This can't be undone.")) return;
    Storage.deleteGrammarNote(note.id);
    renderSideNotesList();
    updateGrammarNoteCount();
  });
  li.appendChild(deleteBtn);

  return li;
}

// Drag the divider to resize the grammar panel against the reader.
// Width is clamped and remembered across passages via localStorage.
function initSplitResize() {
  const divider = document.getElementById("split-divider");
  const panel = document.getElementById("grammar-side-panel");
  const container = document.getElementById("split-container");
  if (!divider || !panel || !container) return;

  const savedWidth = localStorage.getItem("reading.splitPanelWidth");
  if (savedWidth) panel.style.flexBasis = `${savedWidth}px`;

  let dragging = false;

  divider.addEventListener("mousedown", (e) => {
    dragging = true;
    divider.classList.add("dragging");
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const rect = container.getBoundingClientRect();
    let newWidth = e.clientX - rect.left;
    const min = 220;
    const max = rect.width * 0.7;
    newWidth = Math.max(min, Math.min(max, newWidth));
    panel.style.flexBasis = `${newWidth}px`;
    localStorage.setItem("reading.splitPanelWidth", String(Math.round(newWidth)));
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    divider.classList.remove("dragging");
  });
}

function renderThemeOptions(selectId) {
  const select = document.getElementById("add-to-theme-select");
  if (!select) return;
  select.innerHTML = "";

  const passageLang = currentPassage ? currentPassage.language : "es";
  const themes = Storage.getThemes().filter((t) => t.language === passageLang);
  themes.forEach((theme) => {
    const opt = document.createElement("option");
    opt.value = theme.id;
    opt.textContent = theme.name;
    select.appendChild(opt);
  });

  const newOpt = document.createElement("option");
  newOpt.value = NEW_THEME_VALUE;
  newOpt.textContent = "+ Create new theme…";
  newOpt.dataset.immersionKey = "createNewThemeOption";
  select.appendChild(newOpt);

  if (selectId) {
    select.value = selectId;
  } else if (themes.length === 0) {
    select.value = NEW_THEME_VALUE;
  }
}

// Lets you create a theme right from the lookup panel instead of having
// to leave Reading and go set one up in Vocab Bank first. Also exposed
// as a dedicated button (#add-to-theme-new-theme-btn) — see
// createPassageFolder() above for why.
function createReadingLookupTheme() {
  const name = prompt("Name for the new theme:");
  const passageLang = currentPassage ? currentPassage.language : "es";
  const existingThemes = Storage.getThemes().filter((t) => t.language === passageLang);
  if (!name || !name.trim()) {
    renderThemeOptions(existingThemes.length ? existingThemes[0].id : null);
    return;
  }

  const theme = Storage.addTheme(name.trim(), passageLang);
  renderThemeOptions(theme.id);
}

function handleThemeSelectChange(e) {
  if (e.target.value !== NEW_THEME_VALUE) return;
  createReadingLookupTheme();
}

function handleAddLookedUpWord() {
  const select = document.getElementById("add-to-theme-select");
  let themeId = select.value;
  if (!themeId || themeId === NEW_THEME_VALUE) {
    // Covers the case where "+ Create new theme…" was the ONLY option
    // (no themes in this passage's language exist yet) and was already
    // selected by default — a <select>'s change event never fires for
    // "picking" a value that was already selected, so this is the
    // reliable fallback rather than depending on handleThemeSelectChange.
    const name = prompt("Name for the new theme:");
    if (!name || !name.trim()) return;
    const theme = Storage.addTheme(name.trim(), currentPassage ? currentPassage.language : "es");
    renderThemeOptions(theme.id);
    themeId = theme.id;
  }

  const addBtn = document.getElementById("add-looked-up-word");
  const english = addBtn.dataset.english;
  const grammar = addBtn.dataset.grammar || "";
  const saved = Storage.addWordIfNotDuplicate(themeId, {
    english,
    targetLang: selectedWord,
    furigana: "",
    notes: grammar,
    infinitive: addBtn.dataset.infinitive || "",
    exampleSentences: pendingLookupExamples || undefined,
  });

  const resultEl = document.getElementById("lookup-result");
  if (saved) {
    resultEl.textContent = `${english} — added.`;
    addBtn.hidden = true;
  } else {
    resultEl.textContent = `${english} (already in that theme).`;
  }
}
