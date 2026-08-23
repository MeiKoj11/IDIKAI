/*
  app-tabs.js
  -----------
  A site-wide tab strip that sits just under the topbar, on every page
  that has one. Lets you keep several corners of the app open at once —
  one tab pinned to a Vocab theme, another to a Writing entry, another
  to a Grammar folder — and jump between them without losing your place.
  This is real page navigation on click (window.location.href), not an
  in-page content swap, so browser back/forward and cmd-click still work
  normally.

  This REPLACES Vocab Bank's own add-vocab.html-only tab strip, which
  did the same job but only within that one page.

  State (which tabs are open, which one is active) lives in
  sessionStorage — same tradeoff Vocab Bank's own tabs already made:
  survives reloads and in-app navigation, clears when the browser tab
  closes.

  Every page that has the #app-tab-strip markup calls initAppTabs(current)
  once, after it has resolved its own language/title — mirroring the
  established initTopbar(lang) pattern. `current` is either:
    - null/undefined  — this page isn't a addressable "unit" worth
      pinning (a list/hub/picker page like theme.html or quiz.html) —
      the strip still renders whatever's already open, just doesn't add
      a new tab for the page itself.
    - { section, language, label, href } — this page IS a unit worth
      remembering (e.g. one specific Writing entry) — it's added to the
      open tabs (or brought to the front / relabeled if already open)
      and marked active.

  section is one of: "vocab", "grammar", "writing", "speaking",
  "reading", "personal-hub", "listening" (listening has no content page
  yet, it only ever appears as a "coming soon" option in the picker).
*/

const APP_TABS_SESSION_KEY = "appTabs.open";
const APP_TABS_ACTIVE_SESSION_KEY = "appTabs.activeHref";
const APP_TAB_LANGUAGE_NAMES = { es: "Spanish", ja: "Japanese" };

const APP_TAB_SECTION_LABELS = {
  vocab: "Vocab Bank",
  grammar: "Grammar",
  writing: "Writing",
  speaking: "Speaking",
  reading: "Reading",
  "personal-hub": "Personal Hub",
  listening: "Listening",
};

let _appTabsCurrentLanguage = "es";

function getOpenAppTabs() {
  try {
    const raw = sessionStorage.getItem(APP_TABS_SESSION_KEY);
    const tabs = raw ? JSON.parse(raw) : [];
    return Array.isArray(tabs) ? tabs : [];
  } catch (e) {
    return [];
  }
}

function saveOpenAppTabs(tabs) {
  try {
    sessionStorage.setItem(APP_TABS_SESSION_KEY, JSON.stringify(tabs));
  } catch (e) {}
}

function getActiveAppTabHref() {
  try {
    return sessionStorage.getItem(APP_TABS_ACTIVE_SESSION_KEY);
  } catch (e) {
    return null;
  }
}

function setActiveAppTabHref(href) {
  try {
    if (href) sessionStorage.setItem(APP_TABS_ACTIVE_SESSION_KEY, href);
    else sessionStorage.removeItem(APP_TABS_ACTIVE_SESSION_KEY);
  } catch (e) {}
}

// The single entry point every page calls once. See file header for
// what `current` should be.
function initAppTabs(current) {
  const strip = document.getElementById("app-tab-strip");
  if (!strip) return; // this page doesn't have the tab-strip markup

  if (current && current.language) _appTabsCurrentLanguage = current.language;

  let tabs = getOpenAppTabs();
  let activeHref = getActiveAppTabHref();

  if (current && current.href) {
    const existingIdx = tabs.findIndex((t) => t.href === current.href);
    const tabRecord = {
      href: current.href,
      label: current.label || current.href,
      language: current.language || null,
      section: current.section || null,
    };
    if (existingIdx === -1) {
      tabs = tabs.concat([tabRecord]);
    } else {
      // Keep the label fresh — a theme/entry may have been renamed
      // since this tab was first opened.
      tabs = tabs.slice();
      tabs[existingIdx] = tabRecord;
    }
    saveOpenAppTabs(tabs);
    activeHref = current.href;
    setActiveAppTabHref(activeHref);
  }

  renderAppTabStrip(tabs, activeHref);
  wireAppTabPicker();
}

// Reordering open tabs (drag one onto another to swap its place, same
// gesture as Safari/Chrome's own browser tabs) — native HTML5 drag and
// drop rather than a pointer-tracking implementation, since these are
// plain flex-row siblings and the browser already knows how to do this.
let draggedAppTabHref = null;

function buildAppTabElement(tab, activeHref) {
  const a = document.createElement("a");
  a.href = tab.href;
  a.className = "app-tab" + (tab.language ? ` lang-${tab.language}` : "") + (tab.href === activeHref ? " active" : "");
  a.title = tab.label;
  a.draggable = true;

  const label = document.createElement("span");
  label.className = "app-tab-label";
  label.textContent = tab.label;
  a.appendChild(label);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "app-tab-close";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", `Close ${tab.label} tab`);
  closeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeAppTab(tab.href);
  });
  a.appendChild(closeBtn);

  a.addEventListener("dragstart", (e) => {
    draggedAppTabHref = tab.href;
    a.classList.add("app-tab-dragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      // Some browsers (Firefox) require data to be set for the drag to
      // actually start — the value itself isn't used, reordering reads
      // draggedAppTabHref instead.
      e.dataTransfer.setData("text/plain", tab.href);
    }
  });

  a.addEventListener("dragover", (e) => {
    if (!draggedAppTabHref || draggedAppTabHref === tab.href) return;
    e.preventDefault(); // required to allow a drop
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  });

  a.addEventListener("drop", (e) => {
    if (!draggedAppTabHref || draggedAppTabHref === tab.href) return;
    e.preventDefault();
    reorderAppTabs(draggedAppTabHref, tab.href);
  });

  a.addEventListener("dragend", () => {
    draggedAppTabHref = null;
    a.classList.remove("app-tab-dragging");
  });

  return a;
}

function renderAppTabStrip(tabs, activeHref) {
  const tabsContainer = document.getElementById("app-tab-strip-tabs");
  if (!tabsContainer) return;
  tabsContainer.innerHTML = "";
  tabs.forEach((tab) => tabsContainer.appendChild(buildAppTabElement(tab, activeHref)));
}

// Moves the dragged tab to sit where the target tab currently is,
// shifting the rest over — a plain array move, not a swap.
function reorderAppTabs(draggedHref, targetHref) {
  const tabs = getOpenAppTabs();
  const fromIdx = tabs.findIndex((t) => t.href === draggedHref);
  const toIdx = tabs.findIndex((t) => t.href === targetHref);
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

  const [moved] = tabs.splice(fromIdx, 1);
  tabs.splice(toIdx, 0, moved);
  saveOpenAppTabs(tabs);
  renderAppTabStrip(tabs, getActiveAppTabHref());
}

// A page can opt in to being asked before its own tab is closed by
// setting these two globals (writing-app.js does, for its edit-mode
// autosave): appTabDirtyCheck() reports whether there's anything not
// yet saved, appTabDirtySave() saves it. Only relevant for the tab
// matching the page you're actually looking at right now — a
// background tab is a different page load with its own autosave
// already keeping itself safe independently.
function currentAppTabHref() {
  return window.location.pathname.split("/").pop() + window.location.search;
}

function closeAppTab(href) {
  const wasActive = getActiveAppTabHref() === href;
  const isCurrentPage = href === currentAppTabHref();

  if (isCurrentPage && typeof window.appTabDirtyCheck === "function" && window.appTabDirtyCheck()) {
    const save = confirm("You have unsaved changes here. Click OK to save before closing this tab, or Cancel to keep editing.");
    if (!save) return; // stay put — nothing closed, nothing lost
    if (typeof window.appTabDirtySave === "function") window.appTabDirtySave();
  }

  let tabs = getOpenAppTabs();
  tabs = tabs.filter((t) => t.href !== href);
  saveOpenAppTabs(tabs);

  if (wasActive) {
    const next = tabs[tabs.length - 1];
    setActiveAppTabHref(next ? next.href : null);
    window.location.href = next ? next.href : "index.html";
    return;
  }
  renderAppTabStrip(tabs, getActiveAppTabHref());
}

// ---- the "+" picker: choose a section, then (for most sections) a
// specific unit within it, then Open navigates there for real. ----

function wireAppTabPicker() {
  const plusBtn = document.getElementById("app-tab-plus");
  const panel = document.getElementById("app-tab-picker-panel");
  const sectionSelect = document.getElementById("app-tab-section-select");
  const unitSelect = document.getElementById("app-tab-unit-select");
  const openBtn = document.getElementById("app-tab-open-btn");
  const cancelBtn = document.getElementById("app-tab-picker-cancel");
  if (!plusBtn || !panel || plusBtn.dataset.wired === "true") return;
  plusBtn.dataset.wired = "true";

  plusBtn.addEventListener("click", () => {
    panel.hidden = false;
    plusBtn.hidden = true;
    sectionSelect.value = "";
    unitSelect.hidden = true;
    unitSelect.innerHTML = "";
    openBtn.hidden = true;
  });

  cancelBtn.addEventListener("click", () => resetAppTabPicker());

  sectionSelect.addEventListener("change", () => {
    const section = sectionSelect.value;
    if (section === "listening") {
      alert("Listening isn't built yet — nothing to open there.");
      sectionSelect.value = "";
      unitSelect.hidden = true;
      openBtn.hidden = true;
      return;
    }
    if (section === "personal-hub") {
      unitSelect.hidden = true;
      unitSelect.innerHTML = "";
      openBtn.hidden = false;
      return;
    }
    populateAppTabUnitSelect(section, unitSelect);
    unitSelect.hidden = false;
    openBtn.hidden = false;
  });

  openBtn.addEventListener("click", () => {
    const section = sectionSelect.value;
    if (!section) return;
    const lang = _appTabsCurrentLanguage;

    if (section === "personal-hub") {
      resetAppTabPicker();
      window.location.href = `personal-hub.html?lang=${lang}`;
      return;
    }

    const opt = unitSelect.options[unitSelect.selectedIndex];
    if (!opt || !opt.value) return;

    if (opt.value === "__new_vocab__" || opt.value === "__new_grammar__") {
      const isVocab = opt.value === "__new_vocab__";
      const name = (prompt(`Name for the new ${isVocab ? "theme" : "folder"}:`) || "").trim();
      if (!name) return; // stay on the picker — nothing created, nothing to open
      const created = isVocab ? Storage.addTheme(name, lang) : Storage.addGrammarTheme(name, lang);
      const href = isVocab
        ? `add-vocab.html?id=${encodeURIComponent(created.id)}`
        : `grammar-theme.html?id=${encodeURIComponent(created.id)}`;
      resetAppTabPicker();
      window.location.href = href;
      return;
    }

    resetAppTabPicker();
    window.location.href = opt.value;
  });
}

function resetAppTabPicker() {
  const plusBtn = document.getElementById("app-tab-plus");
  const panel = document.getElementById("app-tab-picker-panel");
  if (panel) panel.hidden = true;
  if (plusBtn) plusBtn.hidden = false;
}

function appTabAddUnitOption(select, href, label) {
  const opt = document.createElement("option");
  opt.value = href;
  opt.textContent = label;
  select.appendChild(opt);
}

function populateAppTabUnitSelect(section, unitSelect) {
  const lang = _appTabsCurrentLanguage;
  const langName = APP_TAB_LANGUAGE_NAMES[lang] || "";
  unitSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.disabled = true;
  placeholder.selected = true;
  placeholder.textContent = "Which one?";
  unitSelect.appendChild(placeholder);

  // Every section always offers a way to create something new and open
  // it directly, even when nothing exists yet for this language — not
  // just a list of what's already there.
  if (section === "vocab") {
    Storage.getThemes()
      .filter((t) => t.language === lang)
      .forEach((t) => appTabAddUnitOption(unitSelect, `add-vocab.html?id=${encodeURIComponent(t.id)}`, t.name));
    appTabAddUnitOption(unitSelect, "__new_vocab__", "+ New theme…");
  } else if (section === "grammar") {
    Storage.getGrammarThemes(lang).forEach((t) =>
      appTabAddUnitOption(unitSelect, `grammar-theme.html?id=${encodeURIComponent(t.id)}`, t.name)
    );
    appTabAddUnitOption(unitSelect, "__new_grammar__", "+ New folder…");
  } else if (section === "writing") {
    appTabAddUnitOption(unitSelect, `writing.html?lang=${lang}`, `${langName} Writing (list)`);
    appTabAddUnitOption(unitSelect, `writing-entry.html?lang=${lang}`, "+ New entry");
    Storage.getWritingEntries(lang).forEach((e) =>
      appTabAddUnitOption(unitSelect, `writing-entry.html?id=${encodeURIComponent(e.id)}`, e.title || "Untitled entry")
    );
  } else if (section === "speaking") {
    appTabAddUnitOption(unitSelect, `speaking.html?lang=${lang}`, `${langName} Speaking (list)`);
    appTabAddUnitOption(unitSelect, `speaking-entry.html?lang=${lang}`, "+ New entry");
    Storage.getSpeakingEntries(lang).forEach((e) =>
      appTabAddUnitOption(unitSelect, `speaking-entry.html?id=${encodeURIComponent(e.id)}`, e.title || "Untitled entry")
    );
  } else if (section === "reading") {
    appTabAddUnitOption(unitSelect, `reading.html?lang=${lang}`, `${langName} Reading (list)`);
    Storage.getPassages()
      .filter((p) => p.language === lang)
      .forEach((p) => appTabAddUnitOption(unitSelect, `passage.html?id=${encodeURIComponent(p.id)}`, p.title || "Untitled passage"));
  }
}
