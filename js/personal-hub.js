/*
  personal-hub.js
  ---------------
  The "make your own bubble" space — freeform note cards (a title plus
  a block of text) with no imposed structure. Deliberately the simplest
  CRUD in the whole app: no folders, no AI, no per-language quirks beyond
  filtering — just add, edit, delete.
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
  if (heading) heading.textContent = `${PERSONAL_HUB_LANGUAGE_NAMES[activePersonalLang]} Personal Hub`;
  const backLink = document.getElementById("personal-hub-back-link");
  if (backLink) backLink.href = `language-home.html?lang=${activePersonalLang}`;
  const header = document.getElementById("personal-hub-header");
  if (header) header.classList.add(`lang-${activePersonalLang}`);
  initTopbar(activePersonalLang);
  if (typeof initHubTasks === "function") initHubTasks(activePersonalLang);
  initAppTabs({
    section: "personal-hub",
    language: activePersonalLang,
    label: `${PERSONAL_HUB_LANGUAGE_NAMES[activePersonalLang]} Personal Hub`,
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
});

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
    editBtn.dataset.noteId = note.id;
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "secondary delete-personal-note-btn";
    deleteBtn.textContent = "Delete";
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
  saveBtn.addEventListener("click", () => handleSavePersonalNoteEdit(note.id, wrapper));
  actions.appendChild(saveBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "secondary";
  cancelBtn.textContent = "Cancel";
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
