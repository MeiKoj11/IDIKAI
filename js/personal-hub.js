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
let editingStorageLockerId = null;

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

  const classNotebookLink = document.getElementById("class-notebook-launcher-link");
  if (classNotebookLink) classNotebookLink.href = `class-notebook.html?lang=${activePersonalLang}`;

  renderStorageLockerList();

  const addStorageLockerBtn = document.getElementById("add-storage-locker-btn");
  if (addStorageLockerBtn) addStorageLockerBtn.addEventListener("click", showAddStorageLockerForm);

  const cancelStorageLockerBtn = document.getElementById("cancel-storage-locker");
  if (cancelStorageLockerBtn) cancelStorageLockerBtn.addEventListener("click", hideAddStorageLockerForm);

  const storageLockerForm = document.getElementById("storage-locker-form");
  if (storageLockerForm) storageLockerForm.addEventListener("submit", handleAddStorageLockerSubmit);

  const storageLockerList = document.getElementById("storage-locker-list");
  if (storageLockerList) storageLockerList.addEventListener("click", handleStorageLockerListClick);

  initStorageLockerDropzone();
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

// Human-readable file size (1.2 MB, 340 KB, etc.) for uploaded items.
function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
    li.textContent = "Nothing saved yet — add a link or drop a file above.";
    li.dataset.immersionKey = "noStorageLockerItemsText";
    list.appendChild(li);
    return;
  }

  items.forEach((item) => {
    const isFile = item.kind === "file";
    const li = document.createElement("li");
    li.className = "word-item storage-locker-item" + (isFile ? " storage-locker-item-file" : "");

    if (item.id === editingStorageLockerId) {
      li.appendChild(buildStorageLockerEditForm(item));
      list.appendChild(li);
      return;
    }

    const main = document.createElement("div");
    main.className = "word-main";

    const icon = document.createElement("span");
    icon.className = "storage-locker-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = isFile ? "📄" : "🔗";
    main.appendChild(icon);

    if (isFile) {
      const link = document.createElement("a");
      link.className = "word-label storage-locker-link";
      link.textContent = item.title || item.fileName;
      link.href = `/api/storage-locker-download?key=${encodeURIComponent(item.fileKey)}&name=${encodeURIComponent(item.title || item.fileName || "file")}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      main.appendChild(link);

      if (item.fileSize) {
        const size = document.createElement("span");
        size.className = "storage-locker-file-size";
        size.textContent = formatFileSize(item.fileSize);
        main.appendChild(size);
      }
    } else {
      const link = document.createElement("a");
      link.className = "word-label storage-locker-link";
      link.textContent = item.title;
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      main.appendChild(link);
    }

    li.appendChild(main);

    const actions = document.createElement("span");
    actions.className = "word-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "secondary edit-storage-locker-btn";
    editBtn.textContent = "Rename";
    editBtn.dataset.immersionKey = "btnEdit";
    editBtn.dataset.itemId = item.id;
    actions.appendChild(editBtn);

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

function buildStorageLockerEditForm(item) {
  const isFile = item.kind === "file";
  const wrapper = document.createElement("div");
  wrapper.className = "storage-locker-edit-form";

  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.value = item.title || "";
  titleInput.className = "edit-storage-locker-title-input";
  titleInput.setAttribute("aria-label", "Title");
  wrapper.appendChild(titleInput);

  let urlInput = null;
  if (!isFile) {
    urlInput = document.createElement("input");
    urlInput.type = "text";
    urlInput.value = item.url || "";
    urlInput.className = "edit-storage-locker-url-input";
    urlInput.setAttribute("aria-label", "Link");
    wrapper.appendChild(urlInput);
  }

  const actions = document.createElement("div");
  actions.className = "detection-actions";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "Save";
  saveBtn.dataset.immersionKey = "btnSave";
  saveBtn.addEventListener("click", () => handleSaveStorageLockerEdit(item.id, wrapper, isFile));
  actions.appendChild(saveBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "secondary";
  cancelBtn.textContent = "Cancel";
  cancelBtn.dataset.immersionKey = "btnCancel";
  cancelBtn.addEventListener("click", () => {
    editingStorageLockerId = null;
    renderStorageLockerList();
  });
  actions.appendChild(cancelBtn);

  wrapper.appendChild(actions);
  return wrapper;
}

function handleSaveStorageLockerEdit(itemId, wrapper, isFile) {
  const title = wrapper.querySelector(".edit-storage-locker-title-input").value.trim();
  if (!title) {
    alert(isFile ? "Give this file a name." : "A saved link needs a title.");
    return;
  }
  const updates = { title };
  if (!isFile) {
    const urlInput = wrapper.querySelector(".edit-storage-locker-url-input");
    const url = normalizeStorageLockerUrl(urlInput.value);
    if (!url) {
      alert("A saved link needs a URL.");
      return;
    }
    updates.url = url;
  }
  Storage.updateStorageLockerItem(itemId, updates);
  editingStorageLockerId = null;
  renderStorageLockerList();
}

function handleStorageLockerListClick(e) {
  if (e.target.classList.contains("edit-storage-locker-btn")) {
    editingStorageLockerId = e.target.dataset.itemId;
    renderStorageLockerList();
    return;
  }

  if (e.target.classList.contains("delete-storage-locker-btn")) {
    const itemId = e.target.dataset.itemId;
    const item = Storage.getStorageLockerItems(activePersonalLang).find((i) => i.id === itemId);
    if (!item) return;
    if (!confirm(item.kind === "file" ? "Delete this saved file?" : "Delete this saved link?")) return;

    if (item.kind === "file" && item.fileKey) {
      // Remove the R2 object first — if that fails, keep the list entry
      // so the file isn't silently orphaned with no way to retry.
      fetch(`/api/storage-locker-file?key=${encodeURIComponent(item.fileKey)}`, { method: "DELETE" })
        .then((res) => {
          if (!res.ok) throw new Error("Could not delete the file from storage.");
          Storage.deleteStorageLockerItem(itemId);
          renderStorageLockerList();
        })
        .catch((err) => {
          console.error(err);
          alert("Couldn't delete that file — please try again.");
        });
      return;
    }

    Storage.deleteStorageLockerItem(itemId);
    renderStorageLockerList();
  }
}

// ---------------------------------------------------------------------
// Storage Locker — real file uploads (Cloudflare R2). Kept deliberately
// separate from the link CRUD above: the upload endpoint only returns
// file metadata, then this reuses Storage.addStorageLockerItem (the
// same proven cache-sync path the link items already use) to persist
// the list entry, rather than inventing a second write path.
// ---------------------------------------------------------------------

const STORAGE_LOCKER_ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx"];
const STORAGE_LOCKER_MAX_BYTES = 25 * 1024 * 1024;

function setStorageLockerUploadStatus(message, isError) {
  const el = document.getElementById("storage-locker-upload-status");
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
  el.classList.toggle("storage-locker-upload-error", !!isError);
}

function initStorageLockerDropzone() {
  const dropzone = document.getElementById("storage-locker-dropzone");
  const fileInput = document.getElementById("storage-locker-file-input");
  if (!dropzone || !fileInput) return;

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files[0]) uploadStorageLockerFile(fileInput.files[0]);
    fileInput.value = "";
  });

  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("storage-locker-dropzone-active");
    });
  });
  ["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("storage-locker-dropzone-active");
    });
  });
  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) uploadStorageLockerFile(file);
  });
}

function uploadStorageLockerFile(file) {
  const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
  if (!STORAGE_LOCKER_ALLOWED_EXTENSIONS.includes(ext)) {
    setStorageLockerUploadStatus("Only PDF and Word documents (.pdf, .doc, .docx) can be uploaded.", true);
    return;
  }
  if (file.size > STORAGE_LOCKER_MAX_BYTES) {
    setStorageLockerUploadStatus("That file is larger than the 25 MB limit.", true);
    return;
  }

  setStorageLockerUploadStatus(`Uploading "${file.name}"…`, false);

  fetch("/api/storage-locker-upload", {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
    },
    body: file,
  })
    .then((res) =>
      res.json().then((body) => {
        if (!res.ok) throw new Error(body.error || "Upload failed.");
        return body;
      })
    )
    .then((result) => {
      Storage.addStorageLockerItem({
        language: activePersonalLang,
        kind: "file",
        title: result.fileName,
        fileKey: result.fileKey,
        fileName: result.fileName,
        fileType: result.fileType,
        fileSize: result.fileSize,
      });
      setStorageLockerUploadStatus("", false);
      renderStorageLockerList();
    })
    .catch((err) => {
      console.error(err);
      setStorageLockerUploadStatus(err.message || "Upload failed — please try again.", true);
    });
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
