/*
  main-hub.js
  -----------
  The Main Hub landing page (personal-hub.html) — now just 3
  static tiles (Class Notebook, Storage Locker, Make your own bubble),
  each linking out to its own page. No CRUD here anymore - that lives on
  those destination pages now. This file only wires up the shared chrome
  (lang detection, topbar/immersion, tab picker, how-to modal is generic
  via html.js) and sets the per-language bits: back link, eyebrow text,
  tile hrefs.
*/

const MAIN_HUB_LANGUAGE_NAMES = { es: "Spanish", ja: "Japanese", fr: "French" };

function getMainHubQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

document.addEventListener("DOMContentLoaded", () => {
  const tilesWrap = document.getElementById("main-hub-tiles");
  if (!tilesWrap) return; // not this page

  const langParam = getMainHubQueryParam("lang");
  const lang = SUPPORTED_LANGUAGES.includes(langParam) ? langParam : "es";
  const langName = MAIN_HUB_LANGUAGE_NAMES[lang];

  const eyebrow = document.getElementById("main-hub-eyebrow");
  if (eyebrow) eyebrow.textContent = `${langName} · Main Hub`;

  const backLink = document.getElementById("personal-hub-back-link");
  if (backLink) backLink.href = `language-home.html?lang=${lang}`;
  const header = document.getElementById("personal-hub-header");
  if (header) header.classList.add(`lang-${lang}`);

  initTopbar(lang);
  if (typeof initHubTasks === "function") initHubTasks(lang);
  initAppTabs({
    section: "personal-hub",
    language: lang,
    label: `${langName} Main Hub`,
    href: `personal-hub.html?lang=${lang}`,
  });

  const notebookTile = document.getElementById("main-hub-notebook-tile");
  if (notebookTile) notebookTile.href = `class-notebook.html?lang=${lang}`;

  const storageTile = document.getElementById("main-hub-storage-tile");
  if (storageTile) storageTile.href = `storage-locker.html?lang=${lang}`;

  const bubblesTile = document.getElementById("main-hub-bubbles-tile");
  if (bubblesTile) bubblesTile.href = `bubbles.html?lang=${lang}`;
});
