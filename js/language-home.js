/*
  language-home.js
  -----------------
  Renders the per-language hub (language-home.html?lang=es|ja|fr): a big
  "Main Hub" hero card (storage locker, freeform notes, to-do space) plus
  a grid of the 5 built subject cards and one "not built yet" placeholder
  (Listening). Same layout for every language — only the accent color
  and which cards are enabled differ.

  Markup follows the Claude Design mockup (card/grid-tiles/col-main /
  col-side primitives in css/idikai-refresh.css) — see language-home.html.
*/

const LANGUAGE_LABELS = { es: "Spanish", ja: "Japanese", fr: "French" };

// The large hero card at the top of the main column.
const HUB_HERO = {
  title: "Main Hub",
  titleKey: "sectionPersonalHub",
  badge: "Notebook & files",
  badgeKey: "mainHubHeroBadge",
  desc: "Class Notebook, Storage Locker, Helper Notebook and your own note bubbles — everything that isn't a drill.",
  descKey: "mainHubHeroDesc",
  href: (lang) => `personal-hub.html?lang=${lang}`,
};

// The grid of subject cards below the hero. href: null means "not built
// yet" -> renders as a dashed, disabled card.
const HUB_TILES = [
  {
    title: "Vocab Bank",
    titleKey: "sectionVocab",
    sub: "Themes, words, verb conjugation, flashcards",
    subKey: "subVocab",
    href: (lang) => `vocab.html?lang=${lang}`,
    available: () => true,
  },
  {
    title: "Grammar",
    titleKey: "sectionGrammar",
    sub: "Your own notes on sentence structures and patterns",
    subKey: "subGrammar",
    href: (lang) => `grammar.html?lang=${lang}`,
    available: () => true,
  },
  {
    title: "Writing",
    titleKey: "sectionWriting",
    sub: "Dated diary-style entries, linked to a passage to reference",
    subKey: "subWriting",
    href: (lang) => `writing.html?lang=${lang}`,
    available: () => true,
  },
  {
    title: "Speaking",
    titleKey: "sectionSpeaking",
    sub: "Record yourself speaking, linked to a passage to read aloud",
    subKey: "subSpeaking",
    href: (lang) => `speaking.html?lang=${lang}`,
    available: () => true,
  },
  {
    title: "Reading",
    titleKey: "sectionReading",
    sub: "Passages with click-to-look-up words",
    subKey: "subReading",
    href: (lang) => `reading.html?lang=${lang}`,
    available: () => true,
  },
  {
    title: "Listening",
    titleKey: "sectionListening",
    sub: "Coming soon",
    subKey: "comingSoon",
    href: () => null,
    available: () => false,
    globallyUnbuilt: true,
  },
];

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

document.addEventListener("DOMContentLoaded", () => {
  const lang = getQueryParam("lang");
  const colMain = document.getElementById("lang-home-col-main");

  if (!SUPPORTED_LANGUAGES.includes(lang)) {
    initTopbar(null);
    initAppTabs(null);
    if (colMain) {
      colMain.innerHTML = "";
      const msg = document.createElement("p");
      msg.className = "empty-hint";
      msg.textContent = "Language not found — go back and pick Spanish or Japanese.";
      colMain.appendChild(msg);
    }
    return;
  }

  document.title = LANGUAGE_LABELS[lang];
  // idikai-refresh.css scopes the --accent custom property off
  // body.lang-XX (used by .dot below) — the topbar already gets its own
  // lang-XX class from initTopbar, but the page body doesn't, so set it
  // here too.
  document.body.classList.add(`lang-${lang}`);
  initTopbar(lang);
  initAppTabs(null); // a picker hub, not a single addressable unit
  if (typeof initHubTasks === "function") initHubTasks(lang);

  if (!colMain) return;

  // Hero card.
  const hero = document.createElement("a");
  hero.href = HUB_HERO.href(lang);
  hero.className = "card card-red card-lift";
  const heroHead = document.createElement("div");
  heroHead.style.cssText = "display:flex; flex-wrap:wrap; align-items:center; gap:14px";
  const heroTitle = document.createElement("h2");
  heroTitle.style.fontSize = "26px";
  heroTitle.textContent = HUB_HERO.title;
  heroTitle.dataset.immersionKey = HUB_HERO.titleKey;
  const heroBadge = document.createElement("span");
  heroBadge.className = "badge-outline";
  heroBadge.textContent = HUB_HERO.badge;
  heroBadge.dataset.immersionKey = HUB_HERO.badgeKey;
  heroHead.appendChild(heroTitle);
  heroHead.appendChild(heroBadge);
  hero.appendChild(heroHead);
  const heroDesc = document.createElement("p");
  heroDesc.className = "card-text";
  heroDesc.style.maxWidth = "52ch";
  heroDesc.textContent = HUB_HERO.desc;
  heroDesc.dataset.immersionKey = HUB_HERO.descKey;
  hero.appendChild(heroDesc);
  colMain.appendChild(hero);

  // Tile grid.
  const grid = document.createElement("div");
  grid.className = "grid-tiles";
  colMain.appendChild(grid);

  HUB_TILES.forEach((tile) => {
    const isAvailable = tile.available(lang);
    const href = isAvailable ? tile.href(lang) : null;

    const el = document.createElement(isAvailable && href ? "a" : "div");
    el.className = isAvailable && href ? "card card-ruled card-lift" : "card card-dashed";
    if (isAvailable && href) el.href = href;

    const dot = document.createElement("span");
    dot.className = "dot";
    if (!isAvailable) dot.style.cssText = "background:transparent; border-color:rgba(34,23,18,0.4)";
    el.appendChild(dot);

    const titleEl = document.createElement("h3");
    titleEl.className = "card-title";
    titleEl.style.marginTop = "12px";
    if (!isAvailable) titleEl.style.color = "rgba(34,23,18,0.55)";
    titleEl.textContent = tile.title;
    titleEl.dataset.immersionKey = tile.titleKey;
    el.appendChild(titleEl);

    const subEl = document.createElement("p");
    subEl.className = "card-text";
    if (!isAvailable) subEl.style.color = "rgba(34,23,18,0.5)";
    if (isAvailable) {
      subEl.textContent = tile.sub;
      subEl.dataset.immersionKey = tile.subKey;
    } else if (tile.globallyUnbuilt) {
      subEl.textContent = "Coming soon";
      subEl.dataset.immersionKey = "comingSoon";
    } else {
      subEl.textContent = "Coming soon for this language";
      subEl.dataset.immersionKey = "comingSoonForLanguage";
    }
    el.appendChild(subEl);

    grid.appendChild(el);
  });
});
