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
  initNotebookLinking();

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
  // Switching spreads replaces both pages' DOM wholesale, so any
  // link-placement mode or popover referring to the old DOM would be
  // left dangling -- clear both defensively before the swap.
  disarmLinkPlacement();
  closeNotebookLinkPopover();
  pendingLinkRange = null;
  pendingLinkSide = null;

  currentSpreadIndex = spreadIndex;
  const { left, right } = ensureClassNotebookSpreadPages(spreadIndex);
  leftPageId = left.id;
  rightPageId = right.id;

  const leftTextarea = document.getElementById("notebook-left-textarea");
  const rightTextarea = document.getElementById("notebook-right-textarea");
  leftTextarea.innerHTML = left.content || "";
  rightTextarea.innerHTML = right.content || "";
  refreshNotebookLinkStatuses(leftTextarea);
  refreshNotebookLinkStatuses(rightTextarea);

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


// =========================================================================
// Notebook links -- inline "jump to another section" icons
// =========================================================================
// Design: a link icon is a real DOM node -- <span class="notebook-link-icon"
// contenteditable="false" data-...> -- inserted straight into the page's
// contenteditable HTML at the exact spot it was placed. Because it's part
// of the page's own saved content (page.content, the same innerHTML this
// file already persists via Storage.updateClassNotebookPage), it needs no
// separate storage schema at all, and it naturally stays attached to the
// right point in the text as more gets written around it -- typing before
// or after it just pushes it along like any other inline element would.
// All the data a link needs to resolve and render itself (which section,
// what kind of target, its id, its language, its display name) lives on
// that one node's data-* attributes.

const NOTEBOOK_LINK_SECTIONS = [
  { id: "vocab", label: "Vocab Bank" },
  { id: "reading", label: "Reading" },
  { id: "writing", label: "Writing" },
  { id: "speaking", label: "Speaking" },
  { id: "listening", label: "Listening" },
];

let linkPlacementArmed = false;
let pendingLinkRange = null;
let pendingLinkSide = null; // "left" | "right" -- which page the click landed on
let openLinkPopoverIcon = null;
let notebookLinkWizard = null;

function initNotebookLinking() {
  const linkBtn = document.getElementById("notebook-link-btn");
  const leftTextarea = document.getElementById("notebook-left-textarea");
  const rightTextarea = document.getElementById("notebook-right-textarea");

  if (linkBtn) {
    // Same trick as the Bold/Underline/Highlight buttons -- keeps the
    // contenteditable selection/caret intact through the button click.
    linkBtn.addEventListener("mousedown", (e) => e.preventDefault());
    linkBtn.addEventListener("click", () => {
      if (linkPlacementArmed) {
        disarmLinkPlacement();
      } else {
        armLinkPlacement();
      }
    });
  }

  if (leftTextarea) leftTextarea.addEventListener("click", (e) => handleNotebookTextareaClick(e, "left"));
  if (rightTextarea) rightTextarea.addEventListener("click", (e) => handleNotebookTextareaClick(e, "right"));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && linkPlacementArmed) disarmLinkPlacement();
  });

  // A click anywhere else on the page closes an open popover -- the
  // popover's own clicks are stopped from bubbling this far (see
  // toggleNotebookLinkPopover), so this only ever fires for an
  // outside click.
  document.addEventListener("click", () => closeNotebookLinkPopover());
}

function armLinkPlacement() {
  linkPlacementArmed = true;
  const linkBtn = document.getElementById("notebook-link-btn");
  const book = document.getElementById("notebook-book");
  if (linkBtn) linkBtn.classList.add("active");
  if (book) book.classList.add("link-armed");
}

function disarmLinkPlacement() {
  linkPlacementArmed = false;
  const linkBtn = document.getElementById("notebook-link-btn");
  const book = document.getElementById("notebook-book");
  if (linkBtn) linkBtn.classList.remove("active");
  if (book) book.classList.remove("link-armed");
}

function handleNotebookTextareaClick(e, side) {
  const icon = e.target.closest(".notebook-link-icon");
  if (icon) {
    e.preventDefault();
    e.stopPropagation();
    toggleNotebookLinkPopover(icon);
    return;
  }

  closeNotebookLinkPopover();
  if (!linkPlacementArmed) return;

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  pendingLinkRange = selection.getRangeAt(0).cloneRange();
  pendingLinkSide = side;
  disarmLinkPlacement();
  openNotebookLinkModal();
}

function iconSideOf(icon) {
  const leftTextarea = document.getElementById("notebook-left-textarea");
  return leftTextarea && leftTextarea.contains(icon) ? "left" : "right";
}

function persistNotebookSide(side) {
  const textarea = document.getElementById(side === "left" ? "notebook-left-textarea" : "notebook-right-textarea");
  const pageId = side === "left" ? leftPageId : rightPageId;
  if (!textarea || !pageId) return;
  // Programmatic changes (inserting/editing/deleting a link icon) don't
  // fire the contenteditable's native "input" event the way typing
  // does, so they bypass scheduleClassNotebookSave's debounce entirely
  // and save straight away instead.
  Storage.updateClassNotebookPage(pageId, textarea.innerHTML);
  setClassNotebookSaveStatus("Saved");
}

// ---- Resolving a link icon to somewhere it can actually go ----

function resolveNotebookLinkTarget(ds) {
  const section = ds.section;
  const targetType = ds.targetType;
  const targetId = ds.targetId || null;
  const lang = ds.lang || "es";
  try {
    switch (section) {
      case "vocab": {
        if (targetType === "section") return { url: `vocab.html?lang=${lang}` };
        const theme = Storage.getTheme(targetId);
        if (!theme) return null;
        return { url: `theme.html?id=${encodeURIComponent(theme.id)}` };
      }
      case "reading": {
        if (targetType === "section") return { url: `reading.html?lang=${lang}` };
        if (targetType === "folder") {
          const folder = Storage.getReadingFolder(targetId);
          if (!folder) return null;
          return { url: `reading-saved.html?lang=${folder.language}&folder=${encodeURIComponent(folder.id)}` };
        }
        const passage = Storage.getPassage(targetId);
        if (!passage) return null;
        return { url: `passage.html?id=${encodeURIComponent(passage.id)}` };
      }
      case "speaking": {
        if (targetType === "section") return { url: `speaking.html?lang=${lang}` };
        const entry = Storage.getSpeakingEntry(targetId);
        if (!entry) return null;
        return { url: `speaking-entry.html?id=${encodeURIComponent(entry.id)}&lang=${entry.language}` };
      }
      case "writing": {
        if (targetType === "section") return { url: `writing.html?lang=${lang}` };
        const entry = Storage.getWritingEntry(targetId);
        if (!entry) return null;
        return { url: `writing-entry.html?id=${encodeURIComponent(entry.id)}&lang=${entry.language}` };
      }
      default:
        // "listening" has no real section built yet -- and anything
        // unrecognized -- is always treated as unresolved.
        return null;
    }
  } catch (err) {
    return null;
  }
}

function refreshNotebookLinkStatuses(container) {
  if (!container) return;
  container.querySelectorAll(".notebook-link-icon").forEach((icon) => {
    const resolved = resolveNotebookLinkTarget(icon.dataset);
    icon.classList.toggle("notebook-link-broken", !resolved);
    icon.title = icon.dataset.name || "";
  });
}

// ---- The popover on an existing icon: Go to link / Edit link / Delete ----

function toggleNotebookLinkPopover(icon) {
  if (openLinkPopoverIcon === icon) {
    closeNotebookLinkPopover();
    return;
  }
  closeNotebookLinkPopover();
  openLinkPopoverIcon = icon;

  const resolved = resolveNotebookLinkTarget(icon.dataset);
  const popover = document.createElement("div");
  popover.className = "notebook-link-popover";
  popover.addEventListener("click", (e) => e.stopPropagation());

  if (resolved) {
    const goBtn = document.createElement("button");
    goBtn.type = "button";
    goBtn.textContent = "Go to link";
    goBtn.addEventListener("click", () => {
      window.open(resolved.url, "_blank", "noopener");
      closeNotebookLinkPopover();
    });
    popover.appendChild(goBtn);
  }

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.textContent = "Edit link";
  editBtn.addEventListener("click", () => {
    closeNotebookLinkPopover();
    openNotebookLinkModal({ editingIcon: icon });
  });
  popover.appendChild(editBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "danger-option";
  deleteBtn.textContent = "Delete link";
  deleteBtn.addEventListener("click", () => {
    const side = iconSideOf(icon);
    closeNotebookLinkPopover();
    icon.remove();
    persistNotebookSide(side);
  });
  popover.appendChild(deleteBtn);

  document.body.appendChild(popover);
  const rect = icon.getBoundingClientRect();
  popover.style.top = `${rect.bottom + 4}px`;
  popover.style.left = `${Math.min(rect.left, window.innerWidth - 160)}px`;
}

function closeNotebookLinkPopover() {
  if (!openLinkPopoverIcon) return;
  document.querySelectorAll(".notebook-link-popover").forEach((p) => p.remove());
  openLinkPopoverIcon = null;
}

// ---- Building/inserting/editing the icon itself ----

function escapeHtmlAttr(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildNotebookLinkIconHTML(linkData) {
  const linkId = `nblink_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const name = escapeHtmlAttr(linkData.name);
  // The trailing zero-width space gives the caret somewhere to land
  // right after the icon -- without it, typing immediately after a
  // contenteditable="false" island is awkward/inconsistent across
  // browsers.
  return (
    `<span class="notebook-link-icon" contenteditable="false" data-link-id="${linkId}" ` +
    `data-section="${linkData.section}" data-target-type="${linkData.targetType}" ` +
    `data-target-id="${linkData.targetId || ""}" data-lang="${linkData.lang || ""}" ` +
    `data-name="${name}" title="${name}">🔗</span>​`
  );
}

function insertNotebookLinkAtPendingRange(linkData) {
  if (!pendingLinkRange || !pendingLinkSide) return;
  const textarea = document.getElementById(
    pendingLinkSide === "left" ? "notebook-left-textarea" : "notebook-right-textarea"
  );
  if (!textarea) return;
  const side = pendingLinkSide;
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(pendingLinkRange);
  document.execCommand("insertHTML", false, buildNotebookLinkIconHTML(linkData));
  refreshNotebookLinkStatuses(textarea);
  persistNotebookSide(side);
  pendingLinkRange = null;
  pendingLinkSide = null;
}

function applyNotebookLinkEdit(icon, linkData) {
  icon.dataset.section = linkData.section;
  icon.dataset.targetType = linkData.targetType;
  icon.dataset.targetId = linkData.targetId || "";
  icon.dataset.lang = linkData.lang || "";
  icon.dataset.name = linkData.name;
  icon.title = linkData.name;
  const container = icon.closest(".notebook-page-editable");
  refreshNotebookLinkStatuses(container);
  persistNotebookSide(iconSideOf(icon));
}

// ---- The destination-picker wizard modal ----

function getNotebookLinkChildren(section, lang, parentId) {
  switch (section) {
    case "vocab": {
      const themes = Storage.getChildThemes(parentId, lang);
      return {
        folders: themes.filter((t) => t.type === "folder").map((t) => ({ id: t.id, name: t.name })),
        entries: themes.filter((t) => t.type !== "folder").map((t) => ({ id: t.id, name: t.name })),
      };
    }
    case "reading": {
      if (parentId === null) {
        return {
          folders: Storage.getReadingFolders(lang).map((f) => ({ id: f.id, name: f.name })),
          entries: Storage.getPassages()
            .filter((p) => p.language === lang && !p.folderId)
            .map((p) => ({ id: p.id, name: p.title || "Untitled passage" })),
        };
      }
      // One level of folders only -- a folder's own contents are just
      // passages, never further sub-folders.
      return {
        folders: [],
        entries: Storage.getPassages()
          .filter((p) => p.folderId === parentId)
          .map((p) => ({ id: p.id, name: p.title || "Untitled passage" })),
      };
    }
    case "speaking":
      return {
        folders: [],
        entries: Storage.getSpeakingEntries(lang).map((e) => ({ id: e.id, name: e.title || "Untitled entry" })),
      };
    case "writing":
      return {
        folders: [],
        entries: Storage.getWritingEntries(lang).map((e) => ({ id: e.id, name: e.title || "Untitled entry" })),
      };
    default:
      return { folders: [], entries: [] };
  }
}

function openNotebookLinkModal(opts = {}) {
  notebookLinkWizard = {
    editingIcon: opts.editingIcon || null,
    step: "section",
    section: null,
    lang: null,
    path: [], // [{ type: "root"|"folder", id, name }] -- current position is the last entry
    chosenTarget: null, // { type: "section"|"folder"|"entry", id, name }
  };
  renderNotebookLinkModal();
  const modal = document.getElementById("notebook-link-modal");
  if (modal) {
    modal.hidden = false;
    // Assigning (not addEventListener) so re-opening the modal later
    // safely replaces this instead of stacking up duplicate handlers.
    modal.onclick = closeNotebookLinkModal;
  }
}

function closeNotebookLinkModal() {
  const modal = document.getElementById("notebook-link-modal");
  if (modal) {
    modal.hidden = true;
    modal.innerHTML = "";
  }
  notebookLinkWizard = null;
  // If placement was armed and a spot was clicked but the wizard got
  // cancelled before Save, nothing should actually get inserted.
  pendingLinkRange = null;
  pendingLinkSide = null;
}

function renderNotebookLinkModal() {
  const modal = document.getElementById("notebook-link-modal");
  if (!modal || !notebookLinkWizard) return;
  modal.innerHTML = "";

  const box = document.createElement("div");
  box.className = "notebook-link-modal-box";
  box.addEventListener("click", (e) => e.stopPropagation());

  if (notebookLinkWizard.step === "section") renderNotebookLinkSectionStep(box);
  else if (notebookLinkWizard.step === "language") renderNotebookLinkLanguageStep(box);
  else if (notebookLinkWizard.step === "browse") renderNotebookLinkBrowseStep(box);
  else if (notebookLinkWizard.step === "name") renderNotebookLinkNameStep(box);

  modal.appendChild(box);
}

function addNotebookLinkBackButton(box, onBack) {
  const back = document.createElement("button");
  back.type = "button";
  back.className = "notebook-link-back-btn";
  back.textContent = "← Back";
  back.addEventListener("click", onBack);
  box.appendChild(back);
}

function renderNotebookLinkSectionStep(box) {
  const heading = document.createElement("h2");
  heading.textContent = notebookLinkWizard.editingIcon ? "Edit link — where should it go?" : "Add a link — where should it go?";
  box.appendChild(heading);

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "Pick a section to link to.";
  box.appendChild(hint);

  const list = document.createElement("div");
  list.className = "link-option-list";
  NOTEBOOK_LINK_SECTIONS.forEach((sec) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "link-option";
    btn.textContent = sec.label;
    btn.addEventListener("click", () => {
      notebookLinkWizard.section = sec.id;
      if (sec.id === "listening") {
        // Nothing exists to browse yet -- go straight to naming it,
        // and it will always show up broken (see resolveNotebookLinkTarget).
        notebookLinkWizard.chosenTarget = { type: "section", id: null, name: "Listening" };
        notebookLinkWizard.step = "name";
      } else {
        notebookLinkWizard.step = "language";
      }
      renderNotebookLinkModal();
    });
    list.appendChild(btn);
  });
  box.appendChild(list);

  const actions = document.createElement("div");
  actions.className = "link-modal-actions";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "secondary";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", closeNotebookLinkModal);
  actions.appendChild(cancelBtn);
  box.appendChild(actions);
}

function renderNotebookLinkLanguageStep(box) {
  addNotebookLinkBackButton(box, () => {
    notebookLinkWizard.step = "section";
    notebookLinkWizard.section = null;
    renderNotebookLinkModal();
  });

  const sectionLabel = NOTEBOOK_LINK_SECTIONS.find((s) => s.id === notebookLinkWizard.section).label;
  const heading = document.createElement("h2");
  heading.textContent = sectionLabel;
  box.appendChild(heading);

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "Which language?";
  box.appendChild(hint);

  const list = document.createElement("div");
  list.className = "link-option-list";
  SUPPORTED_LANGUAGES.forEach((lang) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "link-option";
    btn.textContent = CLASS_NOTEBOOK_LANGUAGE_NAMES[lang];
    btn.addEventListener("click", () => {
      notebookLinkWizard.lang = lang;
      notebookLinkWizard.path = [
        { type: "root", id: null, name: `${sectionLabel} (${CLASS_NOTEBOOK_LANGUAGE_NAMES[lang]})` },
      ];
      notebookLinkWizard.step = "browse";
      renderNotebookLinkModal();
    });
    list.appendChild(btn);
  });
  box.appendChild(list);

  const actions = document.createElement("div");
  actions.className = "link-modal-actions";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "secondary";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", closeNotebookLinkModal);
  actions.appendChild(cancelBtn);
  box.appendChild(actions);
}

function renderNotebookLinkBrowseStep(box) {
  const path = notebookLinkWizard.path;
  const current = path[path.length - 1];

  addNotebookLinkBackButton(box, () => {
    if (path.length > 1) {
      path.pop();
    } else {
      notebookLinkWizard.step = "language";
      notebookLinkWizard.path = [];
    }
    renderNotebookLinkModal();
  });

  const heading = document.createElement("h2");
  heading.textContent = current.name;
  box.appendChild(heading);

  if (path.length > 1) {
    const crumb = document.createElement("p");
    crumb.className = "hint";
    crumb.textContent = path.map((p) => p.name).join(" › ");
    box.appendChild(crumb);
  }

  const linkHereBtn = document.createElement("button");
  linkHereBtn.type = "button";
  linkHereBtn.className = "link-option link-option-primary";
  linkHereBtn.textContent =
    current.type === "root" ? `Link here — ${current.name}` : `Link to this folder — ${current.name}`;
  linkHereBtn.addEventListener("click", () => {
    notebookLinkWizard.chosenTarget = {
      type: current.type === "root" ? "section" : "folder",
      id: current.id,
      name: current.name,
    };
    notebookLinkWizard.step = "name";
    renderNotebookLinkModal();
  });
  box.appendChild(linkHereBtn);

  const children = getNotebookLinkChildren(notebookLinkWizard.section, notebookLinkWizard.lang, current.id);
  const list = document.createElement("div");
  list.className = "link-option-list";

  children.folders.forEach((folder) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "link-option";
    btn.textContent = `📁 ${folder.name}`;
    btn.addEventListener("click", () => {
      path.push({ type: "folder", id: folder.id, name: folder.name });
      renderNotebookLinkModal();
    });
    list.appendChild(btn);
  });

  children.entries.forEach((entry) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "link-option";
    btn.textContent = entry.name;
    btn.addEventListener("click", () => {
      notebookLinkWizard.chosenTarget = { type: "entry", id: entry.id, name: entry.name };
      notebookLinkWizard.step = "name";
      renderNotebookLinkModal();
    });
    list.appendChild(btn);
  });

  if (children.folders.length === 0 && children.entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "Nothing in here yet.";
    list.appendChild(empty);
  }

  box.appendChild(list);

  const actions = document.createElement("div");
  actions.className = "link-modal-actions";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "secondary";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", closeNotebookLinkModal);
  actions.appendChild(cancelBtn);
  box.appendChild(actions);
}

function renderNotebookLinkNameStep(box) {
  const editingIcon = notebookLinkWizard.editingIcon;

  addNotebookLinkBackButton(box, () => {
    if (notebookLinkWizard.section === "listening") {
      notebookLinkWizard.step = "section";
      notebookLinkWizard.section = null;
    } else if (notebookLinkWizard.path.length > 0) {
      notebookLinkWizard.step = "browse";
    } else {
      notebookLinkWizard.step = "language";
    }
    renderNotebookLinkModal();
  });

  const heading = document.createElement("h2");
  heading.textContent = "Name this link";
  box.appendChild(heading);

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = `Links to: ${notebookLinkWizard.chosenTarget.name}`;
  box.appendChild(hint);

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Link name";
  nameInput.value = (editingIcon && editingIcon.dataset.name) || notebookLinkWizard.chosenTarget.name;
  box.appendChild(nameInput);

  const actions = document.createElement("div");
  actions.className = "link-modal-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "secondary";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", closeNotebookLinkModal);
  actions.appendChild(cancelBtn);

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "primary";
  saveBtn.textContent = "Save link";
  saveBtn.addEventListener("click", () => {
    const name = nameInput.value.trim() || notebookLinkWizard.chosenTarget.name;
    const linkData = {
      section: notebookLinkWizard.section,
      targetType: notebookLinkWizard.chosenTarget.type,
      targetId: notebookLinkWizard.chosenTarget.id,
      lang: notebookLinkWizard.lang,
      name,
    };
    if (editingIcon) {
      applyNotebookLinkEdit(editingIcon, linkData);
    } else {
      insertNotebookLinkAtPendingRange(linkData);
    }
    closeNotebookLinkModal();
  });
  actions.appendChild(saveBtn);

  box.appendChild(actions);
  nameInput.focus();
  nameInput.select();
}
