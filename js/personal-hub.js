/*
  personal-hub.js
  ---------------
  The Main Hub page: the "make your own bubble" space (freeform note
  cards — a title plus a block of text, no imposed structure), plus the
  Storage Locker (saved title+link entries, phase 1 of a proper file
  storage feature — see the Storage Locker block below for the full
  rationale). Deliberately simple CRUD throughout: no folders, no AI,
  no per-language quirks beyond filtering — just add, edit, delete.
*/

const PERSONAL_HUB_LANGUAGE_NAMES = { es: "Spanish", ja: "Japanese", fr: "French" };

let activePersonalLang = "es";
let editingPersonalNoteId = null;

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

document.addEventListener("DOMContentLoaded", () => {
  const list = document.getElementById("personal-note-list");
  if (!list) return; // not this page

  const langParam = getQueryParam("lang");
  activePersonalLang = SUPPORTED_LANGUAGES.includes(langParam) ? langParam : "es";

  const heading = document.getElementById("personal-hub-heading");
  if (heading) heading.textContent = `${PERSONAL_HUB_LANGUAGE_NAMES[activePersonalLang]} Main Hub`;
  const backLink = document.getElementById("personal-hub-back-link");
  if (backLink) backLink.href = `language-home.html?lang=${activePersonalLang}`;
  const header = document.getElementById("personal-hub-header");
  if (header) header.classList.add(`lang-${activePersonalLang}`);
  initTopbar(activePersonalLang);
  if (typeof initHubTasks === "function") initHubTasks(activePersonalLang);
  initAppTabs({
    section: "personal-hub",
    language: activePersonalLang,
    label: `${PERSONAL_HUB_LANGUAGE_NAMES[activePersonalLang]} Main Hub`,
    href: `personal-hub.html?lang=${activePersonalLang}`,
  });

  renderPersonalNoteList();
  if (typeof initHelperNotebookHub === "function") initHelperNotebookHub(activePersonalLang);

  const addBtn = document.getElementById("add-personal-note-btn");
  if (addBtn) addBtn.addEventListener("click", showAddPersonalNoteForm);

  const cancelBtn = document.getElementById("cancel-personal-note");
  if (cancelBtn) cancelBtn.addEventListener("click", hideAddPersonalNoteForm);

  const form = document.getElementById("personal-note-form");
  if (form) form.addEventListener("submit", handleAddPersonalNoteSubmit);

  list.addEventListener("click", handlePersonalNoteListClick);

  renderStorageLockerList();

  const addStorageLockerBtn = document.getElementById("add-storage-locker-btn");
  if (addStorageLockerBtn) addStorageLockerBtn.addEventListener("click", showAddStorageLockerForm);

  const cancelStorageLockerBtn = document.getElementById("cancel-storage-locker");
  if (cancelStorageLockerBtn) cancelStorageLockerBtn.addEventListener("click", hideAddStorageLockerForm);

  const storageLockerForm = document.getElementById("storage-locker-form");
  if (storageLockerForm) storageLockerForm.addEventListener("submit", handleAddStorageLockerSubmit);

  const storageLockerList = document.getElementById("storage-locker-list");
  if (storageLockerList) storageLockerList.addEventListener("click", handleStorageLockerListClick);
});

// ---------------------------------------------------------------------
// Storage Locker — a saved title + link, click to open in a new tab.
// Phase 1 of a proper file storage feature: links only (to a PDF on
// Drive/Dropbox/wherever, or any other page), not file uploads yet —
// real uploads need their own storage/backup infrastructure decision
// before building (this app's DB+backups are sized for small text
// data, not binary files), so this ships the useful, zero-risk half
// first. Same per-language CRUD shape as Personal Notes above.
// ---------------------------------------------------------------------

function showAddStorageLockerForm() {
  const wrap = document.getElementById("storage-locker-form-wrap");
  if (wrap) wrap.hidden = false;
  const addBtn = document.getElementById("add-storage-locker-btn");
  if (addBtn) addBtn.hidden = true;
  const titleInput = document.getElementById("storage-locker-title");
  if (titleInput) titleInput.focus();
}

function hideAddStorageLockerForm() {
  const wrap = document.getElementById("storage-locker-form-wrap");
  if (wrap) wrap.hidden = true;
  const addBtn = document.getElementById("add-storage-locker-btn");
  if (addBtn) addBtn.hidden = false;
  const form = document.getElementById("storage-locker-form");
  if (form) form.reset();
}

// Adds https:// when the learner pastes a bare domain/path with no
// scheme — otherwise the saved link's href would be treated as
// relative to whatever page it's clicked from, instead of navigating
// out to the real address.
function normalizeStorageLockerUrl(raw) {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function handleAddStorageLockerSubmit(e) {
  e.preventDefault();
  const titleInput = document.getElementById("storage-locker-title");
  const urlInput = document.getElementById("storage-locker-url");
  const title = titleInput.value.trim();
  const url = normalizeStorageLockerUrl(urlInput.value);
  if (!title || !url) return;

  Storage.addStorageLockerItem({
    language: activePersonalLang,
    title,
    url,
  });

  hideAddStorageLockerForm();
  renderStorageLockerList();
}

function renderStorageLockerList() {
  const list = document.getElementById("storage-locker-list");
  if (!list) return;
  const items = Storage.getStorageLockerItems(activePersonalLang)
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);
  list.innerHTML = "";

  if (items.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-hint";
    li.textContent = "Nothing saved yet — add a link above.";
    li.dataset.immersionKey = "noStorageLockerItemsText";
    list.appendChild(li);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "word-item storage-locker-item";

    const main = document.createElement("div");
    main.className = "word-main";

    const link = document.createElement("a");
    link.className = "word-label storage-locker-link";
    link.textContent = item.title;
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    main.appendChild(link);

    li.appendChild(main);

    const actions = document.createElement("span");
    actions.className = "word-actions";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "secondary delete-storage-locker-btn";
    deleteBtn.textContent = "Delete";
    deleteBtn.dataset.immersionKey = "btnDelete";
    deleteBtn.dataset.itemId = item.id;
    actions.appendChild(deleteBtn);

    li.appendChild(actions);
    list.appendChild(li);
  });
}

function handleStorageLockerListClick(e) {
  if (e.target.classList.contains("delete-storage-locker-btn")) {
    if (!confirm("Delete this saved link?")) return;
    Storage.deleteStorageLockerItem(e.target.dataset.itemId);
    renderStorageLockerList();
  }
}

function showAddPersonalNoteForm() {
  const wrap = document.getElementById("personal-note-form-wrap");
  if (wrap) wrap.hidden = false;
  const addBtn = document.getElementById("add-personal-note-btn");
  if (addBtn) addBtn.hidden = true;
  const titleInput = document.getElementById("personal-note-title");
  if (titleInput) titleInput.focus();
}

function hideAddPersonalNoteForm() {
  const wrap = document.getElementById("personal-note-form-wrap");
  if (wrap) wrap.hidden = true;
  const addBtn = document.getElementById("add-personal-note-btn");
  if (addBtn) addBtn.hidden = false;
  const form = document.getElementById("personal-note-form");
  if (form) form.reset();
}

function handleAddPersonalNoteSubmit(e) {
  e.preventDefault();
  const titleInput = document.getElementById("personal-note-title");
  const contentInput = document.getElementById("personal-note-content");
  const title = titleInput.value.trim();
  if (!title) return;

  Storage.addPersonalNote({
    language: activePersonalLang,
    title,
    content: contentInput.value.trim(),
  });

  hideAddPersonalNoteForm();
  renderPersonalNoteList();
}

function renderPersonalNoteList() {
  const list = document.getElementById("personal-note-list");
  if (!list) return;
  const notes = Storage.getPersonalNotes(activePersonalLang);
  list.innerHTML = "";

  if (notes.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-hint";
    li.textContent = "No bubbles yet — add one above.";
    li.dataset.immersionKey = "noBubblesYetText";
    list.appendChild(li);
    return;
  }

  notes.forEach((note) => {
    const li = document.createElement("li");
    li.className = "word-item personal-note-item";

    if (note.id === editingPersonalNoteId) {
      li.appendChild(buildPersonalNoteEditForm(note));
      list.appendChild(li);
      return;
    }

    const main = document.createElement("div");
    main.className = "word-main";

    const title = document.createElement("span");
    title.className = "word-label personal-note-title";
    title.textContent = note.title;
    main.appendChild(title);

    if (note.content) {
      const preview = document.createElement("span");
      preview.className = "word-example personal-note-preview";
      preview.textContent = note.content;
      main.appendChild(preview);
    }

    li.appendChild(main);

    const actions = document.createElement("span");
    actions.className = "word-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "secondary edit-personal-note-btn";
    editBtn.textContent = "Edit";
    editBtn.dataset.immersionKey = "btnEdit";
    editBtn.dataset.noteId = note.id;
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "secondary delete-personal-note-btn";
    deleteBtn.textContent = "Delete";
    deleteBtn.dataset.immersionKey = "btnDelete";
    deleteBtn.dataset.noteId = note.id;
    actions.appendChild(deleteBtn);

    li.appendChild(actions);
    list.appendChild(li);
  });
}

function buildPersonalNoteEditForm(note) {
  const wrapper = document.createElement("div");
  wrapper.className = "personal-note-edit-form";

  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.value = note.title;
  titleInput.className = "edit-personal-note-title-input";
  titleInput.setAttribute("aria-label", "Title");
  wrapper.appendChild(titleInput);

  const contentInput = document.createElement("textarea");
  contentInput.rows = 5;
  contentInput.value = note.content || "";
  contentInput.className = "edit-personal-note-content-input";
  contentInput.setAttribute("aria-label", "Notes");
  wrapper.appendChild(contentInput);

  const actions = document.createElement("div");
  actions.className = "detection-actions";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "Save";
  saveBtn.dataset.immersionKey = "btnSave";
  saveBtn.addEventListener("click", () => handleSavePersonalNoteEdit(note.id, wrapper));
  actions.appendChild(saveBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "secondary";
  cancelBtn.textContent = "Cancel";
  cancelBtn.dataset.immersionKey = "btnCancel";
  cancelBtn.addEventListener("click", () => {
    editingPersonalNoteId = null;
    renderPersonalNoteList();
  });
  actions.appendChild(cancelBtn);

  wrapper.appendChild(actions);
  return wrapper;
}

function handleSavePersonalNoteEdit(noteId, wrapper) {
  const title = wrapper.querySelector(".edit-personal-note-title-input").value.trim();
  if (!title) {
    alert("A bubble needs a title.");
    return;
  }
  const content = wrapper.querySelector(".edit-personal-note-content-input").value.trim();
  Storage.updatePersonalNote(noteId, { title, content });
  editingPersonalNoteId = null;
  renderPersonalNoteList();
}

function handlePersonalNoteListClick(e) {
  if (e.target.classList.contains("delete-personal-note-btn")) {
    Storage.deletePersonalNote(e.target.dataset.noteId);
    renderPersonalNoteList();
    return;
  }
  if (e.target.classList.contains("edit-personal-note-btn")) {
    editingPersonalNoteId = e.target.dataset.noteId;
    renderPersonalNoteList();
  }
}
