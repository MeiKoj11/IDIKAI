// Grammer_New/grammar-add-conjugation-note.js
// -----------------------------------------------------------------------
// Dedicated add/edit page for custom, user-authored conjugation-style
// grammar notes, reached only from Japanese > "Tenses and verb
// conjugations" (see the routing added to initGrammarThemePage and
// buildStructureCard's edit button in js/grammar-app.js). Saved notes
// use the same generic note shape as the existing structure-card notes
// (header/explanation/examples/tags — see handleGrammarNoteSubmit in
// grammar-app.js) plus three fields unique to this flow:
// structureTemplate, structureRule, structureConfirmed.
//
// There is no local rule engine for an arbitrary user-defined pattern
// (ja-conjugator.js only knows its four fixed forms), so every AI
// feature here — the "AI detect" formation-rule lookup, "generate 3
// more examples", and both practice boxes — goes through the three new
// server endpoints (detect/generate-examples/generate-practice) added
// alongside classify-grammar-point, never through ja-conjugator.js.
//
// Relies on globals already loaded by the shared scripts this page
// includes (topbar.js, immersion.js, app-tabs.js, storage.js,
// translate.js, grammar-app.js, howto.js): getQueryParam, initTopbar,
// initHubTasks, initAppTabs, makeEmptyExample, buildExampleRow,
// GRAMMAR_LANGUAGE_NAMES.

let gacThemeId = null;
let gacEditingNoteId = null;

// gacExamples[0] is the required "anchor" example (the two plain boxes
// at the top of the page — Example sentence in TL / in English); [1+]
// are additional examples, either added by hand or by "Generate 3 more
// examples", reusing buildExampleRow/makeEmptyExample verbatim so they
// get the same edit/remove/AI-recheck behaviour as the general add-note
// page's example rows.
let gacExamples = [];

// The two-step "AI detect" flow (see plan): a fresh suggestion sits in
// gacPendingRuleSuggestion until accepted or declined; once accepted it
// becomes the stored gacStructureRule note under the Structure template
// box. gacLastDetectedTemplate records which exact template text that
// accepted rule belongs to, so editing the template afterwards doesn't
// silently leave a stale rule/confirmation attached to a different
// pattern — the separate "confirm" checkbox can only be ticked while
// the template still matches what was last accepted.
let gacPendingRuleSuggestion = null;
let gacStructureRule = "";
let gacStructureRuleAccepted = false;
let gacLastDetectedTemplate = null;
let gacDetecting = false;
let gacDetectError = null;
let gacStructureConfirmed = false;

// One self-graded practice session per gated box ("word" = quick
// conjugation test, "sentence" = sentence test) — same session shape
// and reveal-answer UI as renderCardPracticePanel elsewhere in the app.
const gacPracticeSessions = { word: null, sentence: null };

function makeGacAnchorExample() {
  return { id: Storage.uid(), target: "", translation: "", checked: false, corrected: "", note: "", checking: false, checkError: null, lastCheckedText: "" };
}

function gacPracticePanelId(style) {
  return style === "word" ? "gac-word-test-panel" : "gac-sentence-test-panel";
}

function gacPracticeToggleId(style) {
  return style === "word" ? "gac-word-test-toggle" : "gac-sentence-test-toggle";
}

// ---------------------------------------------------------------------
// Structure template / AI detect
// ---------------------------------------------------------------------

function renderStructureStatus() {
  const el = document.getElementById("gac-structure-status");
  if (!el) return;
  el.innerHTML = "";
  el.classList.remove("card-example-status-ok", "card-example-status-issue");
  el.hidden = false;

  if (gacDetecting) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "Detecting…";
    el.appendChild(p);
    return;
  }

  if (gacDetectError) {
    el.classList.add("card-example-status-issue");
    const p = document.createElement("p");
    p.textContent = gacDetectError;
    el.appendChild(p);
    return;
  }

  if (gacPendingRuleSuggestion !== null) {
    const p = document.createElement("p");
    p.textContent = gacPendingRuleSuggestion;
    el.appendChild(p);

    const btnRow = document.createElement("div");
    btnRow.className = "card-practice-judge-row";

    const acceptBtn = document.createElement("button");
    acceptBtn.type = "button";
    acceptBtn.textContent = "Accept";
    acceptBtn.addEventListener("click", () => {
      gacStructureRule = gacPendingRuleSuggestion;
      gacStructureRuleAccepted = true;
      gacLastDetectedTemplate = (document.getElementById("gac-structure-template").value || "").trim();
      gacPendingRuleSuggestion = null;
      renderStructureStatus();
      updateStructureConfirmAvailability();
    });
    btnRow.appendChild(acceptBtn);

    const declineBtn = document.createElement("button");
    declineBtn.type = "button";
    declineBtn.className = "secondary";
    declineBtn.textContent = "Decline";
    declineBtn.addEventListener("click", () => {
      gacPendingRuleSuggestion = null;
      renderStructureStatus();
    });
    btnRow.appendChild(declineBtn);

    el.appendChild(btnRow);
    return;
  }

  if (gacStructureRuleAccepted && gacStructureRule) {
    el.classList.add("card-example-status-ok");
    const p = document.createElement("p");
    p.textContent = gacStructureRule;
    el.appendChild(p);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "secondary";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => {
      gacStructureRule = "";
      gacStructureRuleAccepted = false;
      gacLastDetectedTemplate = null;
      renderStructureStatus();
      updateStructureConfirmAvailability();
    });
    el.appendChild(removeBtn);
    return;
  }

  el.hidden = true;
}

async function runStructureDetect() {
  const name = (document.getElementById("gac-name").value || "").trim();
  const structureTemplate = (document.getElementById("gac-structure-template").value || "").trim();
  if (!structureTemplate) {
    alert("Fill in a structure template first.");
    return;
  }

  const anchor = gacExamples[0];
  gacDetecting = true;
  gacDetectError = null;
  gacPendingRuleSuggestion = null;
  renderStructureStatus();

  const result = await Translate.detectConjugationStructure(name, anchor.target || "", anchor.translation || "", structureTemplate, "ja");
  gacDetecting = false;

  if (result.error) {
    gacDetectError = result.error;
    renderStructureStatus();
    return;
  }

  if (result.refinedStructureTemplate && result.refinedStructureTemplate.trim()) {
    document.getElementById("gac-structure-template").value = result.refinedStructureTemplate.trim();
  }
  gacPendingRuleSuggestion = result.formationRule || "";
  renderStructureStatus();
  updateStructureConfirmAvailability();
}

// The confirm checkbox can only be ticked while the current Structure
// template text still matches the template the accepted rule was
// detected against — editing the template afterwards (without
// re-detecting) un-confirms and re-locks it, since the stored rule may
// no longer describe the pattern actually typed in the box.
function updateStructureConfirmAvailability() {
  const confirmEl = document.getElementById("gac-structure-confirm");
  const hintEl = document.getElementById("gac-structure-confirm-hint");
  if (!confirmEl) return;

  const currentTemplate = (document.getElementById("gac-structure-template").value || "").trim();
  const ready = gacStructureRuleAccepted && !!gacLastDetectedTemplate && currentTemplate === gacLastDetectedTemplate;

  confirmEl.disabled = !ready;
  if (!ready) {
    confirmEl.checked = false;
    gacStructureConfirmed = false;
  }
  if (hintEl) {
    hintEl.textContent = ready
      ? "Tick to confirm this structure template — this unlocks example and test generation below."
      : "Use AI detect and accept a formation rule for the current structure template to enable this.";
  }
  updateGatedSectionsAvailability();
}

function updateGatedSectionsAvailability() {
  const enabled = gacStructureConfirmed;
  ["gac-generate-examples-btn", "gac-word-test-toggle", "gac-sentence-test-toggle"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  });
  if (!enabled) {
    ["word", "sentence"].forEach((style) => {
      const panel = document.getElementById(gacPracticePanelId(style));
      if (panel) panel.hidden = true;
    });
  }
}

// ---------------------------------------------------------------------
// Additional examples ("+ Generate 3 more examples" and manual edits)
// ---------------------------------------------------------------------

function renderGacExamplesList() {
  const container = document.getElementById("gac-examples-list");
  if (!container) return;
  container.innerHTML = "";
  gacExamples.slice(1).forEach((example) => {
    container.appendChild(buildExampleRow(example, gacExamples, renderGacExamplesList));
  });
}

async function handleGenerateMoreExamples() {
  const btn = document.getElementById("gac-generate-examples-btn");
  if (!btn || btn.disabled) return;

  const name = (document.getElementById("gac-name").value || "").trim();
  const structureTemplate = (document.getElementById("gac-structure-template").value || "").trim();
  const anchor = gacExamples[0];

  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = "Generating…";

  const avoidTargets = gacExamples.map((ex) => ex.target).filter(Boolean);
  const result = await Translate.generateConjugationExamples(
    name,
    structureTemplate,
    gacStructureRule,
    anchor.target || "",
    anchor.translation || "",
    "ja",
    avoidTargets,
    3
  );

  btn.disabled = false;
  btn.textContent = originalLabel;

  if (result.error || !result.examples.length) {
    alert(result.error || "Couldn't generate examples right now — try again in a moment.");
    return;
  }

  result.examples.forEach((ex) => {
    gacExamples.push({
      id: Storage.uid(),
      target: ex.target || "",
      translation: ex.translation || "",
      checked: true,
      corrected: "",
      note: "AI-generated",
      checking: false,
      checkError: null,
      lastCheckedText: ex.target || "",
    });
  });
  renderGacExamplesList();
}

// ---------------------------------------------------------------------
// Practice boxes — quick conjugation test ("word") and sentence test
// ---------------------------------------------------------------------

function toggleGacPractice(style) {
  const panelEl = document.getElementById(gacPracticePanelId(style));
  if (!panelEl) return;
  const isOpen = !panelEl.hidden;
  if (isOpen) {
    panelEl.hidden = true;
    return;
  }
  panelEl.hidden = false;
  if (!gacPracticeSessions[style]) {
    startGacPractice(style, panelEl);
  } else {
    renderGacPracticePanel(style, panelEl);
  }
}

async function startGacPractice(style, panelEl) {
  gacPracticeSessions[style] = {
    direction: "enToJa", // "enToJa" | "jaToEn"
    items: [],
    usedTargets: [],
    index: 0,
    revealed: false,
    correct: 0,
    total: 0,
    loading: true,
    error: null,
  };
  renderGacPracticePanel(style, panelEl);
  await fetchMoreGacPracticeItems(style);
  renderGacPracticePanel(style, panelEl);
}

async function fetchMoreGacPracticeItems(style) {
  const session = gacPracticeSessions[style];
  if (!session) return;
  session.loading = true;
  session.error = null;

  const name = (document.getElementById("gac-name").value || "").trim();
  const structureTemplate = (document.getElementById("gac-structure-template").value || "").trim();
  const anchor = gacExamples[0];

  const result = await Translate.generateConjugationPractice(
    name,
    structureTemplate,
    gacStructureRule,
    anchor.target || "",
    anchor.translation || "",
    "ja",
    style,
    session.usedTargets,
    5
  );

  session.loading = false;
  if (result.error) {
    session.error = result.error;
    return;
  }
  result.items.forEach((item) => {
    if (!item || !item.promptEnglish || !item.answerTarget) return;
    session.items.push(item);
    session.usedTargets.push(item.answerTarget);
  });
}

function renderGacPracticePanel(style, panelEl) {
  const session = gacPracticeSessions[style];
  panelEl.innerHTML = "";
  if (!session) return;

  const directionRow = document.createElement("div");
  directionRow.className = "card-practice-direction-row";
  const directionLabel = document.createElement("label");
  directionLabel.textContent = "Direction: ";
  const directionSelect = document.createElement("select");
  [
    ["enToJa", "English → Japanese"],
    ["jaToEn", "Japanese → English"],
  ].forEach(([value, label]) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    if (value === session.direction) opt.selected = true;
    directionSelect.appendChild(opt);
  });
  directionSelect.addEventListener("click", (e) => e.stopPropagation());
  directionSelect.addEventListener("change", () => {
    session.direction = directionSelect.value;
    session.revealed = false;
    renderGacPracticePanel(style, panelEl);
  });
  directionLabel.appendChild(directionSelect);
  directionRow.appendChild(directionLabel);
  panelEl.appendChild(directionRow);

  const scoreEl = document.createElement("div");
  scoreEl.className = "card-practice-score";
  scoreEl.textContent = session.total > 0 ? `${session.correct} / ${session.total} self-marked correct` : "";
  panelEl.appendChild(scoreEl);

  if (session.loading) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "Generating practice…";
    panelEl.appendChild(p);
    return;
  }

  if (session.error) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = session.error;
    panelEl.appendChild(p);

    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "secondary";
    retryBtn.textContent = "Try again";
    retryBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await fetchMoreGacPracticeItems(style);
      renderGacPracticePanel(style, panelEl);
    });
    panelEl.appendChild(retryBtn);
    return;
  }

  if (session.index >= session.items.length) {
    fetchMoreGacPracticeItems(style).then(() => renderGacPracticePanel(style, panelEl));
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "Generating more practice…";
    panelEl.appendChild(p);
    return;
  }

  const item = session.items[session.index];
  const isEnToJa = session.direction === "enToJa";
  const promptText = isEnToJa ? item.promptEnglish : item.answerTarget;
  const answerText = isEnToJa ? item.answerTarget : item.promptEnglish;

  const promptEl = document.createElement("p");
  promptEl.className = "card-practice-prompt";
  promptEl.textContent = promptText;
  panelEl.appendChild(promptEl);

  const answerInput = document.createElement("textarea");
  answerInput.rows = 2;
  answerInput.placeholder = isEnToJa ? "答えを入力…" : "Your answer in English…";
  answerInput.className = "card-practice-input";
  answerInput.addEventListener("click", (e) => e.stopPropagation());
  panelEl.appendChild(answerInput);

  if (!session.revealed) {
    const revealBtn = document.createElement("button");
    revealBtn.type = "button";
    revealBtn.textContent = "Show answer";
    revealBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      session.revealed = true;
      renderGacPracticePanel(style, panelEl);
    });
    panelEl.appendChild(revealBtn);
  } else {
    const answerEl = document.createElement("p");
    answerEl.className = "card-practice-answer";
    answerEl.textContent = `Model answer: ${answerText}`;
    panelEl.appendChild(answerEl);

    const judgeRow = document.createElement("div");
    judgeRow.className = "card-practice-judge-row";

    const gotItBtn = document.createElement("button");
    gotItBtn.type = "button";
    gotItBtn.textContent = "Got it";
    gotItBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      session.total += 1;
      session.correct += 1;
      session.index += 1;
      session.revealed = false;
      renderGacPracticePanel(style, panelEl);
    });
    judgeRow.appendChild(gotItBtn);

    const missedBtn = document.createElement("button");
    missedBtn.type = "button";
    missedBtn.className = "secondary";
    missedBtn.textContent = "Missed it";
    missedBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      session.total += 1;
      session.index += 1;
      session.revealed = false;
      renderGacPracticePanel(style, panelEl);
    });
    judgeRow.appendChild(missedBtn);

    panelEl.appendChild(judgeRow);
  }

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "secondary card-practice-close";
  closeBtn.textContent = "Close practice";
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    panelEl.hidden = true;
  });
  panelEl.appendChild(closeBtn);
}

// ---------------------------------------------------------------------
// Page init + submit
// ---------------------------------------------------------------------

function initGrammarAddConjugationNotePage() {
  const form = document.getElementById("gac-form");
  if (!form) return; // not this page

  activeNoteLang = "ja"; // buildExampleRow's caption text depends on this global

  gacThemeId = getQueryParam("themeId");
  const noteId = getQueryParam("noteId");
  gacEditingNoteId = noteId || null;
  const existingNote = noteId ? Storage.getGrammarNote(noteId) : null;

  const heading = document.getElementById("gac-heading");
  if (heading) heading.textContent = existingNote ? "Edit grammar note" : "New grammar note";
  const submitBtn = document.getElementById("gac-submit-btn");
  if (submitBtn) submitBtn.textContent = existingNote ? "Save changes" : "Save note";

  const backLink = document.getElementById("gac-back-link");
  const backThemeId = gacThemeId || (existingNote && existingNote.themeId);
  if (backLink && backThemeId) {
    backLink.href = `../grammar-theme.html?id=${encodeURIComponent(backThemeId)}`;
  }

  initTopbar("ja");
  if (typeof initHubTasks === "function") initHubTasks("ja");
  initAppTabs(null); // a transient note-entry form, not a unit to pin

  if (existingNote) {
    gacThemeId = existingNote.themeId;
    document.getElementById("gac-name").value = existingNote.header || "";
    document.getElementById("gac-nuance").value = existingNote.explanation || "";
    document.getElementById("gac-structure-template").value = existingNote.structureTemplate || "";

    gacExamples = (existingNote.examples && existingNote.examples.length
      ? existingNote.examples
      : [{}]
    ).map((ex) => ({ ...makeGacAnchorExample(), ...ex, checking: false }));

    gacStructureRule = existingNote.structureRule || "";
    gacStructureRuleAccepted = !!gacStructureRule;
    gacLastDetectedTemplate = gacStructureRuleAccepted ? (existingNote.structureTemplate || "").trim() : null;
    gacStructureConfirmed = !!existingNote.structureConfirmed;
  } else {
    gacExamples = [makeGacAnchorExample()];
    gacStructureRule = "";
    gacStructureRuleAccepted = false;
    gacLastDetectedTemplate = null;
    gacStructureConfirmed = false;
  }
  gacPendingRuleSuggestion = null;
  gacDetecting = false;
  gacDetectError = null;
  gacPracticeSessions.word = null;
  gacPracticeSessions.sentence = null;

  const anchor = gacExamples[0];
  document.getElementById("gac-example-target").value = anchor.target || "";
  document.getElementById("gac-example-english").value = anchor.translation || "";
  document.getElementById("gac-example-target").addEventListener("input", (e) => {
    anchor.target = e.target.value;
  });
  document.getElementById("gac-example-english").addEventListener("input", (e) => {
    anchor.translation = e.target.value;
  });

  document.getElementById("gac-structure-confirm").checked = gacStructureConfirmed;
  renderGacExamplesList();
  renderStructureStatus();
  updateStructureConfirmAvailability();

  const detectBtn = document.getElementById("gac-detect-btn");
  if (detectBtn) detectBtn.addEventListener("click", runStructureDetect);

  const structureTemplateInput = document.getElementById("gac-structure-template");
  if (structureTemplateInput) {
    structureTemplateInput.addEventListener("input", updateStructureConfirmAvailability);
  }

  const confirmEl = document.getElementById("gac-structure-confirm");
  if (confirmEl) {
    confirmEl.addEventListener("change", () => {
      gacStructureConfirmed = confirmEl.checked;
      updateGatedSectionsAvailability();
    });
  }

  const generateExamplesBtn = document.getElementById("gac-generate-examples-btn");
  if (generateExamplesBtn) generateExamplesBtn.addEventListener("click", handleGenerateMoreExamples);

  const wordToggle = document.getElementById("gac-word-test-toggle");
  if (wordToggle) wordToggle.addEventListener("click", () => toggleGacPractice("word"));

  const sentenceToggle = document.getElementById("gac-sentence-test-toggle");
  if (sentenceToggle) sentenceToggle.addEventListener("click", () => toggleGacPractice("sentence"));

  form.addEventListener("submit", handleGacSubmit);
}

function handleGacSubmit(e) {
  e.preventDefault();

  const name = (document.getElementById("gac-name").value || "").trim();
  const anchor = gacExamples[0];
  if (!name) {
    alert("Give this grammar point a name first.");
    return;
  }
  if (!anchor.target || !anchor.target.trim()) {
    alert("Add an example sentence in Japanese first.");
    return;
  }
  if (!gacThemeId) {
    alert("Couldn't tell which folder to save this note in.");
    return;
  }

  const cleanExamples = (arr) =>
    (arr || [])
      .filter((ex) => (ex.target || "").trim())
      .map((ex) => ({
        id: ex.id || Storage.uid(),
        target: ex.target.trim(),
        translation: (ex.translation || "").trim(),
        checked: !!ex.checked,
        corrected: ex.corrected || "",
        note: ex.note || "",
      }));

  const structureTemplate = (document.getElementById("gac-structure-template").value || "").trim();
  const nuance = (document.getElementById("gac-nuance").value || "").trim();

  const payload = {
    themeId: gacThemeId,
    header: name,
    explanation: nuance,
    examples: cleanExamples(gacExamples),
    variants: [],
    tags: [],
    structureTemplate,
    structureRule: gacStructureRuleAccepted ? gacStructureRule : "",
    structureConfirmed: gacStructureConfirmed,
    grammarLabel: null,
    grammarLabelNote: "",
  };

  if (gacEditingNoteId) {
    Storage.updateGrammarNote(gacEditingNoteId, payload);
  } else {
    Storage.addGrammarNote(payload);
  }

  window.location.href = `../grammar-theme.html?id=${encodeURIComponent(gacThemeId)}`;
}

document.addEventListener("DOMContentLoaded", initGrammarAddConjugationNotePage);
