/*
  language-home.js
  -----------------
  Renders the 7-bubble hub for a single language (language-home.html?lang=es|ja):
  6 subject sections arranged in a flower pattern around a 7th "Personal
  Hub" bubble (your own freeform notes/to-do space) in the middle. Same
  layout for every language — only the accent color and which bubbles
  are enabled differ.

  Each bubble has a `row` (1, 2, or 3) matching where it sits in the
  flower: row 1 is the top pair, row 2 is the middle trio (Personal Hub
  always centered), row 3 is the bottom pair.
*/

const LANGUAGE_LABELS = { es: "Spanish", ja: "Japanese", fr: "French" };

// href: null means "not built yet" -> renders as a disabled bubble.
const HUB_BUBBLES = [
  {
    title: "Vocab Bank",
    titleKey: "sectionVocab",
    sub: "Themes, words, verb conjugation, flashcards",
    subKey: "subVocab",
    href: (lang) => `vocab.html?lang=${lang}`,
    available: () => true,
    row: 1,
  },
  {
    title: "Grammar",
    titleKey: "sectionGrammar",
    sub: "Your own notes on sentence structures and patterns",
    subKey: "subGrammar",
    href: (lang) => `grammar.html?lang=${lang}`,
    available: () => true,
    row: 1,
  },
  {
    title: "Writing",
    titleKey: "sectionWriting",
    sub: "Dated diary-style entries, linked to a passage to reference",
    subKey: "subWriting",
    href: (lang) => `writing.html?lang=${lang}`,
    available: () => true,
    row: 2,
  },
  {
    title: "Personal Hub",
    titleKey: "sectionPersonalHub",
    sub: "Your own space — notes, to-do lists, anything",
    subKey: "subPersonalHub",
    href: (lang) => `personal-hub.html?lang=${lang}`,
    available: () => true,
    row: 2,
  },
  {
    title: "Listening",
    titleKey: "sectionListening",
    sub: "Coming soon",
    subKey: "comingSoon",
    href: () => null,
    available: () => false,
    globallyUnbuilt: true,
    row: 2,
  },
  {
    title: "Reading",
    titleKey: "sectionReading",
    sub: "Passages with click-to-look-up words",
    subKey: "subReading",
    href: (lang) => `reading.html?lang=${lang}`,
    available: () => true,
    row: 3,
  },
  {
    title: "Speaking",
    titleKey: "sectionSpeaking",
    sub: "Record yourself speaking, linked to a passage to read aloud",
    subKey: "subSpeaking",
    href: (lang) => `speaking.html?lang=${lang}`,
    available: () => true,
    row: 3,
  },
];

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

document.addEventListener("DOMContentLoaded", () => {
  const lang = getQueryParam("lang");
  const flower = document.getElementById("lang-home-flower");

  if (!SUPPORTED_LANGUAGES.includes(lang)) {
    initTopbar(null);
    initAppTabs(null);
    if (flower) {
      flower.innerHTML = "";
      const msg = document.createElement("p");
      msg.className = "empty-hint";
      msg.textContent = "Language not found — go back and pick Spanish or Japanese.";
      flower.appendChild(msg);
    }
    return;
  }

  document.title = LANGUAGE_LABELS[lang];
  initTopbar(lang);
  initAppTabs(null); // a picker hub, not a single addressable unit
  if (typeof initHubTasks === "function") initHubTasks(lang);

  if (!flower) return;

  HUB_BUBBLES.forEach((bubble) => {
    const row = document.getElementById(`lang-row-${bubble.row}`);
    if (!row) return;

    const isAvailable = bubble.available(lang);
    const href = isAvailable ? bubble.href(lang) : null;

    const el = document.createElement(isAvailable && href ? "a" : "div");
    el.className = isAvailable && href ? `bubble lang-${lang}` : "bubble bubble-disabled";
    if (isAvailable && href) el.href = href;
    if (bubble.title === "Personal Hub") el.classList.add("bubble-personal-hub");

    const titleEl = document.createElement("span");
    titleEl.className = "bubble-title";
    titleEl.textContent = bubble.title;
    titleEl.dataset.immersionKey = bubble.titleKey;
    el.appendChild(titleEl);

    const subEl = document.createElement("span");
    subEl.className = "bubble-sub";
    if (isAvailable) {
      subEl.textContent = bubble.sub;
      subEl.dataset.immersionKey = bubble.subKey;
    } else if (bubble.globallyUnbuilt) {
      subEl.textContent = "Coming soon";
      subEl.dataset.immersionKey = "comingSoon";
    } else {
      subEl.textContent = "Coming soon for this language";
      subEl.dataset.immersionKey = "comingSoonForLanguage";
    }
    el.appendChild(subEl);

    row.appendChild(el);
  });
});
