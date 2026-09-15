/*
  storage-locker.js
  ------------------
  The dedicated Storage Locker page: two columns, Links and Documents,
  both backed by the same Storage.*StorageLockerItem methods (an item's
  `kind` field — "link" or "document" — decides which column it lands
  in). Documents here are metadata only (title/type/note) - no real file
  upload/storage, matching how far the backend currently goes.
*/

const STORAGE_LOCKER_LANGUAGE_NAMES = { es: "Spanish", ja: "Japanese", fr: "French" };
let lockerLang = "es";
let lockerLinkFilter = "";
let lockerDocumentFilter = "";

function getLockerQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function lockerItemKind(item) {
  if (item.kind) return item.kind;
  return item.fileKey || item.docType ? "document" : "link";
}

document.addEventListener("DOMContentLoaded", () => {
  const list = document.getElementById("link-list");
  if (!list) return; // not this page

  const langParam = getLockerQueryParam("lang");
  lockerLang = SUPPORTED_LANGUAGES.includes(langParam) ? langParam : "es";
  const langName = STORAGE_LOCKER_LANGUAGE_NAMES[lockerLang];

  const eyebrow = document.getElementById("storage-locker-eyebrow");
  if (eyebrow) eyebrow.textContent = `${langName} · Storage Locker`;
  const backLink = document.getElementById("storage-locker-back-link");
  if (backLink) backLink.href = `personal-hub.html?lang=${lockerLang}`;
  const header = document.getElementById("storage-locker-header");
  if (header) header.classList.add(`lang-${lockerLang}`);

  initTopbar(lockerLang);
  if (typeof initHubTasks === "function") initHubTasks(lockerLang);
  initAppTabs({
    section: "personal-hub",
    language: lockerLang,
    label: `${langName} Storage Locker`,
    href: `storage-locker.html?lang=${lockerLang}`,
  });

  document.getElementById("add-link-btn").addEventListener("click", () => {
    document.getElementById("link-add-form").hidden = false;
  });
  document.getElementById("link-cancel-btn").addEventListener("click", () => {
    document.getElementById("link-add-form").hidden = true;
    document.getElementById("link-add-form").reset();
  });
  document.getElementById("link-add-form").addEventListener("submit", handleAddLink);

  document.getElementById("add-document-btn").addEventListener("click", () => {
    document.getElementById("document-add-form").hidden = false;
  });
  document.getElementById("document-cancel-btn").addEventListener("click", () => {
    document.getElementById("document-add-form").hidden = true;
    document.getElementById("document-add-form").reset();
  });
  document.getElementById("document-add-form").addEventListener("submit", handleAddDocument);

  document.getElementById("link-search").addEventListener("input", (e) => {
    lockerLinkFilter = e.target.value.trim().toLowerCase();
    renderLockerLists();
  });
  document.getElementById("document-search").addEventListener("input", (e) => {
    lockerDocumentFilter = e.target.value.trim().toLowerCase();
    renderLockerLists();
  });

  document.getElementById("link-list").addEventListener("click", handleLockerListClick);
  document.getElementById("document-list").addEventListener("click", handleLockerListClick);

  renderLockerLists();
});

function normalizeLockerUrl(raw) {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function urlDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    return url;
  }
}

function handleAddLink(e) {
  e.preventDefault();
  const title = document.getElementById("link-title-input").value.trim();
  const url = normalizeLockerUrl(document.getElementById("link-url-input").value);
  const note = document.getElementById("link-note-input").value.trim();
  if (!title || !url) return;
  Storage.addStorageLockerItem({ language: lockerLang, kind: "link", title, url, note });
  document.getElementById("link-add-form").reset();
  document.getElementById("link-add-form").hidden = true;
  renderLockerLists();
}

function handleAddDocument(e) {
  e.preventDefault();
  const title = document.getElementById("document-title-input").value.trim();
  const docType = document.getElementById("document-type-input").value;
  const note = document.getElementById("document-note-input").value.trim();
  if (!title) return;
  Storage.addStorageLockerItem({ language: lockerLang, kind: "document", title, docType, note });
  document.getElementById("document-add-form").reset();
  document.getElementById("document-add-form").hidden = true;
  renderLockerLists();
}

function handleLockerListClick(e) {
  const renameBtn = e.target.closest("[data-rename-id]");
  if (renameBtn) {
    const item = Storage.getStorageLockerItems(lockerLang).find((i) => i.id === renameBtn.dataset.renameId);
    if (!item) return;
    const newTitle = window.prompt("Rename:", item.title || "");
    if (newTitle && newTitle.trim()) {
      Storage.updateStorageLockerItem(item.id, { title: newTitle.trim() });
      renderLockerLists();
    }
    return;
  }
  const deleteBtn = e.target.closest("[data-delete-id]");
  if (deleteBtn) {
    if (window.confirm("Delete this item?")) {
      Storage.deleteStorageLockerItem(deleteBtn.dataset.deleteId);
      renderLockerLists();
    }
  }
}

function lockerDateLabel(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" });
}

const LOCKER_LINK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 1 0-5.66l3-3a4 4 0 0 1 5.66 5.66l-1.5 1.5"></path><path d="M14 10a4 4 0 0 1 0 5.66l-3 3a4 4 0 0 1-5.66-5.66l1.5-1.5"></path></svg>';
const LOCKER_DOCUMENT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13H7z"></path><path d="M14 3v5h5"></path></svg>';

function renderLockerLists() {
  const items = Storage.getStorageLockerItems(lockerLang).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const links = items.filter((i) => lockerItemKind(i) === "link");
  const documents = items.filter((i) => lockerItemKind(i) === "document");

  document.getElementById("link-count").textContent = `${links.length} ITEM${links.length === 1 ? "" : "S"}`;
  document.getElementById("document-count").textContent = `${documents.length} ITEM${documents.length === 1 ? "" : "S"}`;

  renderLockerColumn("link-list", links, lockerLinkFilter, true);
  renderLockerColumn("document-list", documents, lockerDocumentFilter, false);
}

function renderLockerColumn(listId, items, filter, isLink) {
  const list = document.getElementById(listId);
  list.innerHTML = "";
  const filtered = filter
    ? items.filter((i) => `${i.title || ""} ${i.note || ""} ${i.url || ""}`.toLowerCase().includes(filter))
    : items;

  if (filtered.length === 0) {
    const li = document.createElement("li");
    li.className = "locker-empty";
    li.textContent = isLink ? "No links saved yet." : "No documents saved yet.";
    list.appendChild(li);
    return;
  }

  filtered.forEach((item) => {
    const li = document.createElement("li");
    li.className = "locker-item";

    const icon = document.createElement("span");
    icon.className = "locker-item-icon";
    icon.innerHTML = isLink ? LOCKER_LINK_ICON : LOCKER_DOCUMENT_ICON;
    li.appendChild(icon);

    const body = document.createElement("div");
    body.className = "locker-item-body";

    let titleEl;
    if (isLink) {
      titleEl = document.createElement("a");
      titleEl.href = item.url;
      titleEl.target = "_blank";
      titleEl.rel = "noopener noreferrer";
    } else {
      titleEl = document.createElement("span");
    }
    titleEl.className = "locker-item-title";
    titleEl.textContent = item.title || "";
    body.appendChild(titleEl);

    const sub = document.createElement("div");
    sub.className = "locker-item-sub";
    sub.textContent = isLink
      ? `${urlDomain(item.url)} · ${lockerDateLabel(item.createdAt)}`
      : `${item.docType || "Document"} · ${lockerDateLabel(item.createdAt)}`;
    body.appendChild(sub);

    if (item.note) {
      const note = document.createElement("div");
      note.className = "locker-item-note";
      note.textContent = item.note;
      body.appendChild(note);
    }
    li.appendChild(body);

    const actions = document.createElement("div");
    actions.className = "locker-item-actions";
    actions.innerHTML = `
      <button type="button" class="link-btn" data-rename-id="${item.id}">Rename</button>
      <button type="button" class="link-btn" data-delete-id="${item.id}">Delete</button>
    `;
    li.appendChild(actions);

    list.appendChild(li);
  });
}
