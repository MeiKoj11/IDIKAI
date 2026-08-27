/*
  hub-tasks.js
  ------------
  A small "to-do list" widget docked in the topbar of every page — quick
  tasks like "finish reading" you want visible at a glance without
  navigating into a bubble.

  Two independent checkboxes per task (Started / Done) rather than one
  status flag, since a task can be started but not finished — a single
  done/not-done boolean can't represent that middle state.

  Completed tasks are hidden by default (not deleted) once checked off —
  "Show completed" brings them back into view rather than losing them.

  Tasks can optionally be filed into folders (purely organizational,
  same additive pattern as Reading's passage folders and Grammar's
  theme folders) — a task without a folderId just sits in "Unfiled".
  Folders render as collapsible groups so a long list stays manageable.
*/

let hubTasksLang = null;
let hubTasksShowCompleted = false;

function initHubTasks(language) {
  const toggleBtn = document.getElementById("hub-todo-toggle");
  if (!toggleBtn) return; // this page doesn't have the to-do list

  hubTasksLang = language;

  const panel = document.getElementById("hub-todo-panel");
  const closeBtn = document.getElementById("hub-todo-close");
  const addForm = document.getElementById("hub-todo-add-form");
  const folderSelect = document.getElementById("hub-todo-folder-select");
  const showCompletedCheckbox = document.getElementById("hub-todo-show-completed");
  const groups = document.getElementById("hub-todo-groups");

  // wireTopbarMenu (topbar.js) gives this the same click-to-toggle,
  // click-outside-to-close behavior as the Notifications/hamburger
  // menus, AND registers it so opening one of those closes this panel
  // (and vice versa) — the two now sit close enough in the topbar that
  // both being open at once would visually overlap.
  if (toggleBtn && !toggleBtn.dataset.wired) {
    toggleBtn.dataset.wired = "true";
    wireTopbarMenu(toggleBtn, panel);
  }
  if (closeBtn && !closeBtn.dataset.wired) {
    closeBtn.dataset.wired = "true";
    closeBtn.addEventListener("click", () => {
      panel.hidden = true;
    });
  }
  if (addForm && !addForm.dataset.wired) {
    addForm.dataset.wired = "true";
    addForm.addEventListener("submit", handleHubTaskAddSubmit);
  }
  if (folderSelect && !folderSelect.dataset.wired) {
    folderSelect.dataset.wired = "true";
    folderSelect.addEventListener("change", (e) => handleHubTaskFolderSelectChange(e.target, null));
  }
  if (showCompletedCheckbox && !showCompletedCheckbox.dataset.wired) {
    showCompletedCheckbox.dataset.wired = "true";
    showCompletedCheckbox.addEventListener("change", (e) => {
      hubTasksShowCompleted = e.target.checked;
      renderHubTasks();
    });
  }
  if (groups && !groups.dataset.wired) {
    groups.dataset.wired = "true";
    groups.addEventListener("click", handleHubTaskGroupsClick);
    groups.addEventListener("change", handleHubTaskGroupsChange);
  }

  wireHubTodoPanelDrag(panel, toggleBtn);

  renderFolderSelectOptions(folderSelect, "");
  renderHubTasks();
}

// ---- Draggable panel ----
// The panel is always position: fixed — pinned to the viewport, not
// anchored under the topbar icon via normal document flow — so it
// stays exactly where you put it (and stays in front of everything,
// even while the page scrolls). Dragging it by the header just updates
// that fixed position and remembers where it was left — globally, not
// per-page, since it's the same panel everywhere.

const HUB_TODO_POS_KEY = "hub.todoPanelPos";

function wireHubTodoPanelDrag(panel, toggleBtn) {
  const header = document.getElementById("hub-todo-header");
  if (!header || !panel || header.dataset.dragWired) return;
  header.dataset.dragWired = "true";
  header.classList.add("hub-todo-header-draggable");

  const hasSavedPosition = applySavedHubTodoPanelPosition(panel);

  // Nothing dragged/saved yet: position it under the toggle button the
  // very first time it's opened (can't measure it while `hidden`, so
  // this has to happen at open time, not here at init time).
  if (!hasSavedPosition && toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      if (!panel.hidden && !panel.dataset.positioned) {
        positionHubTodoPanelUnderToggle(panel, toggleBtn);
      }
    });
  }

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  header.addEventListener("pointerdown", (e) => {
    // Don't start a drag from the Close button itself.
    if (e.target.closest && e.target.closest("#hub-todo-close")) return;

    dragging = true;
    const rect = panel.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;

    panel.style.left = `${startLeft}px`;
    panel.style.top = `${startTop}px`;
    panel.dataset.positioned = "true";

    if (header.setPointerCapture) header.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  header.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    const panelWidth = panel.offsetWidth || 360;
    const viewportW = window.innerWidth || 1000;
    const viewportH = window.innerHeight || 800;

    // Clamp so at least a corner always stays reachable, however far
    // the window gets dragged.
    let left = startLeft + dx;
    let top = startTop + dy;
    left = Math.max(-panelWidth + 60, Math.min(left, viewportW - 60));
    top = Math.max(0, Math.min(top, viewportH - 40));

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  });

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    if (header.releasePointerCapture && e.pointerId != null) {
      try {
        header.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
    saveHubTodoPanelPosition(panel);
  };

  header.addEventListener("pointerup", endDrag);
  header.addEventListener("pointercancel", endDrag);
}

// Returns true if a previously-saved position was applied.
function applySavedHubTodoPanelPosition(panel) {
  let pos = null;
  try {
    pos = JSON.parse(localStorage.getItem(HUB_TODO_POS_KEY) || "null");
  } catch (e) {
    pos = null;
  }
  if (!pos || typeof pos.left !== "number" || typeof pos.top !== "number") return false;

  panel.style.left = `${pos.left}px`;
  panel.style.top = `${pos.top}px`;
  panel.dataset.positioned = "true";
  return true;
}

// First-ever open, nothing dragged or saved yet — appear right under
// the icon that opened it, same spot the old anchored version used,
// but as real viewport coordinates instead of document-flow anchoring.
function positionHubTodoPanelUnderToggle(panel, toggleBtn) {
  const btnRect = toggleBtn.getBoundingClientRect();
  const panelWidth = panel.offsetWidth || 360;
  const viewportW = window.innerWidth || 1000;

  let left = btnRect.right - panelWidth;
  left = Math.max(12, Math.min(left, viewportW - panelWidth - 12));
  const top = btnRect.bottom + 8;

  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  panel.dataset.positioned = "true";
}

function saveHubTodoPanelPosition(panel) {
  const rect = panel.getBoundingClientRect();
  try {
    localStorage.setItem(HUB_TODO_POS_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
  } catch (e) {}
}

// value === "__new__" means "prompt for a new folder name, create it,
// and select it" — same quick-create pattern used for Grammar folders.
// targetTaskId is null when called from the add-task form (just sets
// the form's pending selection); otherwise it's an existing task being
// re-filed and the change should save immediately.
function handleHubTaskFolderSelectChange(selectEl, targetTaskId) {
  if (selectEl.value !== "__new__") {
    if (targetTaskId) {
      Storage.updateTask(targetTaskId, { folderId: selectEl.value || null });
      renderHubTasks();
    }
    return;
  }

  const name = (prompt("New folder name:") || "").trim();
  if (!name) {
    selectEl.value = targetTaskId ? (findTaskFolderId(targetTaskId) || "") : "";
    return;
  }
  const folder = Storage.addTaskFolder(name, hubTasksLang);

  if (targetTaskId) {
    Storage.updateTask(targetTaskId, { folderId: folder.id });
    renderHubTasks();
  } else {
    renderFolderSelectOptions(document.getElementById("hub-todo-folder-select"), folder.id);
  }
}

function findTaskFolderId(taskId) {
  const task = Storage.getTasks(hubTasksLang).find((t) => t.id === taskId);
  return task ? task.folderId : null;
}

function renderFolderSelectOptions(selectEl, selectedId) {
  if (!selectEl) return;
  const folders = Storage.getTaskFolders(hubTasksLang);
  selectEl.innerHTML = "";

  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = "No folder";
  noneOpt.dataset.immersionKey = "todoNoFolder";
  selectEl.appendChild(noneOpt);

  folders.forEach((folder) => {
    const opt = document.createElement("option");
    opt.value = folder.id;
    opt.textContent = folder.name;
    selectEl.appendChild(opt);
  });

  const newOpt = document.createElement("option");
  newOpt.value = "__new__";
  newOpt.textContent = "+ New folder…";
  newOpt.dataset.immersionKey = "newFolderOption";
  selectEl.appendChild(newOpt);

  selectEl.value = selectedId || "";
}

function handleHubTaskAddSubmit(e) {
  e.preventDefault();
  const input = document.getElementById("hub-todo-add-input");
  const folderSelect = document.getElementById("hub-todo-folder-select");
  const title = input.value.trim();
  if (!title) return;

  const folderId = folderSelect && folderSelect.value !== "__new__" ? folderSelect.value || null : null;
  Storage.addTask({ language: hubTasksLang, title, folderId });
  input.value = "";
  renderHubTasks();
}

function renderHubTasks() {
  const groups = document.getElementById("hub-todo-groups");
  const countBadge = document.getElementById("hub-todo-toggle-count");
  if (!groups) return;

  const allTasks = Storage.getTasks(hubTasksLang);
  const openCount = allTasks.filter((t) => !t.completed).length;

  if (countBadge) {
    countBadge.hidden = openCount === 0;
    countBadge.textContent = String(openCount);
  }

  groups.innerHTML = "";

  if (allTasks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-hint";
    empty.textContent = "No tasks yet — add one above.";
    empty.dataset.immersionKey = "noTasksYetText";
    groups.appendChild(empty);
    return;
  }

  const folders = Storage.getTaskFolders(hubTasksLang);
  const visible = hubTasksShowCompleted ? allTasks : allTasks.filter((t) => !t.completed);

  let anyVisible = false;

  folders.forEach((folder) => {
    const tasks = visible.filter((t) => t.folderId === folder.id);
    if (tasks.length === 0) return;
    anyVisible = true;
    groups.appendChild(buildHubTaskGroup(folder.name, folder.id, tasks));
  });

  const unfiled = visible.filter((t) => !t.folderId || !folders.some((f) => f.id === t.folderId));
  if (unfiled.length > 0) {
    anyVisible = true;
    groups.appendChild(buildHubTaskGroup(folders.length > 0 ? "Unfiled" : null, null, unfiled));
  }

  if (!anyVisible) {
    const empty = document.createElement("p");
    empty.className = "empty-hint";
    empty.textContent = "Nothing to show — completed tasks are hidden.";
    empty.dataset.immersionKey = "nothingToShowCompletedHiddenText";
    groups.appendChild(empty);
  }
}

function buildHubTaskGroup(folderLabel, folderId, tasks) {
  const wrapper = document.createElement(folderLabel ? "details" : "div");
  wrapper.className = "hub-todo-group";
  if (folderLabel) wrapper.open = true;

  if (folderLabel) {
    const summary = document.createElement("summary");
    summary.className = "hub-todo-group-summary";

    const name = document.createElement("span");
    name.className = "hub-todo-group-name";
    name.textContent = `${folderLabel} (${tasks.length})`;
    summary.appendChild(name);

    if (folderId) {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "hub-todo-folder-delete-btn";
      deleteBtn.textContent = "×";
      deleteBtn.dataset.folderId = folderId;
      deleteBtn.dataset.action = "delete-folder";
      deleteBtn.setAttribute("aria-label", `Delete folder ${folderLabel}`);
      summary.appendChild(deleteBtn);
    }

    wrapper.appendChild(summary);
  }

  const columnsLabel = document.createElement("div");
  columnsLabel.className = "hub-todo-columns-label";
  // 5 spans to match the row grid's 5 columns (title, started, done,
  // folder, delete) — a mismatched count here throws the header labels
  // out of alignment with the checkboxes underneath them.
  columnsLabel.innerHTML =
    '<span></span><span data-immersion-key="startedColumnLabel">Started</span><span data-immersion-key="doneColumnLabel">Done</span><span></span><span></span>';
  wrapper.appendChild(columnsLabel);

  const list = document.createElement("ul");
  list.className = "hub-todo-list";
  tasks
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach((task) => list.appendChild(buildHubTaskRow(task)));
  wrapper.appendChild(list);

  return wrapper;
}

function buildHubTaskRow(task) {
  const li = document.createElement("li");
  li.className = `hub-todo-row${task.completed ? " hub-todo-row-completed" : ""}`;

  const titleEl = document.createElement("span");
  titleEl.className = "hub-todo-row-title";
  titleEl.textContent = task.title;
  li.appendChild(titleEl);

  li.appendChild(buildHubTaskCheckbox(task, "started"));
  li.appendChild(buildHubTaskCheckbox(task, "completed"));

  const rowFolderSelect = document.createElement("select");
  rowFolderSelect.className = "hub-todo-row-folder-select";
  rowFolderSelect.dataset.taskId = task.id;
  rowFolderSelect.setAttribute("aria-label", "Move to folder");
  renderFolderSelectOptions(rowFolderSelect, task.folderId || "");
  li.appendChild(rowFolderSelect);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "hub-todo-delete-btn";
  deleteBtn.textContent = "×";
  deleteBtn.dataset.taskId = task.id;
  deleteBtn.dataset.action = "delete";
  deleteBtn.setAttribute("aria-label", "Delete task");
  li.appendChild(deleteBtn);

  return li;
}

function buildHubTaskCheckbox(task, field) {
  const label = document.createElement("label");
  label.className = "hub-todo-checkbox-label";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = !!task[field];
  checkbox.className = "hub-todo-checkbox";
  checkbox.dataset.taskId = task.id;
  checkbox.dataset.field = field;
  label.appendChild(checkbox);
  return label;
}

function handleHubTaskGroupsClick(e) {
  if (e.target.classList.contains("hub-todo-checkbox")) {
    const taskId = e.target.dataset.taskId;
    const field = e.target.dataset.field;
    Storage.updateTask(taskId, { [field]: e.target.checked });
    renderHubTasks();
    return;
  }
  if (e.target.dataset.action === "delete") {
    Storage.deleteTask(e.target.dataset.taskId);
    renderHubTasks();
    return;
  }
  if (e.target.dataset.action === "delete-folder") {
    e.preventDefault(); // don't let the click also toggle the <summary>'s <details>
    e.stopPropagation();
    const folderName =
      e.target.closest(".hub-todo-group-summary").querySelector(".hub-todo-group-name").textContent;
    if (confirm(`Delete folder "${folderName.replace(/\s\(\d+\)$/, "")}"? Its tasks will move to Unfiled.`)) {
      Storage.deleteTaskFolder(e.target.dataset.folderId);
      renderHubTasks();
    }
  }
}

function handleHubTaskGroupsChange(e) {
  if (e.target.classList.contains("hub-todo-row-folder-select")) {
    handleHubTaskFolderSelectChange(e.target, e.target.dataset.taskId);
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { initHubTasks };
}
