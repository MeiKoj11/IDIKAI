/*
  class-notebook-app.js
  ----------------------
  The Class Notebook: a full-page, book-styled note-taking view meant
  for live in-class notetaking — open it, write freely, flip to a new
  page whenever you want. One continuous notebook per language: pages
  just keep accumulating over time, like carrying one physical
  notebook to every lesson (see storage.js's Class Notebook block for
  the schema).

  Deliberately NOT auto-paginating: each page is a plain scrollable
  ruled writing area with no fixed capacity — you decide when to click
  "Next page," nothing splits your text for you. Sorting useful notes
  out into Grammar/Vocab afterward is a manual, separate step (copy,
  not move) and isn't part of this file at all.
*/

const CLASS_NOTEBOOK_LANGUAGE_NAMES = { es: "Spanish", ja: "Japanese", fr: "French" };
const CLASS_NOTEBOOK_SAVE_DELAY_MS = 600;

let classNotebookLang = "es";
let currentSpreadIndex = 0;
let leftPageId = null;
let rightPageId = null;
let leftSaveTimeout = null;
let rightSaveTimeout = null;

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

document.addEventListener("DOMContentLoaded", () => {
  const book = document.getElementById("notebook-book");
  if (!book) return; // not this page

  const langParam = getQueryParam("lang");
  classNotebookLang = SUPPORTED_LANGUAGES.includes(langParam) ? langParam : "es";
  const langName = CLASS_NOTEBOOK_LANGUAGE_NAMES[classNotebookLang];

  const heading = document.getElementById("class-notebook-heading");
  if (heading) heading.textContent = `${langName} Class Notebook`;
  const backLink = document.getElementById("class-notebook-back-link");
  if (backLink) backLink.href = `personal-hub.html?lang=${classNotebookLang}`;
  const header = document.getElementById("class-notebook-header");
  if (header) header.classList.add(`lang-${classNotebookLang}`);

  initTopbar(classNotebookLang);
  if (typeof initHubTasks === "function") initHubTasks(classNotebookLang);
  initAppTabs({
    section: "class-notebook",
    language: classNotebookLang,
    label: `${langName} Class Notebook`,
    href: `class-notebook.html?lang=${classNotebookLang}`,
  });

  const leftTextarea = document.getElementById("notebook-left-textarea");
  const rightTextarea = document.getElementById("notebook-right-textarea");
  leftTextarea.addEventListener("input", () => scheduleClassNotebookSave("left"));
  rightTextarea.addEventListener("input", () => scheduleClassNotebookSave("right"));
  leftTextarea.addEventListener("focus", () => { lastFocusedNotebookPage = "left"; });
  rightTextarea.addEventListener("focus", () => { lastFocusedNotebookPage = "right"; });

  initNotebookToolbar();

  const prevBtn = document.getElementById("notebook-prev-btn");
  const nextBtn = document.getElementById("notebook-next-btn");
  if (prevBtn) prevBtn.addEventListener("click", goToPrevSpread);
  if (nextBtn) nextBtn.addEventListener("click", goToNextSpread);

  window.addEventListener("beforeunload", flushClassNotebookSaves);
  window.addEventListener("pagehide", flushClassNotebookSaves);

  // Open on the most recent spread (the pages the learner was last
  // writing on), not always the very start of the notebook.
  const pages = Storage.getClassNotebookPages(classNotebookLang);
  const startSpread = pages.length > 0 ? Math.floor((pages.length - 1) / 2) : 0;
  renderClassNotebookSpread(startSpread);
});

// Makes sure both page slots of a spread exist, creating blank ones as
// needed — this is the ONLY place new pages ever get created, whether
// that's the notebook's very first spread or extending it further.
function ensureClassNotebookSpreadPages(spreadIndex) {
  let pages = Storage.getClassNotebookPages(classNotebookLang);
  const leftIdx = spreadIndex * 2;
  const rightIdx = spreadIndex * 2 + 1;
  while (pages.length <= rightIdx) {
    Storage.addClassNotebookPage(classNotebookLang);
    pages = Storage.getClassNotebookPages(classNotebookLang);
  }
  return { left: pages[leftIdx], right: pages[rightIdx] };
}

function renderClassNotebookSpread(spreadIndex) {
  currentSpreadIndex = spreadIndex;
  const { left, right } = ensureClassNotebookSpreadPages(spreadIndex);
  leftPageId = left.id;
  rightPageId = right.id;

  const leftTextarea = document.getElementById("notebook-left-textarea");
  const rightTextarea = document.getElementById("notebook-right-textarea");
  leftTextarea.innerHTML = left.content || "";
  rightTextarea.innerHTML = right.content || "";

  const leftNumber = document.getElementById("notebook-left-page-number");
  const rightNumber = document.getElementById("notebook-right-page-number");
  if (leftNumber) leftNumber.textContent = `Page ${spreadIndex * 2 + 1}`;
  if (rightNumber) rightNumber.textContent = `Page ${spreadIndex * 2 + 2}`;

  const prevBtn = document.getElementById("notebook-prev-btn");
  if (prevBtn) prevBtn.hidden = spreadIndex === 0;

  setClassNotebookSaveStatus("");
}

function scheduleClassNotebookSave(which) {
  setClassNotebookSaveStatus("Saving…");
  if (which === "left") {
    if (leftSaveTimeout) clearTimeout(leftSaveTimeout);
    leftSaveTimeout = setTimeout(() => {
      const textarea = document.getElementById("notebook-left-textarea");
      Storage.updateClassNotebookPage(leftPageId, textarea.innerHTML);
      leftSaveTimeout = null;
      setClassNotebookSaveStatus("Saved");
    }, CLASS_NOTEBOOK_SAVE_DELAY_MS);
  } else {
    if (rightSaveTimeout) clearTimeout(rightSaveTimeout);
    rightSaveTimeout = setTimeout(() => {
      const textarea = document.getElementById("notebook-right-textarea");
      Storage.updateClassNotebookPage(rightPageId, textarea.innerHTML);
      rightSaveTimeout = null;
      setClassNotebookSaveStatus("Saved");
    }, CLASS_NOTEBOOK_SAVE_DELAY_MS);
  }
}

// Saves immediately rather than waiting for the debounce timer —
// called before navigating to another spread (or the tab/page
// closing) so nothing typed in the last half-second is ever lost.
function flushClassNotebookSaves() {
  const leftTextarea = document.getElementById("notebook-left-textarea");
  const rightTextarea = document.getElementById("notebook-right-textarea");
  if (leftSaveTimeout) {
    clearTimeout(leftSaveTimeout);
    leftSaveTimeout = null;
    if (leftTextarea && leftPageId) Storage.updateClassNotebookPage(leftPageId, leftTextarea.innerHTML);
  }
  if (rightSaveTimeout) {
    clearTimeout(rightSaveTimeout);
    rightSaveTimeout = null;
    if (rightTextarea && rightPageId) Storage.updateClassNotebookPage(rightPageId, rightTextarea.innerHTML);
  }
}

function setClassNotebookSaveStatus(text) {
  const el = document.getElementById("notebook-save-status");
  if (!el) return;
  if (!text) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = text;
}

function goToPrevSpread() {
  if (currentSpreadIndex === 0) return;
  flushClassNotebookSaves();
  renderClassNotebookSpread(currentSpreadIndex - 1);
}

function goToNextSpread() {
  flushClassNotebookSaves();
  renderClassNotebookSpread(currentSpreadIndex + 1);
}

let lastFocusedNotebookPage = "left";

function getNotebookThemeId(getThemes, addTheme) {
  const themes = getThemes(classNotebookLang);
  const existing = themes.find((t) => (t.name || "").trim().toLowerCase() === "from class notebook");
  if (existing) return existing.id;
  return addTheme("From Class Notebook", classNotebookLang).id;
}

function initNotebookToolbar() {
  const boldBtn = document.getElementById("notebook-bold-btn");
  const underlineBtn = document.getElementById("notebook-underline-btn");
  const highlightBtn = document.getElementById("notebook-highlight-btn");
  const newVocabBtn = document.getElementById("notebook-new-vocab-btn");
  const newGrammarBtn = document.getElementById("notebook-new-grammar-btn");

  // mousedown + preventDefault keeps the caret/selection inside the
  // contenteditable page intact, so execCommand still has something
  // to act on once the click actually fires.
  [boldBtn, underlineBtn, highlightBtn].forEach((btn) => {
    if (btn) btn.addEventListener("mousedown", (e) => e.preventDefault());
  });

  if (boldBtn) boldBtn.addEventListener("click", () => document.execCommand("bold"));
  if (underlineBtn) underlineBtn.addEventListener("click", () => document.execCommand("underline"));
  if (highlightBtn) highlightBtn.addEventListener("click", () => document.execCommand("hiliteColor", false, "#ffe066"));

  if (newVocabBtn) {
    newVocabBtn.addEventListener("click", () => {
      const english = window.prompt("English word / meaning:");
      if (!english) return;
      const targetLang = window.prompt("Word in the target language:");
      if (!targetLang) return;
      const themeId = getNotebookThemeId(
        () => Storage.getThemes().filter((t) => (t.language || "es") === classNotebookLang),
        Storage.addTheme
      );
      Storage.addWordIfNotDuplicate(themeId, { english, targetLang, furigana: "", notes: "" });
      window.alert("Saved to Vocab Bank — From Class Notebook.");
    });
  }

  if (newGrammarBtn) {
    newGrammarBtn.addEventListener("click", () => {
      const header = window.prompt("Grammar point (short title):");
      if (!header) return;
      const explanation = window.prompt("Explanation:") || "";
      const themeId = getNotebookThemeId(Storage.getGrammarThemes, Storage.addGrammarTheme);
      Storage.addGrammarNote({ themeId, header, explanation, examples: [], variants: [], tags: [] });
      window.alert("Saved to Grammar — From Class Notebook.");
    });
  }
}
