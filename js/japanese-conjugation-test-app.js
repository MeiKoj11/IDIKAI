/*
  japanese-conjugation-test-app.js
  ---------------------------------
  japanese-conjugation-test.html — a computer-graded word-level
  conjugation drill for Japanese's four special verb forms (potential/
  passive/causative/causative-passive), sitting alongside the existing
  self-marked japanese-sentence-test.html rather than replacing it.

  Deliberately a HYBRID of the app's two existing conjugation-practice
  shapes:
  - Like the Spanish/French "Quick Conjugation Test"
    (spanish-conjugation-test-app.js), grading is 100% LOCAL — no AI/
    network call at all. JaConjugator.checkJapaneseAnswer does an exact
    (whitespace-insensitive) match against every acceptable kanji/kana
    form, same as that family's philosophy of instant, free, offline
    grading for a small closed set of forms.
  - Like the Spanish/French/Japanese "Sentence Test" batch UI
    (japanese-sentence-test-app.js), every question is generated up
    front (5/10/20, picked by the learner) and graded together in ONE
    pass at the end — not per-question feedback as you go.

  Screen flow (rebuilt to match the "Website redesign discussion" test
  mockups — conjugation-test-setup/-answering/-marked.html): setup ->
  answering (one question at a time, a focus card + dot-row you can jump
  around in, same as the mockup) -> marked (score panel + a mark-card per
  question, all still ungraded until you reach the end — the "answer
  everything first, then check it all in one go" description on the
  setup screen hasn't changed, only HOW you move through answering it).
  Viewing a previously saved test reuses the same mark-card renderer as
  the fresh "marked" screen, since the data shape is the same.

  English cue sentences are built from four fixed, hand-written
  templates (not AI) using EnglishVerbForms.getEnglishForms — the same
  local no-AI engine Spanish/French's Conjugation Test already uses for
  its own EN cue prompts. This keeps the whole feature deterministic
  and instant: no waiting on a background translation/generation call
  the way the sentence test does.

  Mistake-saving here is intentionally simpler than the sentence test's
  word-level drag-flagging: since each question IS one word already,
  a wrong question gets a single toggle ("Save to Mistakes"), off by
  default (mistakes are sometimes just typos, so nothing is ever
  auto-saved) — only ticked ones get written into the Grammar Bank's
  "Mistakes" folder when "Save selected to Mistakes" is pressed.
*/

// ---------------------------------------------------------------------
// Config screen (question count / verb pool / forms) — same verb-pool
// pattern as japanese-sentence-test-app.js (verbsFromTheme/
// selectedVerbPool), duplicated here rather than shared since the two
// pages don't share a script tag.
// ---------------------------------------------------------------------

function populateTestThemeCheckboxes() {
  const wrap = document.getElementById("tenses-test-theme-checkboxes");
  if (!wrap) return;
  wrap.innerHTML = "";
  const themes = Storage.getThemes().filter((t) => t.language === "ja");
  themes.forEach((theme) => {
    const verbCount = verbsFromTheme(theme.id).length;
    const row = document.createElement("button");
    row.type = "button";
    row.className = "source-row";
    row.dataset.themeId = theme.id;

    const box = document.createElement("span");
    box.className = "checkbox";
    row.appendChild(box);

    const text = document.createElement("span");
    text.className = "source-text";
    const name = document.createElement("span");
    name.className = "source-name";
    name.textContent = theme.name;
    text.appendChild(name);
    const hint = document.createElement("span");
    hint.className = "source-hint";
    hint.textContent = "Your saved theme";
    hint.dataset.immersionKey = "yourSavedThemeText";
    text.appendChild(hint);
    row.appendChild(text);

    const count = document.createElement("span");
    count.className = "source-count";
    count.textContent = `${verbCount} verb${verbCount === 1 ? "" : "s"}`;
    row.appendChild(count);

    row.addEventListener("click", () => {
      const isOn = box.classList.toggle("is-on");
      row.setAttribute("aria-pressed", isOn ? "true" : "false");
      updateStartMeta();
    });

    wrap.appendChild(row);
  });
}

// Verbs saved in one theme, tagged with a recognized conjugation class —
// mirrors japanese-sentence-test-app.js's verbsFromTheme exactly.
function verbsFromTheme(themeId) {
  const savedWords = typeof Storage !== "undefined" && Storage.getVerbWords ? Storage.getVerbWords("ja") : [];
  const seen = new Set();
  const verbs = [];
  savedWords.forEach((w) => {
    if (w.themeId !== themeId) return;
    const kanji = (w.targetLang || "").trim();
    if (!kanji || seen.has(kanji)) return;
    seen.add(kanji);
    verbs.push({ kanji, reading: w.furigana || "", meaning: w.english || "", class: w.verbClass, fromVocab: true });
  });
  return verbs;
}

// Unions the curated "most common verbs" list (if ticked) with every
// ticked theme's verbs, deduplicated by kanji.
function selectedVerbPool() {
  const pool = [];
  const seen = new Set();
  const addVerb = (v) => {
    if (!v || !v.kanji || seen.has(v.kanji)) return;
    seen.add(v.kanji);
    pool.push(v);
  };

  const commonBox = document.getElementById("tenses-test-common-verbs-checkbox-box");
  if (commonBox && commonBox.classList.contains("is-on")) {
    JaConjugator.COMMON_VERBS.forEach(addVerb);
  }

  const wrap = document.getElementById("tenses-test-theme-checkboxes");
  if (wrap) {
    Array.from(wrap.querySelectorAll(".source-row")).forEach((row) => {
      if (!row.querySelector(".checkbox").classList.contains("is-on")) return;
      verbsFromTheme(row.dataset.themeId).forEach(addVerb);
    });
  }

  return pool;
}

function selectedQuestionCount() {
  const wrap = document.getElementById("conj-test-question-count-pills");
  const onPill = wrap ? wrap.querySelector(".select-pill.is-on") : null;
  const n = onPill ? parseInt(onPill.dataset.count, 10) : 10;
  return [5, 10, 20].includes(n) ? n : 10;
}

function populateTestFormCheckboxes() {
  const wrap = document.getElementById("tenses-test-form-checkboxes");
  if (!wrap) return;
  wrap.innerHTML = "";
  JaConjugator.FORMS.forEach((form) => {
    const label = (JaConjugator.FORM_LABELS[form] || form).split(" —");
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "select-pill is-on";
    pill.dataset.form = form;

    const tick = document.createElement("span");
    tick.className = "tick";
    pill.appendChild(tick);
    pill.appendChild(document.createTextNode(label[0]));
    if (label[1]) {
      const kanjiEl = document.createElement("span");
      kanjiEl.className = "pill-kanji";
      kanjiEl.textContent = label[1].trim();
      pill.appendChild(kanjiEl);
    }

    pill.addEventListener("click", () => {
      pill.classList.toggle("is-on");
      updateStartMeta();
    });

    wrap.appendChild(pill);
  });
}

function selectedTestForms() {
  const wrap = document.getElementById("tenses-test-form-checkboxes");
  if (!wrap) return [];
  return Array.from(wrap.querySelectorAll(".select-pill.is-on")).map((p) => p.dataset.form);
}

function updateStartMeta() {
  const meta = document.getElementById("conj-test-start-meta");
  if (!meta) return;
  const count = selectedQuestionCount();
  const forms = selectedTestForms().length;
  meta.textContent = `${count} questions · ${forms} form${forms === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------------
// English cue sentences — four fixed local templates (no AI), chosen to
// reproduce the learner's own worked examples exactly: "I can swim."
// (potential), "It was written." (passive), "I made them eat."
// (causative), "I am made to study." (causative-passive). Built from
// EnglishVerbForms.getEnglishForms, the same local engine Spanish/
// French's Conjugation Test already uses for its own cue prompts.
// ---------------------------------------------------------------------

const CONJUGATION_CUE_TEMPLATES = {
  potential: (forms) => `I can ${forms.base}.`,
  passive: (forms) => `It was ${forms.pastParticiple}.`,
  causative: (forms) => `I made them ${forms.base}.`,
  causativePassive: (forms) => `I am made to ${forms.base}.`,
};

function buildEnglishCue(verb, form) {
  const forms = EnglishVerbForms.getEnglishForms(verb.meaning);
  if (!forms || !forms.base) return null;
  const templateFn = CONJUGATION_CUE_TEMPLATES[form];
  return templateFn ? templateFn(forms) : null;
}

// ---------------------------------------------------------------------
// Tense-matched grading. JaConjugator.acceptableAnswers/checkJapaneseAnswer
// always compute the plain NON-PAST form (書かれる, not 書かれた) — that's
// the right thing for the grammar-app.js quiz this engine was originally
// built for (which teaches the bare form in isolation), but the four cue
// templates above deliberately mix tenses to read as natural English:
// "I can swim."/"I am made to study." are non-past, but "It was
// written."/"I made them eat." are past. Grading every form against only
// the non-past answer would mark a correctly-past-tense passive/causative
// answer WRONG (and a non-past answer, which doesn't match the English
// tense at all, "right"). Every one of the four forms conjugates exactly
// like an ichidan verb ending in る, so its past tense is always that
// same stem with た swapped in for the final る (書かれる -> 書かれた,
// 食べさせる -> 食べさせた) — a safe, general string transform rather
// than anything JaConjugator itself needs to special-case.
const CUE_TENSE_IS_PAST = {
  potential: false,
  passive: true,
  causative: true,
  causativePassive: false,
};

function toPastTense(s) {
  if (!s || s.slice(-1) !== "る") return s;
  return s.slice(0, -1) + "た";
}

// The acceptable answer set for THIS test's cue sentence — past-tense
// variants for passive/causative, the plain JaConjugator form otherwise.
function acceptableAnswersForCue(verb, form) {
  const nonPast = JaConjugator.acceptableAnswers(verb, form);
  return CUE_TENSE_IS_PAST[form] ? nonPast.map(toPastTense) : nonPast;
}

function checkCueAnswer(verb, form, typed) {
  const answers = acceptableAnswersForCue(verb, form);
  const normalizedTyped = JaConjugator.normalizeJapaneseAnswer(typed);
  const correct = !!normalizedTyped && answers.some((a) => JaConjugator.normalizeJapaneseAnswer(a) === normalizedTyped);
  return { correct, answers };
}

// ---------------------------------------------------------------------
// Question-set building — picks N random {verb, form} pairs. Requires
// both a recognized conjugation class (needed for local grading) AND a
// saved reading (kanji alone isn't enough to grade against — see
// JaConjugator.conjugate, which needs both kanji and reading).
// ---------------------------------------------------------------------

function pickQuestionSpec(config, guard) {
  const safeGuard = guard || 0;
  if (safeGuard > 60) return null;
  const form = config.forms[Math.floor(Math.random() * config.forms.length)];
  const verb = config.verbs[Math.floor(Math.random() * config.verbs.length)];
  if (!verb || !verb.class || !verb.reading) return pickQuestionSpec(config, safeGuard + 1);
  // The PASSIVE cue template ("It was {past participle}.") only reads as
  // natural English for a transitive verb — "It was written"/"It was
  // lent" are fine, but "It was died"/"It was lived" aren't, even
  // though the Japanese passive form itself is real grammar either way.
  // Only skip this for verbs explicitly hand-tagged intransitive (see
  // ja-conjugator.js's COMMON_VERBS) — a Vocab Bank verb with no
  // transitive flag at all is left eligible rather than guessed at.
  if (form === "passive" && verb.transitive === false) return pickQuestionSpec(config, safeGuard + 1);
  const englishSentence = buildEnglishCue(verb, form);
  if (!englishSentence) return pickQuestionSpec(config, safeGuard + 1);
  return { form, verb, englishSentence };
}

function buildQuestionSpecs(config, count) {
  const specs = [];
  for (let i = 0; i < count; i++) {
    const spec = pickQuestionSpec(config);
    if (!spec) break;
    specs.push(spec);
  }
  return specs;
}

// ---------------------------------------------------------------------
// Session / answering flow — one question at a time (focus card + dot
// row), matching conjugation-test-answering.html. Grading itself is
// still a single pass at the very end (finishAnswering), not per
// question — only the way you move through the set changed.
// ---------------------------------------------------------------------

let conjugationTestSession = null; // { config, queue, currentIndex, checked }
let conjTestShowFurigana = true;

function startTensesTest() {
  const config = {
    verbs: selectedVerbPool(),
    forms: selectedTestForms(),
    count: selectedQuestionCount(),
  };
  if (!config.verbs.length || !config.forms.length) return;

  const specs = buildQuestionSpecs(config, config.count);
  if (!specs.length) return;

  conjugationTestSession = {
    config,
    queue: specs.map((spec) =>
      Object.assign({}, spec, { answer: "", skipped: false, correct: null, acceptableAnswers: [], saveMistake: false })
    ),
    currentIndex: 0,
    checked: false,
  };

  showScreen("answering");
  renderFocusQuestion();
}

function showScreen(name) {
  const setup = document.getElementById("tenses-test-setup");
  const savedDetail = document.getElementById("tenses-test-saved-detail");
  const answering = document.getElementById("tenses-test-answering");
  const marked = document.getElementById("tenses-test-marked");
  const pagehead = document.getElementById("conj-test-pagehead");
  const badge = document.getElementById("conj-test-stage-badge");

  setup.hidden = name !== "setup";
  savedDetail.hidden = name !== "saved-detail";
  answering.hidden = name !== "answering";
  marked.hidden = name !== "marked";

  // The focus (answering) screen has no pagehead at all in the mockup —
  // every other screen keeps it, with the badge text/color reflecting
  // which one.
  pagehead.hidden = name === "answering";
  if (badge) {
    if (name === "marked" || name === "saved-detail") {
      badge.textContent = "Marked";
      badge.dataset.immersionKey = "stageMarked";
      badge.classList.add("is-red");
    } else {
      badge.textContent = "Set up";
      badge.dataset.immersionKey = "stageSetup";
      badge.classList.remove("is-red");
    }
  }
}

function renderFocusQuestion() {
  const session = conjugationTestSession;
  if (!session) return;
  const total = session.queue.length;
  const index = session.currentIndex;
  const q = session.queue[index];

  const progressLabel = document.getElementById("conj-test-progress-label");
  if (progressLabel) progressLabel.textContent = `Question ${index + 1} of ${total}`;
  const progressFill = document.getElementById("conj-test-progress-fill");
  if (progressFill) progressFill.style.width = `${Math.round((index / total) * 100)}%`;

  const formLabel = (JaConjugator.FORM_LABELS[q.form] || q.form).split(" —");
  const targetEl = document.getElementById("conj-test-focus-target");
  if (targetEl) targetEl.textContent = formLabel[1] ? `${formLabel[0]} ${formLabel[1].trim()}` : formLabel[0];

  const promptEl = document.getElementById("conj-test-focus-prompt");
  if (promptEl) promptEl.textContent = q.englishSentence;

  const input = document.getElementById("conj-test-focus-input");
  if (input) {
    input.value = q.answer || "";
    input.disabled = false;
  }

  const revealBtn = document.getElementById("conj-test-reveal-btn");
  const strip = document.getElementById("conj-test-infinitive-strip");
  if (strip) strip.hidden = true;
  if (revealBtn && !revealBtn.dataset.wired) {
    revealBtn.dataset.wired = "true";
    revealBtn.addEventListener("click", () => {
      const current = session.queue[session.currentIndex];
      document.getElementById("conj-test-infinitive-word").textContent = current.verb.kanji;
      document.getElementById("conj-test-infinitive-kana").textContent = conjTestShowFurigana && current.verb.reading ? `(${current.verb.reading})` : "";
      document.getElementById("conj-test-infinitive-meaning").textContent = ` — ${current.verb.meaning}`;
      document.getElementById("conj-test-infinitive-strip").hidden = false;
    });
  }

  const backBtn = document.getElementById("conj-test-back-btn");
  if (backBtn) backBtn.disabled = index === 0;

  const nextBtn = document.getElementById("conj-test-next-btn");
  if (nextBtn) {
    nextBtn.textContent = index === total - 1 ? "Finish test" : "Next question";
    nextBtn.dataset.immersionKey = index === total - 1 ? "finishTestButton" : "nextQuestionButton";
  }

  renderDotRow();
  if (input) input.focus();
}

function renderDotRow() {
  const session = conjugationTestSession;
  const row = document.getElementById("conj-test-dot-row");
  if (!session || !row) return;
  row.innerHTML = "";
  session.queue.forEach((q, i) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "q-dot";
    if (i === session.currentIndex) dot.classList.add("is-current");
    else if (q.answer && q.answer.trim()) dot.classList.add("is-answered");
    else if (q.skipped) dot.classList.add("is-skipped");
    dot.textContent = String(i + 1);
    dot.addEventListener("click", () => goToQuestion(i));
    row.appendChild(dot);
  });
}

function saveCurrentAnswer() {
  const session = conjugationTestSession;
  if (!session) return;
  const input = document.getElementById("conj-test-focus-input");
  const q = session.queue[session.currentIndex];
  q.answer = input ? input.value.trim() : q.answer;
  if (q.answer) q.skipped = false;
}

function goToQuestion(index) {
  const session = conjugationTestSession;
  if (!session) return;
  saveCurrentAnswer();
  session.currentIndex = Math.max(0, Math.min(session.queue.length - 1, index));
  renderFocusQuestion();
}

function handleConjTestBack() {
  const session = conjugationTestSession;
  if (!session || session.currentIndex === 0) return;
  goToQuestion(session.currentIndex - 1);
}

function handleConjTestSkip() {
  const session = conjugationTestSession;
  if (!session) return;
  const q = session.queue[session.currentIndex];
  q.answer = "";
  q.skipped = true;
  advanceOrFinish();
}

function handleConjTestNext() {
  saveCurrentAnswer();
  advanceOrFinish();
}

function advanceOrFinish() {
  const session = conjugationTestSession;
  if (!session) return;
  if (session.currentIndex >= session.queue.length - 1) {
    finishAnswering();
  } else {
    session.currentIndex += 1;
    renderFocusQuestion();
  }
}

function handleFuriganaToggle() {
  conjTestShowFurigana = !conjTestShowFurigana;
  const btn = document.getElementById("conj-test-furigana-toggle");
  if (btn) btn.classList.toggle("is-on", conjTestShowFurigana);
}

// Grades every question in ONE local pass — no network call, no
// per-question wait — then switches to the marked screen.
function finishAnswering() {
  const session = conjugationTestSession;
  if (!session || session.checked) return;

  session.queue.forEach((q) => {
    const result = checkCueAnswer(q.verb, q.form, q.answer);
    q.correct = result.correct;
    q.acceptableAnswers = result.answers;
    const label = (JaConjugator.FORM_LABELS[q.form] || q.form).split(" —");
    q.formLabelDisplay = label[1] ? `${label[0]} ${label[1].trim()}` : label[0];
  });
  session.checked = true;

  showScreen("marked");
  renderMarkedResults(session.queue, { live: true });
}

// ---------------------------------------------------------------------
// Marked / results rendering — shared between the fresh "marked" screen
// (live: true, wired for the mistake-save toggles) and viewing a
// previously saved test (live: false, read-only).
// ---------------------------------------------------------------------

function renderMarkedResults(questions, opts) {
  const options = opts || {};
  const targetListId = options.live ? "tenses-test-question-list" : "tenses-test-saved-detail-list";
  const list = document.getElementById(targetListId);
  if (!list) return;
  list.innerHTML = "";

  const correctCount = questions.filter((q) => q.correct === true).length;
  const wrongCount = questions.filter((q) => q.correct === false).length;

  if (options.live) {
    document.getElementById("tenses-test-score").textContent = `${correctCount} / ${questions.length}`;
    const note = document.getElementById("conj-test-marked-note");
    if (note) {
      note.textContent =
        wrongCount > 0
          ? `${wrongCount} answer${wrongCount === 1 ? "" : "s"} need${wrongCount === 1 ? "s" : ""} another look — tick the ones worth keeping and they'll go into the Mistakes list for this folder.`
          : "Every answer was correct — nice work.";
    }
  } else {
    const scoreEl = document.getElementById("tenses-test-saved-detail-score");
    if (scoreEl) scoreEl.textContent = `${correctCount} / ${questions.length}`;
  }

  questions.forEach((q, i) => {
    const card = document.createElement("div");
    card.className = "mark-card" + (q.correct === false ? " is-wrong" : "");

    const top = document.createElement("div");
    top.className = "mark-top";

    const num = document.createElement("span");
    num.className = "mark-num " + (q.correct ? "is-right" : "is-wrong");
    num.textContent = String(i + 1);
    top.appendChild(num);

    const qWrap = document.createElement("div");
    qWrap.className = "mark-q";

    const verbRow = document.createElement("div");
    verbRow.className = "mark-verb-row";
    const verbEl = document.createElement("span");
    verbEl.className = "mark-verb";
    verbEl.textContent = q.englishSentence;
    verbRow.appendChild(verbEl);
    qWrap.appendChild(verbRow);

    const asked = document.createElement("div");
    asked.className = "mark-asked";
    const askedLabel = document.createElement("span");
    askedLabel.className = "label-xs";
    askedLabel.textContent = "Asked for";
    asked.appendChild(askedLabel);
    const formChip = document.createElement("span");
    formChip.className = "chip chip-accent";
    formChip.textContent = q.formLabelDisplay || q.formLabel || q.form;
    asked.appendChild(formChip);
    qWrap.appendChild(asked);

    top.appendChild(qWrap);

    const answerCol = document.createElement("div");
    answerCol.className = "mark-answer-col";

    const answerEl = document.createElement("div");
    answerEl.className = "mark-answer" + (q.correct === false ? " is-wrong" : "") + (!q.answer ? " is-blank" : "");
    answerEl.textContent = q.answer || "Skipped";
    answerCol.appendChild(answerEl);

    const verdictRow = document.createElement("div");
    verdictRow.className = "mark-verdict-row";
    const verdict = document.createElement("span");
    verdict.className = "verdict " + (q.correct ? "is-right" : "is-wrong");
    verdict.textContent = q.correct ? "Correct" : "Should be";
    verdictRow.appendChild(verdict);
    const correctEl = document.createElement("span");
    correctEl.className = "mark-correct";
    correctEl.textContent = (q.acceptableAnswers && q.acceptableAnswers[0]) || "(no recognized form)";
    verdictRow.appendChild(correctEl);
    answerCol.appendChild(verdictRow);

    top.appendChild(answerCol);
    card.appendChild(top);

    if (options.live && q.correct === false) {
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "save-mistake";
      const box = document.createElement("span");
      box.className = "save-box";
      saveBtn.appendChild(box);
      saveBtn.appendChild(document.createTextNode("Save to Mistakes"));
      saveBtn.addEventListener("click", () => {
        q.saveMistake = !q.saveMistake;
        box.classList.toggle("is-on", q.saveMistake);
        updateSaveMistakesButton();
      });
      card.appendChild(saveBtn);
    }

    list.appendChild(card);
  });

  if (options.live) {
    const saveBtn = document.getElementById("tenses-test-save-btn");
    saveBtn.hidden = false;
    saveBtn.disabled = false;
    document.getElementById("tenses-test-save-status").hidden = true;

    const saveMistakesBtn = document.getElementById("tenses-test-save-mistakes-btn");
    saveMistakesBtn.hidden = wrongCount === 0;
    saveMistakesBtn.disabled = false;
    document.getElementById("tenses-test-mistakes-save-status").hidden = true;
    updateSaveMistakesButton();
  }
}

function updateSaveMistakesButton() {
  const session = conjugationTestSession;
  const btn = document.getElementById("tenses-test-save-mistakes-btn");
  if (!session || !btn || btn.hidden) return;
  const n = session.queue.filter((q) => q.correct === false && q.saveMistake).length;
  btn.textContent = n > 0 ? `Save all ${n} to Mistakes` : "Save selected to Mistakes";
}

function backToSetup() {
  showScreen("setup");
  document.getElementById("tenses-test-question-list").innerHTML = "";
  conjugationTestSession = null;
  renderSavedTestsList();
}

// ---------------------------------------------------------------------
// Save selected mistakes — a simple per-question toggle (not the
// sentence test's word-level drag-flagging, since each question here IS
// already one word). Writes into the Grammar Bank's "Mistakes" folder,
// reusing the exact same lazily-created-folder pattern japanese-
// sentence-test-app.js uses.
// ---------------------------------------------------------------------

function findOrCreateMistakesFolder(language) {
  Storage.ensureDefaultGrammarThemes(language);
  const themes = Storage.getGrammarThemes(language);
  const existing = themes.find((t) => (t.name || "").trim().toLowerCase() === "mistakes");
  if (existing) return existing;
  return Storage.addGrammarTheme("Mistakes", language);
}

function handleSaveSelectedMistakes() {
  const session = conjugationTestSession;
  if (!session || !session.checked) return;

  const toSave = session.queue.filter((q) => q.correct === false && q.saveMistake);
  const statusEl = document.getElementById("tenses-test-mistakes-save-status");
  if (!toSave.length) {
    statusEl.textContent = "Tick the box next to any incorrect answer you want to save first.";
    statusEl.hidden = false;
    return;
  }

  const folder = findOrCreateMistakesFolder("ja");
  if (!folder) return;

  toSave.forEach((q) => {
    const formLabel = (JaConjugator.FORM_LABELS[q.form] || q.form).split(" —")[0];
    Storage.addGrammarNote({
      themeId: folder.id,
      sentence: q.acceptableAnswers[0] || q.verb.kanji,
      translation: q.englishSentence,
      pattern: `${q.verb.kanji} (${q.verb.reading}) — ${q.verb.meaning}\nYour answer: ${q.answer || "(no answer)"}\nCorrect: ${
        q.acceptableAnswers.join(" / ") || "(no recognized form)"
      }`,
      notes: "",
      tags: ["Mistake", formLabel, "Conjugation test"],
    });
  });

  statusEl.textContent = `Saved ${toSave.length} to Mistakes.`;
  statusEl.hidden = false;
  document.getElementById("tenses-test-save-mistakes-btn").disabled = true;
}

// ---------------------------------------------------------------------
// Save test — mirrors Storage.addSavedSentenceTest's shape, but into
// the separate addSavedConjugationTest collection (see storage.js) so
// this doesn't collide with the sentence test's own saved-test list.
// ---------------------------------------------------------------------

function handleSaveTest() {
  const session = conjugationTestSession;
  if (!session || !session.checked) return;

  const correct = session.queue.filter((q) => q.correct === true).length;

  Storage.addSavedConjugationTest({
    language: "ja",
    total: session.queue.length,
    correct,
    questions: session.queue.map((q) => ({
      englishSentence: q.englishSentence,
      formLabel: (JaConjugator.FORM_LABELS[q.form] || q.form).split(" —")[0],
      verbKanji: q.verb.kanji,
      verbReading: q.verb.reading,
      verbMeaning: q.verb.meaning,
      userAnswer: q.answer,
      acceptableAnswers: q.acceptableAnswers,
      correct: q.correct,
    })),
  });

  const saveBtn = document.getElementById("tenses-test-save-btn");
  saveBtn.disabled = true;
  const statusEl = document.getElementById("tenses-test-save-status");
  statusEl.textContent = "Saved.";
  statusEl.hidden = false;
}

function renderSavedTestsList() {
  const section = document.getElementById("tenses-test-saved-section");
  const list = document.getElementById("tenses-test-saved-list");
  if (!section || !list) return;

  const tests = Storage.getSavedConjugationTests("ja")
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);
  list.innerHTML = "";
  section.hidden = tests.length === 0;

  tests.forEach((test) => {
    const row = document.createElement("a");
    row.href = "#";
    row.className = "pill-row";

    const badge = document.createElement("span");
    badge.className = "score-badge" + (test.correct < test.total * 0.6 ? " is-bad" : "");
    badge.textContent = `${test.correct}/${test.total}`;
    row.appendChild(badge);

    const formSet = new Set((test.questions || []).map((q) => q.formLabel));
    const desc = document.createElement("span");
    desc.style.fontSize = "13.5px";
    desc.textContent = `${formSet.size} form${formSet.size === 1 ? "" : "s"} · ${test.total} questions`;
    row.appendChild(desc);

    const spacer = document.createElement("span");
    spacer.style.flex = "1";
    spacer.style.minWidth = "8px";
    row.appendChild(spacer);

    const dateStr = new Date(test.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const dateEl = document.createElement("span");
    dateEl.className = "meta-text";
    dateEl.style.fontSize = "12px";
    dateEl.textContent = dateStr;
    row.appendChild(dateEl);

    const arrow = document.createElement("span");
    arrow.className = "arrow";
    arrow.style.fontSize = "16px";
    arrow.textContent = "→";
    row.appendChild(arrow);

    row.addEventListener("click", (e) => {
      e.preventDefault();
      viewSavedTest(test.id);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "pill-row-x";
    deleteBtn.setAttribute("aria-label", "Delete saved test");
    deleteBtn.textContent = "×";
    deleteBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm("Delete this saved test? This can't be undone.")) return;
      Storage.deleteSavedConjugationTest(test.id);
      renderSavedTestsList();
    });
    row.appendChild(deleteBtn);

    list.appendChild(row);
  });
}

function viewSavedTest(testId) {
  const test = Storage.getSavedConjugationTest(testId);
  if (!test) return;

  showScreen("saved-detail");

  // Saved tests only ever persisted the already-split English label (no
  // raw form key, no kanji suffix — see handleSaveTest) — renderMarkedResults
  // shows whatever's in formLabelDisplay directly rather than re-deriving
  // it from JaConjugator.FORM_LABELS, so that's all that's passed through.
  const normalized = test.questions.map((q) => ({
    formLabelDisplay: q.formLabel,
    englishSentence: q.englishSentence,
    verb: { kanji: q.verbKanji, reading: q.verbReading, meaning: q.verbMeaning },
    answer: q.userAnswer,
    acceptableAnswers: q.acceptableAnswers,
    correct: q.correct,
  }));

  renderMarkedResults(normalized, { live: false });
}

function backFromSavedDetail() {
  showScreen("setup");
}

document.addEventListener("DOMContentLoaded", () => {
  const setup = document.getElementById("tenses-test-setup");
  if (!setup || !document.getElementById("tenses-test-start-btn")) return; // not this page

  const lang = "ja"; // Japanese-only page
  document.body.classList.add("lang-ja");
  initTopbar(lang);
  if (typeof initHubTasks === "function") initHubTasks(lang);
  initAppTabs({
    section: "grammar",
    language: lang,
    label: "Japanese conjugation test",
    href: "japanese-conjugation-test.html",
  });

  populateTestFormCheckboxes();
  populateTestThemeCheckboxes();
  updateStartMeta();

  document.getElementById("conj-test-question-count-pills").addEventListener("click", (e) => {
    const pill = e.target.closest(".select-pill");
    if (!pill) return;
    document
      .querySelectorAll("#conj-test-question-count-pills .select-pill")
      .forEach((p) => p.classList.remove("is-on"));
    pill.classList.add("is-on");
    updateStartMeta();
  });

  document.getElementById("tenses-test-common-verbs-row").addEventListener("click", () => {
    document.getElementById("tenses-test-common-verbs-checkbox-box").classList.toggle("is-on");
    updateStartMeta();
  });

  document.getElementById("tenses-test-forms-select-all").addEventListener("click", () => {
    document.querySelectorAll("#tenses-test-form-checkboxes .select-pill").forEach((p) => p.classList.add("is-on"));
    updateStartMeta();
  });
  document.getElementById("tenses-test-forms-clear").addEventListener("click", () => {
    document.querySelectorAll("#tenses-test-form-checkboxes .select-pill").forEach((p) => p.classList.remove("is-on"));
    updateStartMeta();
  });
  document.getElementById("tenses-test-start-btn").addEventListener("click", startTensesTest);
  document.getElementById("tenses-test-restart-btn").addEventListener("click", backToSetup);
  document.getElementById("tenses-test-save-btn").addEventListener("click", handleSaveTest);
  document.getElementById("tenses-test-save-mistakes-btn").addEventListener("click", handleSaveSelectedMistakes);
  document.getElementById("tenses-test-saved-detail-back-btn").addEventListener("click", backFromSavedDetail);

  document.getElementById("conj-test-leave-btn").addEventListener("click", backToSetup);
  document.getElementById("conj-test-furigana-toggle").addEventListener("click", handleFuriganaToggle);
  document.getElementById("conj-test-back-btn").addEventListener("click", handleConjTestBack);
  document.getElementById("conj-test-skip-btn").addEventListener("click", handleConjTestSkip);
  document.getElementById("conj-test-next-btn").addEventListener("click", handleConjTestNext);
  document.getElementById("conj-test-focus-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleConjTestNext();
    }
  });

  renderSavedTestsList();
});
