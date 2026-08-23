/*
  helper-notebook-hub.js
  -----------------------
  The Helper Notebook panel on personal-hub.html: two quick-add
  reminder lists (Late / Homework — just short lines you can add and
  delete, no started/completed tracking, unlike the hub to-do widget)
  plus a standing pair of notes fields (to self, to teacher).

  Distinct from Writing's own Helper Notebook (js/writing-app.js), which
  tracks bracketed vocabulary words inside a specific entry — this one
  is per-language but not tied to any single piece of writing.
*/

let helperHubLang = null;

function initHelperNotebookHub(language) {
  const panel = document.getElementById("helper-notebook-hub-panel");
  if (!panel) return; // not this page

  helperHubLang = language;

  ["late", "homework"].forEach((category) => {
    const addBtn = panel.querySelector(`.helper-hub-reminder-add-btn[data-category="${category}"]`);
    const viewBtn = panel.querySelector(`.helper-hub-reminder-view-btn[data-category="${category}"]`);
    const addForm = document.getElementById(`helper-hub-${category}-add-form`);
    const cancelBtn = addForm ? addForm.querySelector(".helper-hub-reminder-add-cancel") : null;
    const list = document.getElementById(`helper-hub-${category}-list`);

    if (addBtn && !addBtn.dataset.wired) {
      addBtn.dataset.wired = "true";
      addBtn.addEventListener("click", () => {
        addForm.hidden = false;
        list.hidden = false;
        const input = addForm.querySelector("input");
        if (input) input.focus();
      });
    }
    if (viewBtn && !viewBtn.dataset.wired) {
      viewBtn.dataset.wired = "true";
      viewBtn.addEventListener("click", () => {
        list.hidden = !list.hidden;
      });
    }
    if (cancelBtn && !cancelBtn.dataset.wired) {
      cancelBtn.dataset.wired = "true";
      cancelBtn.addEventListener("click", () => {
        addForm.hidden = true;
        addForm.querySelector("input").value = "";
      });
    }
    if (addForm && !addForm.dataset.wired) {
      addForm.dataset.wired = "true";
      addForm.addEventListener("submit", (e) => handleHelperHubReminderAddSubmit(e, category));
    }
    if (list && !list.dataset.wired) {
      list.dataset.wired = "true";
      list.addEventListener("click", (e) => handleHelperHubReminderListClick(e, category));
    }
  });

  const selfNoteBox = document.getElementById("helper-hub-self-note");
  const teacherNoteBox = document.getElementById("helper-hub-teacher-note");
  if (selfNoteBox && !selfNoteBox.dataset.wired) {
    selfNoteBox.dataset.wired = "true";
    selfNoteBox.addEventListener("change", () => {
      Storage.updateHubNotesText(helperHubLang, { selfNote: selfNoteBox.value });
    });
  }
  if (teacherNoteBox && !teacherNoteBox.dataset.wired) {
    teacherNoteBox.dataset.wired = "true";
    teacherNoteBox.addEventListener("change", () => {
      Storage.updateHubNotesText(helperHubLang, { teacherNote: teacherNoteBox.value });
    });
  }

  renderHelperHubReminders("late");
  renderHelperHubReminders("homework");
  renderHelperHubNotesText();
}

function handleHelperHubReminderAddSubmit(e, category) {
  e.preventDefault();
  const input = e.target.querySelector("input");
  const text = input.value.trim();
  if (!text) return;
  Storage.addHubReminder({ language: helperHubLang, category, text });
  input.value = "";
  e.target.hidden = true;
  renderHelperHubReminders(category);
}

function handleHelperHubReminderListClick(e, category) {
  if (e.target.classList.contains("helper-hub-reminder-delete-btn")) {
    Storage.deleteHubReminder(e.target.dataset.reminderId);
    renderHelperHubReminders(category);
  }
}

function renderHelperHubReminders(category) {
  const list = document.getElementById(`helper-hub-${category}-list`);
  if (!list) return;

  const items = Storage.getHubReminders(helperHubLang, category);
  list.innerHTML = "";

  if (items.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-hint";
    li.textContent = "Nothing here yet.";
    list.appendChild(li);
    return;
  }

  items
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach((item) => {
      const li = document.createElement("li");
      li.className = "helper-hub-reminder-item";

      const textEl = document.createElement("span");
      textEl.textContent = item.text;
      li.appendChild(textEl);

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "helper-hub-reminder-delete-btn";
      deleteBtn.textContent = "×";
      deleteBtn.dataset.reminderId = item.id;
      deleteBtn.setAttribute("aria-label", "Delete");
      li.appendChild(deleteBtn);

      list.appendChild(li);
    });
}

function renderHelperHubNotesText() {
  const { selfNote, teacherNote } = Storage.getHubNotesText(helperHubLang);
  const selfNoteBox = document.getElementById("helper-hub-self-note");
  const teacherNoteBox = document.getElementById("helper-hub-teacher-note");
  if (selfNoteBox) selfNoteBox.value = selfNote || "";
  if (teacherNoteBox) teacherNoteBox.value = teacherNote || "";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { initHelperNotebookHub };
}
