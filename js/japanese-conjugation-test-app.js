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
    (japanese-sentence-test-app.js), every question is generated and
    shown up front (5/10/20, picked by the learner), answered together,
    then checked in ONE pass — not one question at a time.

  English cue sentences are built from four fixed, hand-written
  templates (not AI) using EnglishVerbForms.getEnglishForms — the same
  local no-AI engine Spanish/French's Conjugation Test already uses for
  its own EN cue prompts. This keeps the whole feature deterministic
  and instant: no waiting on a background translation/generation call
  the way the sentence test does.

  Mistake-saving here is intentionally simpler than the sentence test's
  word-level drag-flagging: since each question IS one word already,
  a wrong question gets a single checkbox ("Save this to Mistakes"),
  unticked by default (mistakes are sometimes just typos, so nothing
  is ever auto-saved) — only checked boxes get written into the
  Grammar Bank's "Mistakes" folder when "Save selected to Mistakes" is
  pressed.
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
    const label = document.createElement("label");
    label.className = "tenses-test-checkbox";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = theme.id;
    label.appendChild(input);
    label.appendChild(document.createTextNode(` ${theme.name}`));
    wrap.appendChild(label);
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

  const commonCheckbox = document.getElementById("tenses-test-common-verbs-checkbox");
  if (commonCheckbox && commonCheckbox.checked) {
    JaConjugator.COMMON_VERBS.forEach(addVerb);
  }

  const wrap = document.getElementById("tenses-test-theme-checkboxes");
  if (wrap) {
    Array.from(wrap.querySelectorAll("input[type=checkbox]:checked")).forEach((input) => {
      verbsFromTheme(input.value).forEach(addVerb);
    });
  }

  return pool;
}

function selectedQuestionCount() {
  const checked = document.querySelector('input[name="tenses-test-question-count"]:checked');
  const n = checked ? parseInt(checked.value, 10) : 10;
  return [5, 10, 20].includes(n) ? n : 10;
}

function populateTestFormCheckboxes() {
  const wrap = document.getElementById("tenses-test-form-checkboxes");
  if (!wrap) return;
  wrap.innerHTML = "";
  JaConjugator.FORMS.forEach((form) => {
    const label = document.createElement("label");
    label.className = "tenses-test-checkbox";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = form;
    input.checked = true;
    label.appendChild(input);
    label.appendChild(document.createTextNode(` ${JaConjugator.FORM_LABELS[form].split(" —")[0]}`));
    wrap.appendChild(label);
  });
}

function selectedTestForms() {
  const wrap = document.getElementById("tenses-test-form-checkboxes");
  if (!wrap) return [];
  return Array.from(wrap.querySelectorAll("input[type=checkbox]:checked")).map((i) => i.value);
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
// Session / quiz flow.
// ---------------------------------------------------------------------

let conjugationTestSession = null; // { config, queue, cardRefs, checked }

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
      Object.assign({}, spec, { answer: "", correct: null, acceptableAnswers: [], saveMistake: false })
    ),
    cardRefs: [],
    checked: false,
  };

  document.getElementById("tenses-test-setup").hidden = true;
  document.getElementById("tenses-test-saved-detail").hidden = true;
  document.getElementById("tenses-test-quiz").hidden = false;

  const checkBtn = document.getElementById("tenses-test-check-all-btn");
  checkBtn.hidden = false;
  checkBtn.disabled = false;
  const saveBtn = document.getElementById("tenses-test-save-btn");
  saveBtn.hidden = true;
  const saveMistakesBtn = document.getElementById("tenses-test-save-mistakes-btn");
  saveMistakesBtn.hidden = true;
  document.getElementById("tenses-test-save-status").hidden = true;
  document.getElementById("tenses-test-mistakes-save-status").hidden = true;

  renderQuestionCards(conjugationTestSession);
  updateConjugationTestScore();
}

function renderQuestionCards(session) {
  const list = document.getElementById("tenses-test-question-list");
  list.innerHTML = "";
  session.cardRefs = [];
  session.queue.forEach((q, i) => {
    const built = buildQuestionCard(session, i);
    session.cardRefs[i] = built.refs;
    list.appendChild(built.card);
  });
}

function buildQuestionCard(session, index) {
  const q = session.queue[index];

  const card = document.createElement("div");
  card.className = "tenses-test-question-card";

  const number = document.createElement("p");
  number.className = "tenses-test-question-number";
  number.textContent = `Question ${index + 1}`;
  card.appendChild(number);

  const promptLabel = document.createElement("p");
  promptLabel.className = "hint";
  promptLabel.textContent = "Translate to Japanese:";
  card.appendChild(promptLabel);

  const promptEl = document.createElement("p");
  promptEl.className = "card-practice-prompt";
  promptEl.textContent = q.englishSentence;
  card.appendChild(promptEl);

  const revealBtn = document.createElement("button");
  revealBtn.type = "button";
  revealBtn.className = "secondary tiny";
  revealBtn.textContent = "Show dictionary form";
  card.appendChild(revealBtn);

  const revealEl = document.createElement("p");
  revealEl.className = "tenses-test-infinitive-reveal";
  revealEl.hidden = true;
  card.appendChild(revealEl);

  revealBtn.addEventListener("click", () => {
    revealEl.textContent = `${q.verb.kanji} (${q.verb.reading}) — ${q.verb.meaning}`;
    revealEl.hidden = false;
  });

  const input = document.createElement("input");
  input.type = "text";
  input.className = "card-practice-input";
  input.autocomplete = "off";
  input.placeholder = "Type your answer…";
  card.appendChild(input);

  // Review section — hidden until "Check all" grades every question at
  // once.
  const reviewSection = document.createElement("div");
  reviewSection.className = "tenses-test-review";
  reviewSection.hidden = true;

  const userAnswerLabel = document.createElement("p");
  userAnswerLabel.className = "hint";
  userAnswerLabel.textContent = "Your answer:";
  reviewSection.appendChild(userAnswerLabel);
  const userAnswerEl = document.createElement("p");
  userAnswerEl.className = "card-practice-answer";
  reviewSection.appendChild(userAnswerEl);

  const correctLabel = document.createElement("p");
  correctLabel.className = "hint";
  correctLabel.textContent = "Correct answer:";
  reviewSection.appendChild(correctLabel);
  const correctAnswerEl = document.createElement("p");
  correctAnswerEl.className = "card-practice-answer";
  reviewSection.appendChild(correctAnswerEl);

  const markEl = document.createElement("p");
  markEl.className = "tenses-test-saved-mark";
  reviewSection.appendChild(markEl);

  // Unticked by default — no automatic saving, since a wrong answer is
  // sometimes just a slip rather than a real gap.
  const mistakeRow = document.createElement("label");
  mistakeRow.className = "tenses-test-checkbox tenses-test-mistake-checkbox-row";
  mistakeRow.hidden = true;
  const mistakeCheckbox = document.createElement("input");
  mistakeCheckbox.type = "checkbox";
  mistakeRow.appendChild(mistakeCheckbox);
  mistakeRow.appendChild(document.createTextNode(" Save this to Mistakes"));
  reviewSection.appendChild(mistakeRow);

  card.appendChild(reviewSection);

  mistakeCheckbox.addEventListener("change", () => {
    q.saveMistake = mistakeCheckbox.checked;
  });

  return {
    card,
    refs: { input, revealEl, reviewSection, userAnswerEl, correctAnswerEl, markEl, mistakeRow, mistakeCheckbox },
  };
}

// Grades every question in ONE local pass — no network call, no
// per-question wait. Matches the sentence test's "answer everything,
// then check everything" shape, but marking here is done BY the
// computer (JaConjugator.checkJapaneseAnswer), not self-marked.
function checkAllAnswers() {
  const session = conjugationTestSession;
  if (!session || session.checked) return;

  session.queue.forEach((q, i) => {
    const refs = session.cardRefs[i];
    q.answer = refs.input.value.trim();
    const result = JaConjugator.checkJapaneseAnswer(q.verb, q.form, q.answer);
    q.correct = result.correct;
    q.acceptableAnswers = result.answers;

    refs.input.disabled = true;
    refs.userAnswerEl.textContent = q.answer || "(no answer)";
    refs.correctAnswerEl.textContent = result.answers.length ? result.answers.join(" / ") : "(no recognized form)";
    refs.markEl.textContent = result.correct ? "✓ Correct" : "✗ Incorrect";
    refs.markEl.className =
      "tenses-test-saved-mark " + (result.correct ? "tenses-test-saved-mark-correct" : "tenses-test-saved-mark-wrong");
    refs.mistakeRow.hidden = result.correct;
    refs.reviewSection.hidden = false;
  });

  session.checked = true;
  document.getElementById("tenses-test-check-all-btn").hidden = true;

  const saveBtn = document.getElementById("tenses-test-save-btn");
  saveBtn.hidden = false;
  saveBtn.disabled = false;
  document.getElementById("tenses-test-save-status").hidden = true;

  const anyWrong = session.queue.some((q) => q.correct === false);
  const saveMistakesBtn = document.getElementById("tenses-test-save-mistakes-btn");
  saveMistakesBtn.hidden = !anyWrong;
  saveMistakesBtn.disabled = false;
  document.getElementById("tenses-test-mistakes-save-status").hidden = true;

  updateConjugationTestScore();
}

function updateConjugationTestScore() {
  const scoreEl = document.getElementById("tenses-test-score");
  const session = conjugationTestSession;
  if (!scoreEl || !session) return;
  if (!session.checked) {
    scoreEl.textContent = "";
    return;
  }
  const correct = session.queue.filter((q) => q.correct === true).length;
  scoreEl.textContent = `Score: ${correct} / ${session.queue.length}`;
}

function backToSetup() {
  document.getElementById("tenses-test-setup").hidden = false;
  document.getElementById("tenses-test-saved-detail").hidden = true;
  document.getElementById("tenses-test-quiz").hidden = true;
  document.getElementById("tenses-test-question-list").innerHTML = "";
  conjugationTestSession = null;
  renderSavedTestsList();
}

// ---------------------------------------------------------------------
// Save selected mistakes — a simple per-question checkbox (not the
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
    const li = document.createElement("li");
    li.className = "tenses-test-saved-item";

    const dateStr = new Date(test.createdAt).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "secondary";
    openBtn.textContent = `${dateStr} — ${test.correct} / ${test.total}`;
    openBtn.addEventListener("click", () => viewSavedTest(test.id));
    li.appendChild(openBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "secondary tiny";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      if (!confirm("Delete this saved test? This can't be undone.")) return;
      Storage.deleteSavedConjugationTest(test.id);
      renderSavedTestsList();
    });
    li.appendChild(deleteBtn);

    list.appendChild(li);
  });
}

function viewSavedTest(testId) {
  const test = Storage.getSavedConjugationTest(testId);
  if (!test) return;

  document.getElementById("tenses-test-setup").hidden = true;
  document.getElementById("tenses-test-saved-detail").hidden = false;
  document.getElementById("tenses-test-saved-detail-score").textContent = `Score: ${test.correct} / ${test.total}`;

  const list = document.getElementById("tenses-test-saved-detail-list");
  list.innerHTML = "";

  test.questions.forEach((q, i) => {
    const card = document.createElement("div");
    card.className = "tenses-test-question-card";

    const number = document.createElement("p");
    number.className = "tenses-test-question-number";
    number.textContent = `Question ${i + 1}`;
    card.appendChild(number);

    const promptLabel = document.createElement("p");
    promptLabel.className = "hint";
    promptLabel.textContent = "Translate to Japanese:";
    card.appendChild(promptLabel);

    const promptEl = document.createElement("p");
    promptEl.className = "card-practice-prompt";
    promptEl.textContent = q.englishSentence;
    card.appendChild(promptEl);

    const formEl = document.createElement("p");
    formEl.className = "hint";
    formEl.textContent = q.formLabel;
    card.appendChild(formEl);

    const userLabel = document.createElement("p");
    userLabel.className = "hint";
    userLabel.textContent = "Your answer:";
    card.appendChild(userLabel);
    const userEl = document.createElement("p");
    userEl.className = "card-practice-answer";
    userEl.textContent = q.userAnswer || "(no answer)";
    card.appendChild(userEl);

    const correctLabel = document.createElement("p");
    correctLabel.className = "hint";
    correctLabel.textContent = "Correct answer:";
    card.appendChild(correctLabel);
    const correctEl = document.createElement("p");
    correctEl.className = "card-practice-answer";
    correctEl.textContent = (q.acceptableAnswers || []).join(" / ") || "(no recognized form)";
    card.appendChild(correctEl);

    const markEl = document.createElement("p");
    markEl.className = "tenses-test-saved-mark " + (q.correct ? "tenses-test-saved-mark-correct" : "tenses-test-saved-mark-wrong");
    markEl.textContent = q.correct ? "✓ Correct" : "✗ Incorrect";
    card.appendChild(markEl);

    list.appendChild(card);
  });
}

function backFromSavedDetail() {
  document.getElementById("tenses-test-saved-detail").hidden = true;
  document.getElementById("tenses-test-setup").hidden = false;
}

document.addEventListener("DOMContentLoaded", () => {
  const setup = document.getElementById("tenses-test-setup");
  if (!setup || !document.getElementById("tenses-test-check-all-btn")) return; // not this page

  const lang = "ja"; // Japanese-only page
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

  document.getElementById("tenses-test-forms-select-all").addEventListener("click", () => {
    document.querySelectorAll("#tenses-test-form-checkboxes input[type=checkbox]").forEach((i) => (i.checked = true));
  });
  document.getElementById("tenses-test-forms-clear").addEventListener("click", () => {
    document.querySelectorAll("#tenses-test-form-checkboxes input[type=checkbox]").forEach((i) => (i.checked = false));
  });
  document.getElementById("tenses-test-start-btn").addEventListener("click", startTensesTest);
  document.getElementById("tenses-test-restart-btn").addEventListener("click", backToSetup);
  document.getElementById("tenses-test-check-all-btn").addEventListener("click", checkAllAnswers);
  document.getElementById("tenses-test-save-btn").addEventListener("click", handleSaveTest);
  document.getElementById("tenses-test-save-mistakes-btn").addEventListener("click", handleSaveSelectedMistakes);
  document.getElementById("tenses-test-saved-detail-back-btn").addEventListener("click", backFromSavedDetail);

  renderSavedTestsList();
});
