/*
  reading-saved.js
  -----------------
  The Saved Passages page — just the passage list + folder filter that
  used to live at the bottom of reading.html, moved out to its own page
  (linked from a "Saved passages" button on Reading) so the create-a-
  passage page stays uncluttered. Reuses the exact same data/markup
  Storage.getPassages()/getReadingFolder() already provide.
*/

const READING_SAVED_LANGUAGE_NAMES = { es: "Spanish", ja: "Japanese", fr: "French" };
const READING_SAVED_FILTER_NO_FOLDER_VALUE = "__no_folder__";
const READING_SAVED_FILTER_ALL_VALUE = "";

let readingSavedLang = null;
let readingSavedFolderFilter = READING_SAVED_FILTER_ALL_VALUE;

function getReadingSavedQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function readingSavedWordCount(text, lang) {
  if (lang === "ja") return text.replace(/\s+/g, "").length;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Rough length label for the list's meta line — mirrors the "Short /
// Medium / Long" categories from the design mockup without needing a
// stored field, derived straight from the same count already shown.
function readingSavedLengthLabel(count) {
  if (count < 120) return "Short";
  if (count < 400) return "Medium";
  return "Long";
}

function readingSavedDateLabel(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" });
}

document.addEventListener("DOMContentLoaded", () => {
  const list = document.getElementById("passage-list");
  if (!list) return; // not this page

  const langParam = getReadingSavedQueryParam("lang");
  readingSavedLang = SUPPORTED_LANGUAGES.includes(langParam) ? langParam : null;

  const backLink = document.getElementById("reading-saved-back-link");
  if (backLink && readingSavedLang) backLink.href = `reading.html?lang=${readingSavedLang}`;

  const addBtn = document.getElementById("reading-saved-add-btn");
  if (addBtn && readingSavedLang) addBtn.href = `reading.html?lang=${readingSavedLang}`;

  const heading = document.getElementById("reading-saved-heading");
  if (heading && readingSavedLang) {
    heading.textContent = `${READING_SAVED_LANGUAGE_NAMES[readingSavedLang]} Saved Passages`;
  }

  const header = document.getElementById("reading-saved-header");
  if (header && readingSavedLang) header.classList.add(`lang-${readingSavedLang}`);

  initTopbar(readingSavedLang);
  if (typeof initHubTasks === "function") initHubTasks(readingSavedLang);
  initAppTabs({
    section: "reading",
    language: readingSavedLang || "es",
    label: readingSavedLang ? `${READING_SAVED_LANGUAGE_NAMES[readingSavedLang]} Saved Passages` : "Saved Passages",
    href: readingSavedLang ? `reading-saved.html?lang=${readingSavedLang}` : "reading-saved.html",
  });

  const filterSelect = document.getElementById("passage-folder-filter");
  if (filterSelect) filterSelect.addEventListener("change", () => {
    readingSavedFolderFilter = filterSelect.value;
    renderReadingSavedList();
  });

  renderReadingSavedFolderFilter();
  renderReadingSavedList();
});

function renderReadingSavedFolderFilter() {
  const select = document.getElementById("passage-folder-filter");
  if (!select) return;
  select.innerHTML = "";

  const allOpt = document.createElement("option");
  allOpt.value = READING_SAVED_FILTER_ALL_VALUE;
  allOpt.textContent = "All folders";
  allOpt.dataset.immersionKey = "allFoldersOption";
  select.appendChild(allOpt);

  const noneOpt = document.createElement("option");
  noneOpt.value = READING_SAVED_FILTER_NO_FOLDER_VALUE;
  noneOpt.textContent = "No folder (random passages)";
  noneOpt.dataset.immersionKey = "noFolderRandomPassagesOption";
  select.appendChild(noneOpt);

  Storage.getReadingFolders(readingSavedLang || undefined).forEach((folder) => {
    const opt = document.createElement("option");
    opt.value = folder.id;
    opt.textContent = folder.name;
    select.appendChild(opt);
  });
}

function renderReadingSavedList() {
  const list = document.getElementById("passage-list");
  if (!list) return;
  const allPassages = Storage.getPassages();
  let passages = readingSavedLang ? allPassages.filter((p) => p.language === readingSavedLang) : allPassages;
  if (readingSavedFolderFilter === READING_SAVED_FILTER_NO_FOLDER_VALUE) {
    passages = passages.filter((p) => !p.folderId);
  } else if (readingSavedFolderFilter) {
    passages = passages.filter((p) => p.folderId === readingSavedFolderFilter);
  }
  list.innerHTML = "";

  const countLabel = document.getElementById("reading-saved-count");
  if (countLabel) countLabel.textContent = `${passages.length} TEXT${passages.length === 1 ? "" : "S"}`;

  if (passages.length === 0) {
    const li = document.createElement("li");
    li.className = "locker-empty";
    li.textContent = "No saved passages yet.";
    li.dataset.immersionKey = "noSavedPassagesYetText";
    list.appendChild(li);
    return;
  }

  passages
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .forEach((p) => {
      list.appendChild(buildReadingSavedItem(p));
    });
}

function buildReadingSavedItem(p) {
  const li = document.createElement("li");
  li.className = `locker-item lang-${p.language}`;

  const body = document.createElement("div");
  body.className = "locker-item-body";

  const titleBtn = document.createElement("button");
  titleBtn.type = "button";
  titleBtn.className = "locker-item-title";
  titleBtn.style.cssText = "background:transparent; border:none; padding:0; font-size:15px; cursor:pointer; text-align:left";
  titleBtn.textContent = p.title;
  titleBtn.addEventListener("click", () => {
    window.location.href = `passage.html?id=${encodeURIComponent(p.id)}`;
  });
  body.appendChild(titleBtn);

  const sub = document.createElement("div");
  sub.className = "locker-item-sub";
  const count = readingSavedWordCount(p.text, p.language);
  const countText = p.language === "ja" ? `${count} characters` : `${count} words`;
  const folder = p.folderId ? Storage.getReadingFolder(p.folderId) : null;
  const subParts = [readingSavedLengthLabel(count), countText];
  if (folder) subParts.push(folder.name);
  const dateLabel = readingSavedDateLabel(p.createdAt);
  if (dateLabel) subParts.push(dateLabel);
  sub.textContent = subParts.join(" · ");
  body.appendChild(sub);

  li.appendChild(body);

  const progressWrap = document.createElement("div");
  progressWrap.className = "reading-progress-wrap";
  const track = document.createElement("div");
  track.className = "reading-progress-track";
  const fill = document.createElement("div");
  fill.className = "reading-progress-fill";
  const pct = typeof p.readProgress === "number" ? p.readProgress : 0;
  fill.style.width = `${p.finishedAt ? 100 : pct}%`;
  track.appendChild(fill);
  progressWrap.appendChild(track);
  const label = document.createElement("span");
  label.className = "reading-progress-label";
  if (p.finishedAt) {
    label.textContent = "Finished";
    label.dataset.immersionKey = "finishedStatus";
  } else if (pct > 0) {
    label.textContent = `${pct}% read`;
  } else {
    label.textContent = "Not started";
    label.dataset.immersionKey = "notStartedStatus";
  }
  progressWrap.appendChild(label);
  li.appendChild(progressWrap);

  const actions = document.createElement("div");
  actions.className = "locker-item-actions";
  const actionBtn = document.createElement("button");
  actionBtn.type = "button";
  actionBtn.className = "secondary";
  if (p.finishedAt) {
    actionBtn.textContent = "Re-read";
    actionBtn.dataset.immersionKey = "reReadButton";
  } else if (pct > 0) {
    actionBtn.textContent = "Continue";
    actionBtn.dataset.immersionKey = "continueReadingButton";
  } else {
    actionBtn.textContent = "Read";
    actionBtn.dataset.immersionKey = "readButton";
  }
  actionBtn.addEventListener("click", () => {
    window.location.href = `passage.html?id=${encodeURIComponent(p.id)}`;
  });
  actions.appendChild(actionBtn);
  li.appendChild(actions);

  return li;
}
