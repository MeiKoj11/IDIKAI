/*
  immersion.js
  ------------
  A single global toggle (the small 🌐 icon in the topbar) that swaps
  the app's shared navigation chrome — the hamburger menu, notifications
  panel, to-do widget, and the "open another section" tab picker — into
  whatever language the current page is in. Page content itself (your
  own vocab, notes, journal entries) is never touched — only the app's
  own UI text around it.

  Deliberately a hand-written dictionary (IMMERSION_STRINGS below)
  rather than a live translation call: this is a small, fixed set of
  strings that barely ever changes, so translating it once up front
  costs nothing and adds no delay, versus re-translating the same
  handful of button labels on every single page load forever.

  Highlighting any translated text (mouse-drag select, or tap-and-hold
  on mobile) shows a small popup with the English original, via the
  same AI dictionary lookup Reading's word-click already uses — so if
  an unfamiliar word or phrase shows up in the navigation, you're never
  stuck without a way to understand it.

  Purely a per-device UI preference (like the reading split-panel
  width) — stored in plain localStorage, not synced to the account,
  since which language you like your own buttons in isn't really
  "data" the way your notes and vocab are.
*/

const IMMERSION_ENABLED_KEY = "immersion.enabled";

// Every string is written from the learner's-eye view — natural
// phrasing in each language rather than a stiff word-for-word gloss,
// same spirit as everything else hand-written in this app.
const IMMERSION_STRINGS = {
  changeLanguageHeading: { es: "Cambiar idioma", ja: "言語を変更", fr: "Changer de langue" },
  langNameEs: { es: "Español", ja: "スペイン語", fr: "Espagnol" },
  langNameJa: { es: "Japonés", ja: "日本語", fr: "Japonais" },
  langNameFr: { es: "Francés", ja: "フランス語", fr: "Français" },
  notificationsHeading: { es: "Notificaciones", ja: "通知", fr: "Notifications" },
  notificationsEmpty: {
    es: "Próximamente — en cuanto exista una conexión con tu profesor, las novedades aparecerán aquí.",
    ja: "近日公開 — 先生とのつながりができたら、ここに更新情報が表示されます。",
    fr: "Bientôt disponible — une fois qu'une connexion avec un professeur existera, les mises à jour apparaîtront ici.",
  },
  todoTitle: { es: "Lista de tareas", ja: "タスクリスト", fr: "Liste de tâches" },
  todoAddPlaceholder: { es: "Añadir una tarea…", ja: "タスクを追加…", fr: "Ajouter une tâche…" },
  todoAddButton: { es: "Añadir", ja: "追加", fr: "Ajouter" },
  todoNoFolder: { es: "Sin carpeta", ja: "フォルダなし", fr: "Aucun dossier" },
  todoShowCompleted: { es: "Mostrar completadas", ja: "完了済みを表示", fr: "Afficher terminées" },
  logOut: { es: "Cerrar sesión", ja: "ログアウト", fr: "Se déconnecter" },
  tabPickerSectionPlaceholder: { es: "¿Qué sección?", ja: "どのセクション？", fr: "Quelle section ?" },
  tabPickerUnitPlaceholder: { es: "¿Cuál?", ja: "どれ？", fr: "Lequel ?" },
  tabPickerOpen: { es: "Abrir", ja: "開く", fr: "Ouvrir" },
  tabPickerCancel: { es: "Cancelar", ja: "キャンセル", fr: "Annuler" },
  sectionVocab: { es: "Banco de vocabulario", ja: "単語帳", fr: "Banque de vocabulaire" },
  sectionGrammar: { es: "Gramática", ja: "文法", fr: "Grammaire" },
  sectionWriting: { es: "Escritura", ja: "ライティング", fr: "Écriture" },
  sectionSpeaking: { es: "Habla", ja: "スピーキング", fr: "Expression orale" },
  sectionReading: { es: "Lectura", ja: "リーディング", fr: "Lecture" },
  sectionPersonalHub: { es: "Espacio personal", ja: "パーソナルハブ", fr: "Espace personnel" },
  sectionListening: { es: "Escucha", ja: "リスニング", fr: "Écoute" },
};

function isImmersionEnabled() {
  return localStorage.getItem(IMMERSION_ENABLED_KEY) === "true";
}

function setImmersionEnabled(enabled) {
  localStorage.setItem(IMMERSION_ENABLED_KEY, enabled ? "true" : "false");
}

// Swaps one element's text (or placeholder, for inputs) to the target
// language, remembering the original English first so turning
// immersion back off can restore it exactly rather than needing a
// page reload.
function setImmersionText(el, stringKey, lang) {
  if (!el) return;
  const entry = IMMERSION_STRINGS[stringKey];
  if (!entry || !entry[lang]) return;

  const isInput = el.tagName === "INPUT";
  const attr = isInput ? "placeholder" : "textContent";

  if (el.dataset.immersionOriginal === undefined) {
    el.dataset.immersionOriginal = isInput ? el.placeholder : el.textContent;
  }
  el[attr] = entry[lang];
  el.classList.add("immersion-text");
}

function revertImmersionText(el) {
  if (!el || el.dataset.immersionOriginal === undefined) return;
  const isInput = el.tagName === "INPUT";
  el[isInput ? "placeholder" : "textContent"] = el.dataset.immersionOriginal;
  el.classList.remove("immersion-text");
}

const IMMERSION_TARGET_SELECTORS = [
  ["#topbar-menu .topbar-menu-heading", "changeLanguageHeading"],
  ['.topbar-lang-option[data-lang="es"]', "langNameEs"],
  ['.topbar-lang-option[data-lang="ja"]', "langNameJa"],
  ['.topbar-lang-option[data-lang="fr"]', "langNameFr"],
  ["#topbar-notifications-menu .topbar-menu-heading", "notificationsHeading"],
  [".topbar-notifications-empty", "notificationsEmpty"],
  [".hub-todo-title", "todoTitle"],
  ["#hub-todo-add-input", "todoAddPlaceholder"],
  ['#hub-todo-add-form button[type="submit"]', "todoAddButton"],
  ['#hub-todo-folder-select option[value=""]', "todoNoFolder"],
  [".topbar-logout-option", "logOut"],
  ['#app-tab-section-select option[value=""]', "tabPickerSectionPlaceholder"],
  ['#app-tab-unit-select option[value=""]', "tabPickerUnitPlaceholder"],
  ["#app-tab-open-btn", "tabPickerOpen"],
  ["#app-tab-picker-cancel", "tabPickerCancel"],
  ['#app-tab-section-select option[value="vocab"]', "sectionVocab"],
  ['#app-tab-section-select option[value="grammar"]', "sectionGrammar"],
  ['#app-tab-section-select option[value="writing"]', "sectionWriting"],
  ['#app-tab-section-select option[value="speaking"]', "sectionSpeaking"],
  ['#app-tab-section-select option[value="reading"]', "sectionReading"],
  ['#app-tab-section-select option[value="personal-hub"]', "sectionPersonalHub"],
  ['#app-tab-section-select option[value="listening"]', "sectionListening"],
];

// The "Show completed" checkbox label has its text as a bare text node
// sitting next to the checkbox, rather than its own element — wrap it
// once so it's something setImmersionText can actually target and the
// highlight-lookup listener (below) can actually select.
function wrapShowCompletedLabelText() {
  const label = document.querySelector(".hub-todo-show-completed");
  if (!label || label.querySelector(".immersion-text")) return;
  const textNode = Array.from(label.childNodes).find((n) => n.nodeType === 3 && n.textContent.trim());
  if (!textNode) return;
  const span = document.createElement("span");
  span.textContent = textNode.textContent;
  span.dataset.immersionKey = "todoShowCompleted";
  label.replaceChild(span, textNode);
}

function applyImmersion(lang) {
  const enabled = isImmersionEnabled() && SUPPORTED_LANGUAGES.includes(lang);
  document.body.dataset.immersionLang = enabled ? lang : "";

  wrapShowCompletedLabelText();
  const showCompletedSpan = document.querySelector('.hub-todo-show-completed span[data-immersion-key="todoShowCompleted"]');

  IMMERSION_TARGET_SELECTORS.forEach(([selector, key]) => {
    document.querySelectorAll(selector).forEach((el) => {
      if (enabled) setImmersionText(el, key, lang);
      else revertImmersionText(el);
    });
  });
  if (showCompletedSpan) {
    if (enabled) setImmersionText(showCompletedSpan, "todoShowCompleted", lang);
    else revertImmersionText(showCompletedSpan);
  }
}

// ---- Highlight-to-translate popup ----
// A small floating box, created once and reused, positioned next to
// whatever text was just selected — works the same on every page
// since it's injected here rather than relying on any page's own
// markup (unlike Reading's lookup panel, which only exists on Reading
// pages).

let immersionPopupEl = null;

function getImmersionPopup() {
  if (immersionPopupEl) return immersionPopupEl;
  immersionPopupEl = document.createElement("div");
  immersionPopupEl.className = "immersion-popup";
  immersionPopupEl.hidden = true;
  document.body.appendChild(immersionPopupEl);
  return immersionPopupEl;
}

function hideImmersionPopup() {
  if (immersionPopupEl) immersionPopupEl.hidden = true;
}

function positionImmersionPopup(popup, range) {
  const rect = range.getBoundingClientRect();
  const top = rect.bottom + window.scrollY + 6;
  const left = Math.max(8, rect.left + window.scrollX);
  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;
}

async function handleImmersionSelection() {
  const lang = document.body.dataset.immersionLang;
  if (!lang) return; // immersion off — nothing to translate

  const selection = window.getSelection();
  const text = selection && selection.toString().trim();
  if (!text || !selection.rangeCount) {
    hideImmersionPopup();
    return;
  }

  const anchorEl = selection.anchorNode && (selection.anchorNode.nodeType === 3 ? selection.anchorNode.parentElement : selection.anchorNode);
  if (!anchorEl || !anchorEl.closest(".immersion-text")) {
    hideImmersionPopup();
    return;
  }

  const popup = getImmersionPopup();
  const range = selection.getRangeAt(0);
  positionImmersionPopup(popup, range);
  popup.textContent = "…";
  popup.hidden = false;

  try {
    const result = await Translate.lookupTranslation(text, lang, "en");
    popup.textContent = (result && result.translation) || "No translation found.";
  } catch (e) {
    popup.textContent = "Couldn't look that up — check your connection.";
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("mouseup", handleImmersionSelection);
  document.addEventListener("touchend", handleImmersionSelection);
}

// ---- Topbar toggle button ----
// Injected next to the notifications icon, same "add it from JS so
// every page gets it for free" trick used for the Log out option.

function addImmersionToggle(bar) {
  if (!bar || bar.querySelector(".topbar-immersion-toggle")) return;
  const notifBtn = document.getElementById("topbar-notifications");
  if (!notifBtn) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "topbar-immersion-toggle";
  btn.setAttribute("aria-label", "Toggle immersion mode");
  btn.title = "Immersion mode — show menus in the language you're learning";
  btn.textContent = "🌐";
  btn.classList.toggle("active", isImmersionEnabled());

  btn.addEventListener("click", () => {
    const nowEnabled = !isImmersionEnabled();
    setImmersionEnabled(nowEnabled);
    btn.classList.toggle("active", nowEnabled);
    applyImmersion(document.body.dataset.currentLang || currentImmersionLangHint);
  });

  notifBtn.insertAdjacentElement("afterend", btn);
}

// initTopbar(lang) (topbar.js) calls this — keeping a module-level
// fallback of the last-seen language so the toggle button's own click
// handler (which fires long after initTopbar ran) still knows which
// language to switch into without needing topbar.js to pass it again.
let currentImmersionLangHint = null;

function initImmersion(lang) {
  currentImmersionLangHint = lang;
  const bar = document.getElementById("app-topbar");
  addImmersionToggle(bar);
  applyImmersion(lang);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { initImmersion, applyImmersion, isImmersionEnabled, setImmersionEnabled, IMMERSION_STRINGS };
} else {
  window.initImmersion = initImmersion;
}
