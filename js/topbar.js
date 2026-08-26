/*
  topbar.js
  ---------
  A small global bar that sits above every page's own header: a hamburger
  button on the left, the current language centered, and a notifications
  button on the right. The hamburger opens a "Change language" menu —
  picking a language always takes you to that language's home page.
  That's deliberately the ONE predictable target for every page (rather
  than trying to guess a "same page, other language" equivalent, which
  doesn't exist for a lot of pages — you're looking at one specific
  theme, or one specific passage, or one specific Speaking entry, none of
  which have an obvious Japanese/Spanish twin).

  The notifications button is a placeholder for now — there's nothing to
  notify about yet — it just opens a small "coming soon" menu. It'll have
  real content once a teacher-connection feature exists.

  Each page calls initTopbar(lang) once it has resolved its own language
  context, however that page normally does it (?lang=, activeTheme.language,
  currentPassage.language, etc.) — lang is "es", "ja", or null if the page
  genuinely has no language context yet (e.g. an unfiltered Vocab Bank
  list reached without ?lang=). A harmless no-op on any page that doesn't
  include the #app-topbar markup at all.
*/

const TOPBAR_LANGUAGE_NAMES = { es: "Spanish", ja: "Japanese", fr: "French" };

// Wires a trigger button + its dropdown menu: click toggles it, click
// anywhere outside closes it, and opening one closes any other menu
// registered through this same helper (so the language menu and the
// notifications menu can't both be open at once).
const TOPBAR_OPEN_MENUS = [];

function wireTopbarMenu(trigger, menu) {
  if (!trigger || !menu) return;
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const shouldOpen = menu.hidden;
    TOPBAR_OPEN_MENUS.forEach((m) => {
      m.hidden = true;
    });
    menu.hidden = !shouldOpen;
  });
  document.addEventListener("click", (e) => {
    if (!menu.hidden && e.target !== trigger && !menu.contains(e.target)) {
      menu.hidden = true;
    }
  });
  TOPBAR_OPEN_MENUS.push(menu);
}

function initTopbar(lang) {
  const bar = document.getElementById("app-topbar");
  if (!bar) return; // this page doesn't have the topbar markup

  const label = document.getElementById("topbar-lang-label");
  if (label) label.textContent = lang ? TOPBAR_LANGUAGE_NAMES[lang] : "";
  if (lang) bar.classList.add(`lang-${lang}`);

  // Always the title/cover page — the one predictable "take me all the
  // way back" target, same as clicking a logo would on any other site.
  const homeLink = document.getElementById("topbar-home");
  if (homeLink) homeLink.href = "welcome.html";

  wireTopbarMenu(document.getElementById("topbar-hamburger"), document.getElementById("topbar-menu"));
  wireTopbarMenu(document.getElementById("topbar-notifications"), document.getElementById("topbar-notifications-menu"));

  document.querySelectorAll(".topbar-lang-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.href = `language-home.html?lang=${btn.dataset.lang}`;
    });
  });

  addTopbarLogoutOption(document.getElementById("topbar-menu"));

  if (typeof initImmersion === "function") initImmersion(lang);
}

// Appended at runtime rather than baked into every page's own HTML —
// accounts came along well after the topbar markup was copy-pasted
// across 17+ pages, so adding it here means every one of those pages
// gets it for free instead of needing another find-and-replace sweep.
function addTopbarLogoutOption(menu) {
  if (!menu || menu.querySelector(".topbar-logout-option") || typeof Storage === "undefined" || !Storage.logout) return;

  const divider = document.createElement("hr");
  divider.className = "topbar-menu-divider";
  menu.appendChild(divider);

  const logoutBtn = document.createElement("button");
  logoutBtn.type = "button";
  logoutBtn.className = "topbar-lang-option topbar-logout-option";
  logoutBtn.textContent = "Log out";
  logoutBtn.addEventListener("click", () => Storage.logout());
  menu.appendChild(logoutBtn);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { initTopbar };
} else {
  window.initTopbar = initTopbar;
}
