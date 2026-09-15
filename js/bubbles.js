/*
  bubbles.js
  -----------
  The dedicated Bubbles page: a free-position sticky-note canvas.
  Backed by the same Storage.*PersonalNote methods the old Main Hub
  bubble list used (personalHub.notes) — existing bubbles just show up
  here now, positioned on the canvas instead of listed. Position (x/y)
  and a display color are new fields on the note object, filled in with
  a staggered default the first time an older note (with no position
  yet) is rendered.
*/

const BUBBLE_LANGUAGE_NAMES = { es: "Spanish", ja: "Japanese", fr: "French" };
const BUBBLE_COLORS = ["bubble-yellow", "bubble-green", "bubble-cream"];
const BUBBLE_SAVE_DELAY_MS = 500;

let bubbleLang = "es";
let bubbleDrag = null; // { id, startX, startY, origX, origY }
let bubbleSaveTimeouts = {};

function getBubbleQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("bubble-canvas");
  if (!canvas) return; // not this page

  const langParam = getBubbleQueryParam("lang");
  bubbleLang = SUPPORTED_LANGUAGES.includes(langParam) ? langParam : "es";
  const langName = BUBBLE_LANGUAGE_NAMES[bubbleLang];

  const eyebrow = document.getElementById("bubbles-eyebrow");
  if (eyebrow) eyebrow.textContent = `${langName} · Bubbles`;
  const backLink = document.getElementById("bubbles-back-link");
  if (backLink) backLink.href = `personal-hub.html?lang=${bubbleLang}`;
  const header = document.getElementById("bubbles-header");
  if (header) header.classList.add(`lang-${bubbleLang}`);

  initTopbar(bubbleLang);
  if (typeof initHubTasks === "function") initHubTasks(bubbleLang);
  initAppTabs({
    section: "personal-hub",
    language: bubbleLang,
    label: `${langName} Bubbles`,
    href: `bubbles.html?lang=${bubbleLang}`,
  });

  document.getElementById("new-bubble-btn").addEventListener("click", handleNewBubble);

  renderBubbles();

  document.addEventListener("mousemove", handleBubbleDragMove);
  document.addEventListener("mouseup", handleBubbleDragEnd);
});

function handleNewBubble() {
  const notes = Storage.getPersonalNotes(bubbleLang);
  const index = notes.length;
  const note = Storage.addPersonalNote({
    language: bubbleLang,
    title: "",
    content: "",
    x: 24 + (index % 5) * 40,
    y: 24 + (index % 5) * 30,
    color: BUBBLE_COLORS[index % BUBBLE_COLORS.length],
  });
  renderBubbles();
  const titleInput = document.querySelector(`.bubble-note[data-note-id="${note.id}"] .bubble-title-input`);
  if (titleInput) titleInput.focus();
}

function renderBubbles() {
  const canvas = document.getElementById("bubble-canvas");
  const notes = Storage.getPersonalNotes(bubbleLang);

  const countText = document.getElementById("bubble-count-text");
  if (countText) {
    countText.textContent = notes.length
      ? `${notes.length} bubble${notes.length === 1 ? "" : "s"} · drag by the top edge`
      : "";
  }

  canvas.innerHTML = "";
  notes.forEach((note, index) => {
    const x = typeof note.x === "number" ? note.x : 24 + (index % 5) * 40;
    const y = typeof note.y === "number" ? note.y : 24 + (index % 5) * 30;
    const color = note.color || BUBBLE_COLORS[index % BUBBLE_COLORS.length];

    const el = document.createElement("div");
    el.className = `bubble-note ${color}`;
    el.dataset.noteId = note.id;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    const head = document.createElement("div");
    head.className = "bubble-head";
    head.innerHTML = `
      <span class="bubble-dot"></span><span class="bubble-dot"></span><span class="bubble-dot"></span>
      <button type="button" class="bubble-close" data-delete-id="${note.id}" aria-label="Delete bubble">&times;</button>
    `;
    head.addEventListener("mousedown", (e) => {
      if (e.target.closest(".bubble-close")) return;
      handleBubbleDragStart(e, note.id, x, y);
    });
    head.querySelector(".bubble-close").addEventListener("click", () => {
      Storage.deletePersonalNote(note.id);
      renderBubbles();
    });
    el.appendChild(head);

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.className = "bubble-title-input";
    titleInput.placeholder = "Title";
    titleInput.value = note.title || "";
    titleInput.addEventListener("input", () => scheduleBubbleSave(note.id, { title: titleInput.value }));
    el.appendChild(titleInput);

    const contentArea = document.createElement("textarea");
    contentArea.className = "bubble-content";
    contentArea.placeholder = "Write a note…";
    contentArea.rows = 3;
    contentArea.value = note.content || "";
    contentArea.addEventListener("input", () => scheduleBubbleSave(note.id, { content: contentArea.value }));
    el.appendChild(contentArea);

    canvas.appendChild(el);
  });
}

function scheduleBubbleSave(noteId, updates) {
  if (bubbleSaveTimeouts[noteId]) clearTimeout(bubbleSaveTimeouts[noteId]);
  bubbleSaveTimeouts[noteId] = setTimeout(() => {
    Storage.updatePersonalNote(noteId, updates);
    delete bubbleSaveTimeouts[noteId];
  }, BUBBLE_SAVE_DELAY_MS);
}

function handleBubbleDragStart(e, noteId, origX, origY) {
  e.preventDefault();
  bubbleDrag = { id: noteId, startX: e.clientX, startY: e.clientY, origX, origY };
}

function handleBubbleDragMove(e) {
  if (!bubbleDrag) return;
  const el = document.querySelector(`.bubble-note[data-note-id="${bubbleDrag.id}"]`);
  if (!el) return;
  const dx = e.clientX - bubbleDrag.startX;
  const dy = e.clientY - bubbleDrag.startY;
  el.style.left = `${Math.max(0, bubbleDrag.origX + dx)}px`;
  el.style.top = `${Math.max(0, bubbleDrag.origY + dy)}px`;
}

function handleBubbleDragEnd() {
  if (!bubbleDrag) return;
  const el = document.querySelector(`.bubble-note[data-note-id="${bubbleDrag.id}"]`);
  if (el) {
    Storage.updatePersonalNote(bubbleDrag.id, {
      x: parseInt(el.style.left, 10) || 0,
      y: parseInt(el.style.top, 10) || 0,
    });
  }
  bubbleDrag = null;
}
