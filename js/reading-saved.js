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

document.addEventListener("DOMContentLoaded", () => {
  const list = document.getElementById("passage-list");
  if (!list) return; // not this page

  const langParam = getReadingSavedQueryParam("lang");
  readingSavedLang = SUPPORTED_LANGUAGES.includes(langParam) ? langParam : null;

  const backLink = document.getElementById("reading-saved-back-link");
  if (backLink && readingSavedLang) backLink.href = `reading.html?lang=${readingSavedLang}`;

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

  if (passages.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-hint";
    li.textContent = "No saved passages yet.";
    li.dataset.immersionKey = "noSavedPassagesYetText";
    list.appendChild(li);
    return;
  }

  passages.forEach((p) => {
    const li = document.createElement("li");
    li.className = `theme-item lang-${p.language}`;
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
    const count = readingSavedWordCount(p.text, p.language);
    countBadge.textContent = p.language === "ja" ? `${count} characters` : `${count} words`;
    meta.appendChild(countBadge);
    li.appendChild(meta);

    list.appendChild(li);
  });
}
