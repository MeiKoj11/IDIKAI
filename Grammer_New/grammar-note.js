// Grammer_New/grammar-note.js
// -----------------------------------------------------------------------
// One generic note-detail page/renderer for Grammar (plan §1) — replaces
// the fork between grammar-conjugation-note.html (conjugation cards only)
// and the inline accordion card (grammar-theme.html) for structure/
// header-based notes. Both note shapes now land here:
//   - conjugationForm present  -> Formation table + the dedicated
//     ja-conjugator practice engine (startConjugationPractice), unchanged.
//   - header present, no conjugationForm -> the existing generic
//     self-graded practice engine (startCardPractice/toggleCardPractice's
//     logic), unchanged, just hosted in a details/summary here instead
//     of an inline panel.
// New optional fields (oneLineSummary, meaningNuance, commonMistakes,
// formationTable, relatedForms/relatedPoints, level) render when present
// and are simply omitted when a note doesn't have them yet — this page
// works unchanged for notes that haven't been retrofitted with the new
// fields (e.g. Spanish/French's existing tense notes today).
//
// Relies on globals already loaded by the shared scripts this page
// includes (topbar.js, immersion.js, app-tabs.js, storage.js,
// translate.js, grammar-concepts.js, ja-conjugator.js, grammar-app.js):
// getQueryParam, initTopbar, initHubTasks, initAppTabs,
// buildExamplesDisplayBlock, startConjugationPractice,
// conjugationPracticeSessions, startCardPractice, renderCardPracticePanel,
// grammarCardPracticeSessions.

function levelImmersionKey(level) {
  const key = (level || "").toLowerCase();
  if (key === "beginner") return "levelBeginner";
  if (key === "intermediate") return "levelIntermediate";
  if (key === "advanced") return "levelAdvanced";
  return null;
}

function gnBuildMetaRow(note) {
  const row = document.createElement("div");
  row.className = "gn-meta-row";
  let any = false;

  if (note.level) {
    const pill = document.createElement("span");
    pill.className = "pill-tag";
    const key = levelImmersionKey(note.level);
    if (key) {
      pill.dataset.immersionKey = key;
      pill.textContent = note.level;
    } else {
      pill.textContent = note.level;
    }
    row.appendChild(pill);
    any = true;
  }

  if (note.register) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = note.register;
    row.appendChild(chip);
    any = true;
  }

  if (note.tags && note.tags.length) {
    note.tags.forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = tag;
      row.appendChild(chip);
      any = true;
    });
  }

  return any ? row : null;
}

function gnBuildMistakesList(mistakes) {
  const ul = document.createElement("ul");
  ul.className = "gn-mistakes-list";
  mistakes.forEach((m) => {
    const li = document.createElement("li");
    li.textContent = m;
    ul.appendChild(li);
  });
  return ul;
}

function gnBuildFormationTable(rows) {
  const table = document.createElement("table");
  table.className = "gn-formation-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["Group", "Rule", "Example"].forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    [row.group, row.rule, row.example].forEach((val) => {
      const td = document.createElement("td");
      td.textContent = val || "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  return table;
}

// Resolves related-point references into actual notes, from either a
// relatedForms list (conjugationForm strings, resolved against sibling
// notes in the same folder — how the JA conjugation cards link to each
// other) or a relatedPoints list (note ids directly, for any note type).
// Dedupes by note id and drops anything that no longer resolves (a
// deleted note, a typo'd id) rather than erroring.
function gnResolveRelatedNotes(note) {
  const seen = new Set([note.id]);
  const related = [];

  if (note.relatedForms && note.relatedForms.length) {
    const siblings = Storage.getGrammarNotes(note.themeId) || [];
    note.relatedForms.forEach((form) => {
      const match = siblings.find((n) => n.conjugationForm === form);
      if (match && !seen.has(match.id)) {
        seen.add(match.id);
        related.push(match);
      }
    });
  }

  if (note.relatedPoints && note.relatedPoints.length) {
    note.relatedPoints.forEach((idOrRef) => {
      const id = typeof idOrRef === "string" ? idOrRef : idOrRef.noteId;
      if (!id || seen.has(id)) return;
      const match = Storage.getGrammarNote(id);
      if (match) {
        seen.add(id);
        related.push(match);
      }
    });
  }

  return related;
}

function initGrammarNotePage() {
  const panel = document.getElementById("gn-panel");
  if (!panel) return; // not this page

  const noteId = getQueryParam("noteId");
  let note = noteId ? Storage.getGrammarNote(noteId) : null;

  if (!note) {
    document.getElementById("gn-not-found").hidden = false;
    const side = document.getElementById("gn-side");
    if (side) side.hidden = true;
    return;
  }

  const theme = Storage.getGrammarTheme(note.themeId);
  const language = (theme && theme.language) || "ja";

  // idikai-refresh.css scopes the --accent custom property off body.lang-XX.
  document.body.classList.add(`lang-${language}`);

  // Conjugation notes go through the same content-migration path the old
  // page used, then get re-read so a stale/backfilled field doesn't
  // render before it's fixed (fixStalePassiveExplanation,
  // backfillConjugationTemplateFields, etc. — see storage.js).
  if (note.conjugationForm) {
    Storage.ensureDefaultConjugationCards(language);
    note = Storage.getGrammarNote(noteId) || note;
  }

  const headingText = note.header || note.sentence || "";
  document.getElementById("gn-heading").textContent = headingText;
  const header = document.getElementById("gn-header");
  if (header) header.classList.add(`lang-${language}`);
  const backLink = document.getElementById("gn-back-link");
  if (backLink) {
    backLink.href = theme ? `../grammar-theme.html?id=${encodeURIComponent(theme.id)}` : "../grammar.html";
  }

  initTopbar(language);
  if (typeof initHubTasks === "function") initHubTasks(language);
  initAppTabs({
    section: "grammar",
    language,
    label: headingText,
    href: `Grammer_New/grammar-note.html?noteId=${encodeURIComponent(note.id)}`,
  });

  const metaRow = gnBuildMetaRow(note);
  const metaSlot = document.getElementById("gn-meta-slot");
  if (metaRow) metaSlot.appendChild(metaRow);

  if (note.oneLineSummary) {
    document.getElementById("gn-one-line-summary").textContent = note.oneLineSummary;
  } else {
    document.getElementById("gn-one-line-summary").hidden = true;
  }

  document.getElementById("gn-explanation").textContent = note.explanation || "";

  if (note.meaningNuance) {
    document.getElementById("gn-nuance-text").textContent = note.meaningNuance;
  } else {
    document.getElementById("gn-nuance-details").hidden = true;
  }

  const examplesRoot = document.getElementById("gn-examples");
  if (note.examples && note.examples.length) {
    examplesRoot.appendChild(buildExamplesDisplayBlock(note.examples));
  } else {
    examplesRoot.textContent = "No examples yet.";
    examplesRoot.dataset.immersionKey = "noExamplesYetText";
  }
  if (note.variants && note.variants.length && typeof buildVariantDisplayBlock === "function") {
    note.variants.forEach((variant) => {
      examplesRoot.appendChild(buildVariantDisplayBlock(variant));
    });
  }

  if (note.commonMistakes && note.commonMistakes.length) {
    document.getElementById("gn-mistakes").appendChild(gnBuildMistakesList(note.commonMistakes));
  } else {
    document.getElementById("gn-mistakes-details").hidden = true;
  }

  if (note.formationTable && note.formationTable.length) {
    document.getElementById("gn-formation").appendChild(gnBuildFormationTable(note.formationTable));
  } else {
    document.getElementById("gn-formation-details").hidden = true;
  }

  // Test me / Practice — same two engines as before, just both reachable
  // from one page now. A note that's neither a conjugation card nor
  // AI-classified with a grammarLabel has nothing to test yet (matches
  // today's behavior, where the inline "Test me on this" button only
  // ever showed up when note.grammarLabel was set).
  const practiceDetails = document.getElementById("gn-practice-details");
  const practiceRoot = document.getElementById("gn-practice-root");
  if (note.practiceType === "conjugation") {
    practiceDetails.addEventListener("toggle", () => {
      if (!practiceDetails.open) return;
      if (!conjugationPracticeSessions[note.id]) {
        startConjugationPractice(note, practiceRoot);
      }
    });
  } else if (note.grammarLabel) {
    practiceDetails.addEventListener("toggle", () => {
      if (!practiceDetails.open) return;
      if (!grammarCardPracticeSessions[note.id]) {
        startCardPractice(note, practiceRoot);
      } else {
        renderCardPracticePanel(note, practiceRoot);
      }
    });
  } else {
    practiceDetails.hidden = true;
  }

  const relatedNotes = gnResolveRelatedNotes(note);
  if (relatedNotes.length) {
    const row = document.getElementById("gn-related-row");
    relatedNotes.forEach((rel) => {
      const a = document.createElement("a");
      a.className = "chip chip-outline-link";
      a.textContent = rel.header || rel.sentence || "Untitled note";
      a.href = `grammar-note.html?noteId=${encodeURIComponent(rel.id)}`;
      row.appendChild(a);
    });
  } else {
    document.getElementById("gn-related-details").hidden = true;
  }

  // Side "full test" CTA — only meaningful for conjugation cards today
  // (Japanese is the only language with them); structure notes have no
  // equivalent all-forms drill to point at.
  const side = document.getElementById("gn-side");
  if (side && note.practiceType !== "conjugation") {
    side.hidden = true;
  }

  panel.hidden = false;
}

document.addEventListener("DOMContentLoaded", initGrammarNotePage);
