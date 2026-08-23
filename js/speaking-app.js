/*
  speaking-app.js
  ---------------
  The Speaking bubble: dated, private journal-style entries with a
  recorded-audio clip, optionally linked to a Reading passage so you
  can pull that text up in a tab alongside the recorder and read it
  aloud. One file drives both speaking.html (the entry list) and
  speaking-entry.html (record/edit a single entry) — each init
  function no-ops if this page doesn't have the element it needs.

  Recordings themselves live in IndexedDB via audio-store.js, not in
  localStorage — see that file for why.

  Public/teacher-set entries are intentionally not built yet (see the
  "Coming soon" panel on speaking.html) — isPublic on every entry is
  always false for now.
*/

const SPEAKING_LANGUAGE_NAMES = { es: "Spanish", ja: "Japanese" };

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

document.addEventListener("DOMContentLoaded", () => {
  initSpeakingListPage();
  initSpeakingEntryPage();
});

// ---------------------------------------------------------------------
// speaking.html — the entry list
// ---------------------------------------------------------------------

function initSpeakingListPage() {
  const list = document.getElementById("entry-list");
  if (!list) return; // not this page

  const langParam = getQueryParam("lang");
  const lang = langParam === "es" || langParam === "ja" ? langParam : null;

  if (lang) {
    const heading = document.getElementById("speaking-heading");
    if (heading) heading.textContent = `${SPEAKING_LANGUAGE_NAMES[lang]} Speaking`;
    const backLink = document.getElementById("speaking-back-link");
    if (backLink) backLink.href = `language-home.html?lang=${lang}`;
    const header = document.getElementById("speaking-header");
    if (header) header.classList.add(`lang-${lang}`);
    const newEntryLink = document.getElementById("new-entry-link");
    if (newEntryLink) newEntryLink.href = `speaking-entry.html?lang=${lang}`;
  }

  renderEntryList(lang);
  initTopbar(lang);
  if (typeof initHubTasks === "function") initHubTasks(lang);
  if (lang) {
    initAppTabs({
      section: "speaking",
      language: lang,
      label: `${SPEAKING_LANGUAGE_NAMES[lang]} Speaking`,
      href: `speaking.html?lang=${lang}`,
    });
  } else {
    initAppTabs(null);
  }
}

function renderEntryList(lang) {
  const list = document.getElementById("entry-list");
  if (!list) return;

  const entries = (lang ? Storage.getSpeakingEntries(lang) : Storage.getSpeakingEntries())
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.createdAt - a.createdAt);

  list.innerHTML = "";

  if (entries.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-hint";
    li.textContent = lang
      ? `No ${SPEAKING_LANGUAGE_NAMES[lang]} entries yet — record your first one above.`
      : "No entries yet — record your first one above.";
    list.appendChild(li);
    return;
  }

  entries.forEach((entry) => {
    const li = document.createElement("li");
    li.className = `theme-item lang-${entry.language}`;
    li.addEventListener("click", () => {
      window.location.href = `speaking-entry.html?id=${encodeURIComponent(entry.id)}`;
    });

    const nameEl = document.createElement("span");
    nameEl.className = "theme-name";
    nameEl.textContent = entry.title || "Untitled entry";
    li.appendChild(nameEl);

    const meta = document.createElement("span");
    meta.className = "theme-meta";

    const dateBadge = document.createElement("span");
    dateBadge.className = "folder-badge";
    dateBadge.textContent = entry.date || "";
    meta.appendChild(dateBadge);

    if (entry.linkedPassageId) {
      const passage = Storage.getPassage(entry.linkedPassageId);
      if (passage) {
        const linkBadge = document.createElement("span");
        linkBadge.className = `lang-badge lang-badge-${entry.language}`;
        linkBadge.textContent = `Linked: ${passage.title}`;
        meta.appendChild(linkBadge);
      }
    }

    li.appendChild(meta);
    list.appendChild(li);
  });
}

// ---------------------------------------------------------------------
// speaking-entry.html — record/edit a single entry
// ---------------------------------------------------------------------

let activeEntryLang = null;
let activeEntryId = null;
let entryPersisted = false;
let mediaRecorder = null;
let recordedChunks = [];
let recordingStartMs = null;
let recordTimerInterval = null;
let openReadingTabIds = [];
let activeReadingTabId = null;

function initSpeakingEntryPage() {
  const form = document.getElementById("entry-details-form");
  if (!form) return; // not this page

  const idParam = getQueryParam("id");
  const langParam = getQueryParam("lang");

  const titleInput = document.getElementById("entry-title");
  const dateInput = document.getElementById("entry-date");
  const linkSelect = document.getElementById("entry-link-select");

  const existingEntry = idParam ? Storage.getSpeakingEntry(idParam) : null;

  if (existingEntry) {
    activeEntryId = existingEntry.id;
    activeEntryLang = existingEntry.language;
    entryPersisted = true;
    titleInput.value = existingEntry.title || "";
    dateInput.value = existingEntry.date || todayStr();
  } else {
    activeEntryLang = langParam === "es" || langParam === "ja" ? langParam : "es";
    activeEntryId = Storage.uid();
    entryPersisted = false;
    dateInput.value = todayStr();
  }

  const header = document.getElementById("entry-header");
  if (header) header.classList.add(`lang-${activeEntryLang}`);
  const backLink = document.getElementById("entry-back-link");
  if (backLink) backLink.href = `speaking.html?lang=${activeEntryLang}`;
  initTopbar(activeEntryLang);
  if (typeof initHubTasks === "function") initHubTasks(activeEntryLang);
  syncSpeakingEntryAppTab(existingEntry);
  const heading = document.getElementById("entry-heading");
  if (heading) {
    heading.textContent = existingEntry
      ? existingEntry.title || "Untitled entry"
      : `New ${SPEAKING_LANGUAGE_NAMES[activeEntryLang]} entry`;
  }

  renderLinkSelectOptions(linkSelect, existingEntry ? existingEntry.linkedPassageId : null);

  if (existingEntry && existingEntry.linkedPassageId && Storage.getPassage(existingEntry.linkedPassageId)) {
    openReadingTab(existingEntry.linkedPassageId);
  }

  loadExistingRecording();

  form.addEventListener("submit", handleEntryDetailsSubmit);
  const recordBtn = document.getElementById("record-btn");
  if (recordBtn) recordBtn.addEventListener("click", handleRecordButtonClick);
  const deleteRecordingBtn = document.getElementById("delete-recording-btn");
  if (deleteRecordingBtn) deleteRecordingBtn.addEventListener("click", handleDeleteRecording);
  const deleteEntryBtn = document.getElementById("delete-entry-btn");
  if (deleteEntryBtn) deleteEntryBtn.addEventListener("click", handleDeleteEntry);
  const tabPlusBtn = document.getElementById("entry-tab-plus");
  if (tabPlusBtn) tabPlusBtn.addEventListener("click", handleEntryTabPlusClick);
  const tabTypePicker = document.getElementById("entry-tab-type-picker");
  if (tabTypePicker) tabTypePicker.addEventListener("change", handleEntryTabTypeSelectChange);
  const tabPicker = document.getElementById("entry-tab-picker");
  if (tabPicker) tabPicker.addEventListener("change", handleEntryTabPickerChange);
  const tabPickerCancelBtn = document.getElementById("entry-tab-picker-cancel");
  if (tabPickerCancelBtn) tabPickerCancelBtn.addEventListener("click", handleEntryTabPickerCancelClick);
}

function renderLinkSelectOptions(select, selectedId) {
  if (!select) return;
  select.innerHTML = '<option value="">No link</option>';
  Storage.getPassages()
    .filter((p) => p.language === activeEntryLang)
    .forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.title;
      if (p.id === selectedId) opt.selected = true;
      select.appendChild(opt);
    });
}

function handleEntryDetailsSubmit(e) {
  e.preventDefault();
  const titleInput = document.getElementById("entry-title");
  const dateInput = document.getElementById("entry-date");
  const linkSelect = document.getElementById("entry-link-select");

  const title = titleInput.value.trim();
  if (!title) {
    alert("Give the entry a title.");
    return;
  }
  const date = dateInput.value || todayStr();
  const linkedPassageId = linkSelect.value || null;

  if (!entryPersisted) {
    Storage.addSpeakingEntry({ id: activeEntryId, title, date, language: activeEntryLang, linkedPassageId });
    entryPersisted = true;
  } else {
    Storage.updateSpeakingEntry(activeEntryId, { title, date, linkedPassageId });
  }

  const heading = document.getElementById("entry-heading");
  if (heading) heading.textContent = title;

  if (linkedPassageId) openReadingTab(linkedPassageId);

  const status = document.getElementById("entry-save-status");
  if (status) {
    status.hidden = false;
    status.textContent = "Saved.";
    clearTimeout(status.__hideTimer);
    status.__hideTimer = setTimeout(() => {
      status.hidden = true;
    }, 2000);
  }

  syncSpeakingEntryAppTab(Storage.getSpeakingEntry(activeEntryId));
}

// Pins speaking-entry.html as an app tab once the entry is actually
// saved; keeps the tab's label in sync with the entry's title.
function syncSpeakingEntryAppTab(entry) {
  if (!entry) {
    initAppTabs(null);
    return;
  }
  initAppTabs({
    section: "speaking",
    language: entry.language,
    label: entry.title || "Untitled entry",
    href: `speaking-entry.html?id=${encodeURIComponent(entry.id)}`,
  });
}

// ---- Recording ----

async function handleRecordButtonClick() {
  const btn = document.getElementById("record-btn");

  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    return; // the rest happens in handleRecordingStopped, via onstop
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showRecordingStatus("This browser doesn't support recording audio.");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = handleRecordingStopped;
    mediaRecorder.start();

    recordingStartMs = Date.now();
    startRecordTimer();

    if (btn) {
      btn.textContent = "Stop";
      btn.classList.add("recording");
    }
    showRecordingStatus("");
  } catch (err) {
    console.error("Couldn't start recording:", err);
    showRecordingStatus("Couldn't access the microphone — check your browser's permission for this page.");
  }
}

function showRecordingStatus(msg) {
  const statusEl = document.getElementById("recording-status");
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.hidden = !msg;
}

function startRecordTimer() {
  const timerEl = document.getElementById("record-timer");
  stopRecordTimer();
  recordTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - recordingStartMs) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    if (timerEl) timerEl.textContent = `${mins}:${String(secs).padStart(2, "0")}`;
  }, 250);
}

function stopRecordTimer() {
  if (recordTimerInterval) {
    clearInterval(recordTimerInterval);
    recordTimerInterval = null;
  }
}

async function handleRecordingStopped() {
  stopRecordTimer();
  const btn = document.getElementById("record-btn");
  if (btn) {
    btn.textContent = "Record";
    btn.classList.remove("recording");
  }

  const mimeType = mediaRecorder && mediaRecorder.mimeType ? mediaRecorder.mimeType : "audio/webm";
  const blob = new Blob(recordedChunks, { type: mimeType });
  recordedChunks = [];

  // Stop the mic stream's tracks so the browser's recording indicator
  // (and the OS mic-in-use light) turns off between takes.
  if (mediaRecorder && mediaRecorder.stream) {
    mediaRecorder.stream.getTracks().forEach((t) => t.stop());
  }

  if (!entryPersisted) {
    const titleInput = document.getElementById("entry-title");
    const dateInput = document.getElementById("entry-date");
    const linkSelect = document.getElementById("entry-link-select");
    Storage.addSpeakingEntry({
      id: activeEntryId,
      title: (titleInput && titleInput.value.trim()) || "Untitled entry",
      date: (dateInput && dateInput.value) || todayStr(),
      language: activeEntryLang,
      linkedPassageId: (linkSelect && linkSelect.value) || null,
    });
    entryPersisted = true;
    syncSpeakingEntryAppTab(Storage.getSpeakingEntry(activeEntryId));
  }

  try {
    await AudioStore.saveRecording(activeEntryId, blob);
    showPlaybackAudio(blob);
  } catch (err) {
    console.error("Couldn't save the recording:", err);
    showRecordingStatus("Recorded, but couldn't save it locally — try recording again.");
  }
}

function showPlaybackAudio(blob) {
  const audioEl = document.getElementById("playback-audio");
  const deleteBtn = document.getElementById("delete-recording-btn");
  if (!audioEl) return;
  if (audioEl.src) URL.revokeObjectURL(audioEl.src);
  audioEl.src = URL.createObjectURL(blob);
  audioEl.hidden = false;
  if (deleteBtn) deleteBtn.hidden = false;
}

async function loadExistingRecording() {
  if (!entryPersisted) return;
  try {
    const blob = await AudioStore.getRecording(activeEntryId);
    if (blob) showPlaybackAudio(blob);
  } catch (err) {
    console.error("Couldn't load the saved recording:", err);
  }
}

async function handleDeleteRecording() {
  if (!confirm("Delete this recording? You can record a new one any time.")) return;
  try {
    await AudioStore.deleteRecording(activeEntryId);
  } catch (err) {
    console.error("Couldn't delete the recording:", err);
  }
  const audioEl = document.getElementById("playback-audio");
  const deleteBtn = document.getElementById("delete-recording-btn");
  if (audioEl) {
    if (audioEl.src) URL.revokeObjectURL(audioEl.src);
    audioEl.src = "";
    audioEl.hidden = true;
  }
  if (deleteBtn) deleteBtn.hidden = true;
}

async function handleDeleteEntry() {
  if (!entryPersisted) {
    window.location.href = `speaking.html?lang=${activeEntryLang}`;
    return;
  }
  if (!confirm("Delete this entry and its recording? This can't be undone.")) return;
  Storage.deleteSpeakingEntry(activeEntryId);
  try {
    await AudioStore.deleteRecording(activeEntryId);
  } catch (err) {
    console.error("Couldn't delete the recording:", err);
  }
  window.location.href = `speaking.html?lang=${activeEntryLang}`;
}

// ---- "Read while you speak" tabs ----
// Read-only view of something to read aloud while recording — either a
// saved Reading passage, or one of your own Writing entries (so you can
// read your own blog/journal entries out loud). No click-to-look-up
// here (that's what the Reading bubble itself is for); this is just
// text to read.
//
// Each open tab is keyed by a composite string ("p:<passageId>" or
// "w:<entryId>") rather than a bare id, so both kinds can live in the
// same open-tabs list without colliding. The "Link to a Reading
// passage" dropdown above is unchanged — still passage-only — and
// funnels through openReadingTab(passageId), a thin wrapper around the
// generalized openRefTab().

function refKey(type, id) {
  return `${type}:${id}`;
}

function getRefItem(key) {
  if (!key) return null;
  const sep = key.indexOf(":");
  if (sep === -1) return null;
  const type = key.slice(0, sep);
  const id = key.slice(sep + 1);
  if (type === "p") {
    const passage = Storage.getPassage(id);
    return passage ? { type, id, title: passage.title, language: passage.language, text: passage.text } : null;
  }
  if (type === "w") {
    const entry = Storage.getWritingEntry(id);
    return entry
      ? { type, id, title: entry.title || "Untitled entry", language: entry.language, text: entry.text || "" }
      : null;
  }
  return null;
}

function buildReadingTabElement(key, item, activeKey) {
  const tab = document.createElement("div");
  tab.className = `vocab-tab lang-${item.language}` + (key === activeKey ? " active" : "");
  tab.dataset.refKey = key;
  tab.addEventListener("click", () => switchReadingTab(key));

  const label = document.createElement("span");
  label.className = "vocab-tab-label";
  label.textContent = item.title;
  tab.appendChild(label);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "vocab-tab-close";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", `Close ${item.title} tab`);
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeReadingTab(key);
  });
  tab.appendChild(closeBtn);

  return tab;
}

function renderReadingTabStrip() {
  const tabsContainer = document.getElementById("entry-tab-strip-tabs");
  if (!tabsContainer) return;
  tabsContainer.innerHTML = "";
  openReadingTabIds.forEach((key) => {
    const item = getRefItem(key);
    if (!item) return;
    tabsContainer.appendChild(buildReadingTabElement(key, item, activeReadingTabId));
  });
}

function renderReadingTabContent() {
  const content = document.getElementById("entry-tab-content");
  if (!content) return;
  content.innerHTML = "";

  if (!activeReadingTabId) {
    const empty = document.createElement("p");
    empty.className = "hint entry-tab-empty";
    empty.textContent = "Nothing open to read — click + to add a passage or a Writing entry, or link a passage above.";
    content.appendChild(empty);
    return;
  }

  const item = getRefItem(activeReadingTabId);
  if (!item) return;

  const title = document.createElement("h3");
  title.textContent = item.title;
  content.appendChild(title);

  const text = document.createElement("p");
  text.className = "entry-tab-passage-text";
  text.textContent = item.text;
  content.appendChild(text);
}

function switchReadingTab(key) {
  activeReadingTabId = key;
  renderReadingTabStrip();
  renderReadingTabContent();
}

function openRefTab(key) {
  if (!getRefItem(key)) return;
  if (!openReadingTabIds.includes(key)) {
    openReadingTabIds.push(key);
  }
  switchReadingTab(key);
}

// Kept for the existing "Link to a Reading passage" flow, which is
// still passage-only.
function openReadingTab(passageId) {
  openRefTab(refKey("p", passageId));
}

function closeReadingTab(key) {
  const wasActive = activeReadingTabId === key;
  openReadingTabIds = openReadingTabIds.filter((k) => k !== key);
  if (wasActive) {
    activeReadingTabId = openReadingTabIds[openReadingTabIds.length - 1] || null;
  }
  renderReadingTabStrip();
  renderReadingTabContent();
}

function getAvailableRefItems() {
  const openKeys = new Set(openReadingTabIds);
  const passages = Storage.getPassages()
    .filter((p) => p.language === activeEntryLang)
    .map((p) => ({ key: refKey("p", p.id), title: p.title }))
    .filter((o) => !openKeys.has(o.key));
  const writingEntries = Storage.getWritingEntries(activeEntryLang)
    .map((e) => ({ key: refKey("w", e.id), title: e.title || "Untitled entry" }))
    .filter((o) => !openKeys.has(o.key));
  return { passages, writingEntries };
}

// Two-step picker: "+" first asks Reading or Writing, then shows a list
// of just that type's items. Mirrors the global app tab strip's own
// section-then-unit picker (see app-tabs.js).

function renderReadingTabPickerOptionsForType(type) {
  const select = document.getElementById("entry-tab-picker");
  if (!select) return;
  select.innerHTML = '<option value="" disabled selected>Open which one?</option>';

  const { passages, writingEntries } = getAvailableRefItems();
  const items = type === "p" ? passages : writingEntries;
  items.forEach((o) => {
    const opt = document.createElement("option");
    opt.value = o.key;
    opt.textContent = o.title;
    select.appendChild(opt);
  });
}

function resetEntryTabPicker() {
  const plusBtn = document.getElementById("entry-tab-plus");
  const typeSelect = document.getElementById("entry-tab-type-picker");
  const itemSelect = document.getElementById("entry-tab-picker");
  const cancelBtn = document.getElementById("entry-tab-picker-cancel");
  if (typeSelect) {
    typeSelect.value = "";
    typeSelect.hidden = true;
  }
  if (itemSelect) {
    itemSelect.value = "";
    itemSelect.hidden = true;
  }
  if (cancelBtn) cancelBtn.hidden = true;
  if (plusBtn) plusBtn.hidden = false;
}

function handleEntryTabPlusClick() {
  const plusBtn = document.getElementById("entry-tab-plus");
  const typeSelect = document.getElementById("entry-tab-type-picker");
  const cancelBtn = document.getElementById("entry-tab-picker-cancel");
  if (!typeSelect) return;

  const { passages, writingEntries } = getAvailableRefItems();
  if (passages.length === 0 && writingEntries.length === 0) {
    alert("Nothing left to open — save a passage or a Writing entry in this language first, or everything is already open.");
    return;
  }

  typeSelect.value = "";
  typeSelect.hidden = false;
  if (plusBtn) plusBtn.hidden = true;
  if (cancelBtn) cancelBtn.hidden = false;
  typeSelect.focus();
}

function handleEntryTabTypeSelectChange(e) {
  const type = e.target.value;
  if (!type) return;

  const { passages, writingEntries } = getAvailableRefItems();
  const items = type === "p" ? passages : writingEntries;
  if (items.length === 0) {
    alert(
      type === "p"
        ? "No Reading passages available to open in this language."
        : "No Writing entries available to open in this language."
    );
    e.target.value = "";
    return;
  }

  renderReadingTabPickerOptionsForType(type);
  const typeSelect = document.getElementById("entry-tab-type-picker");
  const itemSelect = document.getElementById("entry-tab-picker");
  if (typeSelect) typeSelect.hidden = true;
  if (itemSelect) {
    itemSelect.hidden = false;
    itemSelect.focus();
  }
}

function handleEntryTabPickerChange(e) {
  const key = e.target.value;
  if (!key) return;
  openRefTab(key);
  resetEntryTabPicker();
}

function handleEntryTabPickerCancelClick() {
  resetEntryTabPicker();
}
