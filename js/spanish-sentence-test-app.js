/*
  spanish-sentence-test-app.js
  ------------------------------
  spanish-sentence-test.html — "sentence mode" Conjugation Test. This is
  a SELF-MARKING test, not an AI-graded one: the learner picks a verb
  pool (most-common and/or their own saved-theme verbs) and a tense
  selection, gets a whole page of English prompt sentences up front
  (written by a fast model), types every answer with nothing checked
  along the way, then hits Submit once. Submitting reveals, per
  question, the learner's own typed answer stacked directly above an
  accurate Spanish translation (written by the strong model in the
  background while the learner was typing) — the learner ticks or
  crosses their own answer, and crossing opens a plain note box. Any
  word in a displayed sentence can still be clicked to look it up and
  add it straight to the Vocab Bank, reusing the same lookup-panel
  pattern Reading uses.
*/

// ---------------------------------------------------------------------
// Config screen (question count / verb pool / tenses).
// ---------------------------------------------------------------------

const TENSES_GRID_GROUPS = [
  {
    mood: "Indicative",
    rows: [
      { label: "Past", tenses: ["imperfect", "preterite", "pluperfect"] },
      { label: "Present", tenses: ["present", "presentPerfect"] },
      { label: "Future", tenses: ["future", "futurePerfect"] },
      { label: "Conditional", tenses: ["conditional", "conditionalPerfect"] },
    ],
  },
  {
    mood: "Subjunctive",
    rows: [
      { label: "Past", tenses: ["subjImperfect", "subjPluperfect"] },
      { label: "Present", tenses: ["subjPresent", "subjPresentPerfect"] },
      { label: "Future", tenses: ["subjFuture"] },
    ],
  },
  {
    mood: "Imperative",
    rows: [{ label: "Commands", tenses: ["imperativeAffirmative", "imperativeNegative"] }],
  },
];

function personsForTense(tense) {
  return SpanishConjugator.IMPERATIVE_TENSE_KEYS.includes(tense)
    ? SpanishConjugator.IMPERATIVE_PERSON_KEYS
    : SpanishConjugator.PERSON_KEYS;
}

function populateTestThemeCheckboxes() {
  const wrap = document.getElementById("tenses-test-theme-checkboxes");
  if (!wrap) return;
  wrap.innerHTML = "";
  const themes = Storage.getThemes().filter((t) => t.language === "es");
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

// Verbs saved in one theme — only words the dictionary lookup tagged as
// a regular ar/er/ir verb (same "safely conjugatable" gate the quick
// Conjugation Test's own vocab pool uses), deduplicated by infinitive.
function verbsFromTheme(themeId) {
  const savedWords = typeof Storage !== "undefined" && Storage.getVerbWords ? Storage.getVerbWords("es") : [];
  const seen = new Set();
  const verbs = [];
  savedWords.forEach((w) => {
    if (w.themeId !== themeId) return;
    if (w.verbType !== "ar" && w.verbType !== "er" && w.verbType !== "ir") return;
    const infinitive = (w.targetLang || "").trim().toLowerCase();
    if (!infinitive || seen.has(infinitive)) return;
    seen.add(infinitive);
    verbs.push({ infinitive, type: w.verbType, english: w.english || "", irregular: false, fromVocab: true });
  });
  return verbs;
}

// Unions the curated "most common verbs" list (if ticked) with every
// ticked theme's verbs, deduplicated by infinitive.
function selectedVerbPool() {
  const pool = [];
  const seen = new Set();
  const addVerb = (v) => {
    if (seen.has(v.infinitive)) return;
    seen.add(v.infinitive);
    pool.push(v);
  };

  const commonCheckbox = document.getElementById("tenses-test-common-verbs-checkbox");
  if (commonCheckbox && commonCheckbox.checked) {
    SpanishConjugator.VERBS.forEach(addVerb);
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
  const n = checked ? parseInt(checked.value, 10) : 20;
  return n === 10 ? 10 : 20;
}

function populateTestCheckboxes() {
  const wrap = document.getElementById("tenses-test-checkboxes");
  if (!wrap) return;
  wrap.innerHTML = "";
  TENSES_GRID_GROUPS.forEach((group) => {
    const groupWrap = document.createElement("div");
    groupWrap.className = "tenses-test-group";
    const heading = document.createElement("p");
    heading.className = "tenses-test-group-heading";
    heading.textContent = group.mood;
    groupWrap.appendChild(heading);

    group.rows.forEach((row) => {
      row.tenses.forEach((tense) => {
        const label = document.createElement("label");
        label.className = "tenses-test-checkbox";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = tense;
        input.checked = true;
        label.appendChild(input);
        label.appendChild(document.createTextNode(SpanishConjugator.ALL_TENSE_LABELS[tense] || tense));
        groupWrap.appendChild(label);
      });
    });
    wrap.appendChild(groupWrap);
  });
}

function selectedTestTenses() {
  const wrap = document.getElementById("tenses-test-checkboxes");
  if (!wrap) return [];
  return Array.from(wrap.querySelectorAll("input[type=checkbox]:checked")).map((i) => i.value);
}

// Every person can come up; yo/tú just show up a bit more often. Always
// used now (persons are no longer individually selectable) since a
// natural weighted spread reads better than strict uniform randomness.
const TEST_PERSON_WEIGHTS = { yo: 0.24, tu: 0.24, el: 0.15, nosotros: 0.13, vosotros: 0.11, ellos: 0.13 };
const TEST_IMPERATIVE_PERSON_WEIGHTS = { tu: 0.32, el: 0.22, nosotros: 0.16, vosotros: 0.12, ellos: 0.18 };

function weightedPick(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [key, w] of entries) {
    r -= w;
    if (r <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

function pickTestPerson(tense, persons, weighted) {
  const validPersons = persons.filter((p) => personsForTense(tense).includes(p));
  if (!validPersons.length) return null;
  if (!weighted) return validPersons[Math.floor(Math.random() * validPersons.length)];
  const fullWeights = SpanishConjugator.IMPERATIVE_TENSE_KEYS.includes(tense) ? TEST_IMPERATIVE_PERSON_WEIGHTS : TEST_PERSON_WEIGHTS;
  const weights = {};
  validPersons.forEach((p) => {
    if (fullWeights[p]) weights[p] = fullWeights[p];
  });
  return Object.keys(weights).length ? weightedPick(weights) : validPersons[Math.floor(Math.random() * validPersons.length)];
}

// ---------------------------------------------------------------------
// Session / question generation — two-pass, self-marking flow:
//
// 1. A FAST model writes all N English prompt sentences in one request;
//    they're shown immediately as plain answer boxes, nothing checked.
// 2. In the background, the ACCURATE model translates those exact same
//    N English sentences into Spanish — the answer key — while the
//    learner is still reading/typing, so it's very likely ready by the
//    time they hit Submit.
// 3. Submit reveals every question in review mode at once: the
//    learner's own answer stacked above the accurate translation, with
//    tick/cross buttons for the learner to self-mark. No AI grading.
// ---------------------------------------------------------------------

let sentenceTestSession = null; // { config, queue, cardRefs, translations, translationsPromise, translateItems, recentSentences, submitted }

function pickQuestionSpec(config, guard) {
  const safeGuard = guard || 0;
  if (safeGuard > 40) return null;
  const tense = config.tenses[Math.floor(Math.random() * config.tenses.length)];
  const person = pickTestPerson(tense, SpanishConjugator.PERSON_KEYS, true);
  if (!person) return pickQuestionSpec(config, safeGuard + 1);
  const verb = config.verbs[Math.floor(Math.random() * config.verbs.length)];
  return { tense, person, verb };
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

function startTensesTestWithConfig(config) {
  if (!config.verbs.length || !config.tenses.length) return;
  sentenceTestSession = {
    config,
    queue: [],
    cardRefs: [],
    translations: null,
    translationsPromise: null,
    translateItems: null,
    recentSentences: [],
    submitted: false,
  };
  document.getElementById("tenses-test-setup").hidden = true;
  document.getElementById("tenses-test-saved-detail").hidden = true;
  document.getElementById("tenses-test-retest-quiz").hidden = true;
  document.getElementById("tenses-test-quiz").hidden = true;
  document.getElementById("tenses-test-question-list").innerHTML = "";
  document.getElementById("lookup-panel").hidden = true;
  loadSentenceTestBatch(sentenceTestSession);
}

function startTensesTest() {
  startTensesTestWithConfig({
    verbs: selectedVerbPool(),
    tenses: selectedTestTenses(),
    count: selectedQuestionCount(),
  });
}

// Fetches every prompt sentence for this test run in ONE request (fast
// model), renders all the question cards immediately, then fires the
// accurate-translation batch in the background — not awaited here.
async function loadSentenceTestBatch(session) {
  if (sentenceTestSession !== session) return;

  const loadingScreen = document.getElementById("tenses-test-loading-screen");
  const errorEl = document.getElementById("tenses-test-loading-error");
  const retryBtn = document.getElementById("tenses-test-loading-retry-btn");

  document.getElementById("tenses-test-quiz").hidden = true;
  loadingScreen.hidden = false;
  errorEl.hidden = true;
  retryBtn.hidden = true;

  const specs = buildQuestionSpecs(session.config, session.config.count);
  if (!specs.length) {
    errorEl.textContent = "Couldn't build any questions from this selection — try ticking more verbs or tenses.";
    errorEl.hidden = false;
    return;
  }

  const items = specs.map((spec) => ({
    infinitive: spec.verb.infinitive,
    english: spec.verb.english,
    tenseLabel: SpanishConjugator.ALL_TENSE_LABELS[spec.tense] || spec.tense,
    personLabel: SpanishConjugator.PERSON_LABELS[spec.person] || spec.person,
  }));

  const result = await Translate.generateEnglishPracticeSentencesBatch("es", items, session.recentSentences);
  if (sentenceTestSession !== session) return;

  if (result.error || !result.sentences) {
    errorEl.textContent = `Couldn't generate your test (${result.error || "unexpected response"}).`;
    errorEl.hidden = false;
    retryBtn.hidden = false;
    return;
  }

  session.queue = specs.map((spec, i) =>
    Object.assign({}, spec, {
      englishSentence: result.sentences[i].englishSentence,
      answer: "",
      marked: null,
      translation: null,
    })
  );
  session.recentSentences = result.sentences.map((s) => s.englishSentence);

  loadingScreen.hidden = true;
  document.getElementById("tenses-test-quiz").hidden = false;
  const submitBtn = document.getElementById("tenses-test-submit-btn");
  submitBtn.hidden = false;
  submitBtn.disabled = false;

  session.cardRefs = [];
  renderQuestionCards(session);
  updateSentenceTestScore();

  session.translateItems = items.map((item, i) => Object.assign({}, item, { englishSentence: session.queue[i].englishSentence }));
  fetchTranslations(session, session.translateItems);
}

// Starts (or restarts) the background accurate-translation request and
// stashes the in-flight promise on the session so Submit can await the
// SAME request rather than firing a duplicate one.
function fetchTranslations(session, translateItems) {
  const promise = Translate.translatePracticeSentencesBatch("es", translateItems).then((result) => {
    if (sentenceTestSession === session && result.translations) {
      session.translations = result.translations;
    }
    if (session.translationsPromise === promise) session.translationsPromise = null;
    return result;
  });
  session.translationsPromise = promise;
  return promise;
}

function retryLoadSentenceTestBatch() {
  if (sentenceTestSession) loadSentenceTestBatch(sentenceTestSession);
}

function renderQuestionCards(session) {
  const list = document.getElementById("tenses-test-question-list");
  list.innerHTML = "";
  session.queue.forEach((q, i) => {
    const built = buildQuestionCard(session, i);
    session.cardRefs[i] = built.refs;
    list.appendChild(built.card);
  });
}

// Builds one self-contained question card holding BOTH its pre-submit
// answer box and its post-submit review section (the review section
// starts hidden and is revealed in place by submitSentenceTest, so the
// card never needs to be rebuilt/re-inserted and the learner's scroll
// position is preserved across Submit).
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
  promptLabel.textContent = "Translate to Spanish:";
  card.appendChild(promptLabel);

  const promptEl = document.createElement("p");
  promptEl.className = "card-practice-prompt";
  renderClickableSentence(promptEl, q.englishSentence, "en");
  card.appendChild(promptEl);

  const revealBtn = document.createElement("button");
  revealBtn.type = "button";
  revealBtn.className = "secondary tiny";
  revealBtn.textContent = "Show infinitive";
  card.appendChild(revealBtn);

  const revealEl = document.createElement("p");
  revealEl.className = "tenses-test-infinitive-reveal";
  revealEl.hidden = true;
  card.appendChild(revealEl);

  revealBtn.addEventListener("click", () => {
    revealEl.textContent = `${q.verb.infinitive} (${q.verb.english})`;
    revealEl.hidden = false;
  });

  // Pre-submit: a plain answer box — nothing is checked as you go.
  const answerSection = document.createElement("div");
  const textarea = document.createElement("textarea");
  textarea.className = "card-practice-input";
  textarea.rows = 2;
  textarea.placeholder = "Type your Spanish translation…";
  answerSection.appendChild(textarea);
  card.appendChild(answerSection);

  // Post-submit review — hidden until Submit reveals it.
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

  const correctAnswerLabel = document.createElement("p");
  correctAnswerLabel.className = "hint";
  correctAnswerLabel.textContent = "Accurate translation:";
  reviewSection.appendChild(correctAnswerLabel);

  const correctAnswerEl = document.createElement("p");
  correctAnswerEl.className = "card-practice-answer";
  reviewSection.appendChild(correctAnswerEl);

  const judgeRow = document.createElement("div");
  judgeRow.className = "card-practice-judge-row tenses-test-mark-row";
  const tickBtn = document.createElement("button");
  tickBtn.type = "button";
  tickBtn.className = "tenses-test-mark-btn tenses-test-mark-correct";
  tickBtn.textContent = "✓ I got it right";
  const crossBtn = document.createElement("button");
  crossBtn.type = "button";
  crossBtn.className = "tenses-test-mark-btn tenses-test-mark-wrong";
  crossBtn.textContent = "✗ I got it wrong";
  judgeRow.appendChild(tickBtn);
  judgeRow.appendChild(crossBtn);
  reviewSection.appendChild(judgeRow);

  // Only shown once the learner crosses their own answer — the words in
  // both sentences above become clickable so the specific mistake(s)
  // can be flagged and saved to the Grammar Bank's "Mistakes" folder
  // (see renderReviewSentences/handleMistakeWordClick), rather than one
  // big free-text box.
  const mistakeHint = document.createElement("p");
  mistakeHint.className = "hint tenses-test-mistake-hint";
  mistakeHint.textContent = "Click the specific word(s) that were wrong, above, to flag and save a note.";
  mistakeHint.hidden = true;
  reviewSection.appendChild(mistakeHint);

  card.appendChild(reviewSection);

  tickBtn.addEventListener("click", () => markQuestionAnswer(session, index, true));
  crossBtn.addEventListener("click", () => markQuestionAnswer(session, index, false));

  return {
    card,
    refs: { textarea, answerSection, reviewSection, userAnswerEl, correctAnswerEl, tickBtn, crossBtn, mistakeHint },
  };
}

// Splits on whitespace (keeping it, like reading-app.js's tokenizer) and
// strips leading/trailing punctuation per token so "clave." looks up
// "clave" — \p{L} is any Unicode letter, so accented letters count.
function tokenizeSentence(text) {
  return (text || "").split(/(\s+)/);
}
function stripPunctuation(token) {
  return token.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
}

function renderClickableSentence(container, sentence, lang) {
  container.innerHTML = "";
  tokenizeSentence(sentence).forEach((token) => {
    const core = stripPunctuation(token);
    if (!token || !core) {
      container.appendChild(document.createTextNode(token));
      return;
    }
    const span = document.createElement("span");
    span.className = "clickable-word";
    span.textContent = token;
    span.dataset.word = core;
    span.addEventListener("click", () => handleSentenceWordClick(span, core, lang));
    container.appendChild(span);
  });
}

// Same tokenizing/word-span approach as renderClickableSentence, but for
// a question marked wrong: clicking a word flags it (blue) and opens
// the mistake-note panel instead of the vocab lookup panel — see
// handleMistakeWordClick. `side` is "user" (the learner's own typed
// answer) or "accurate" (the answer key), just carried along so a saved
// mistake note can record which sentence the flagged word came from.
function renderMistakeClickableSentence(container, sentence, lang, session, index, side) {
  container.innerHTML = "";
  tokenizeSentence(sentence).forEach((token) => {
    const core = stripPunctuation(token);
    if (!token || !core) {
      container.appendChild(document.createTextNode(token));
      return;
    }
    const span = document.createElement("span");
    span.className = "clickable-word mistake-clickable-word";
    span.textContent = token;
    span.dataset.word = core;
    span.addEventListener("click", () => handleMistakeWordClick(span, core, session, index, side));
    container.appendChild(span);
  });
}

// Renders both stacked sentences in a review card, switching mode based
// on how the question is currently self-marked: ordinary vocab-lookup
// words when correct/unmarked, mistake-flagging words (both sentences)
// once crossed. Re-run whenever the mark flips between wrong/not-wrong
// (see markQuestionAnswer) so the right click behavior is always live.
function renderReviewSentences(session, index) {
  const q = session.queue[index];
  const refs = session.cardRefs[index];
  const wrong = q.marked === false;

  refs.userAnswerEl.innerHTML = "";
  if (!q.answer) {
    refs.userAnswerEl.textContent = "(no answer)";
  } else if (wrong) {
    renderMistakeClickableSentence(refs.userAnswerEl, q.answer, "es", session, index, "user");
  } else {
    refs.userAnswerEl.textContent = q.answer;
  }

  refs.correctAnswerEl.innerHTML = "";
  if (wrong) {
    renderMistakeClickableSentence(refs.correctAnswerEl, q.translation.targetSentence, "es", session, index, "accurate");
  } else {
    renderClickableSentence(refs.correctAnswerEl, q.translation.targetSentence, "es");
  }
}

// Before Submit there's nothing to score yet; after Submit it reflects
// however many questions the learner has self-marked so far.
function updateSentenceTestScore() {
  const scoreEl = document.getElementById("tenses-test-score");
  if (!scoreEl || !sentenceTestSession) return;
  const session = sentenceTestSession;
  if (!session.submitted) {
    scoreEl.textContent = "";
    return;
  }
  const marked = session.queue.filter((q) => q.marked === true || q.marked === false);
  if (!marked.length) {
    scoreEl.textContent = "Mark each answer below ↓";
    return;
  }
  const correct = marked.filter((q) => q.marked === true).length;
  scoreEl.textContent = `Score: ${correct} / ${session.queue.length}`;
}

// Self-marking click handler — no AI involved. Re-clicking either
// button re-marks the question (toggle-safe, since the score is always
// recomputed from session.queue rather than tracked incrementally).
// Only re-renders the sentences (which resets any unsaved word flags)
// when wrong-vs-not-wrong actually changes, so clicking the same button
// twice in a row is a no-op rather than clobbering flagged words.
function markQuestionAnswer(session, index, isCorrect) {
  if (sentenceTestSession !== session) return;
  const q = session.queue[index];
  const refs = session.cardRefs[index];
  const wasWrong = q.marked === false;
  q.marked = isCorrect;
  refs.tickBtn.classList.toggle("selected", isCorrect === true);
  refs.crossBtn.classList.toggle("selected", isCorrect === false);
  const nowWrong = isCorrect === false;
  refs.mistakeHint.hidden = !nowWrong;
  if (nowWrong !== wasWrong) renderReviewSentences(session, index);
  updateSentenceTestScore();
}

// The single Submit action: locks in every typed answer, waits for the
// accurate-translation background pass if it isn't done yet, then
// reveals every card's review section at once. On failure the typed
// answers are preserved (still sitting in each textarea) so the learner
// can just hit Submit again rather than losing their work.
async function submitSentenceTest() {
  const session = sentenceTestSession;
  if (!session || !session.queue.length || session.submitted) return;

  const submitBtn = document.getElementById("tenses-test-submit-btn");
  const errorEl = document.getElementById("tenses-test-submit-error");
  errorEl.hidden = true;

  session.queue.forEach((q, i) => {
    q.answer = session.cardRefs[i].textarea.value.trim();
  });

  let translations = session.translations;
  if (!translations) {
    const defaultLabel = submitBtn.dataset.defaultLabel || submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Finishing up your answer key…";
    const result = session.translationsPromise
      ? await session.translationsPromise
      : await fetchTranslations(session, session.translateItems);
    if (sentenceTestSession !== session) return;
    submitBtn.disabled = false;
    submitBtn.textContent = defaultLabel;
    translations = session.translations || (result && result.translations) || null;
  }

  if (!translations) {
    errorEl.textContent = "Couldn't finish preparing the answer key — your answers are saved, try submitting again.";
    errorEl.hidden = false;
    return;
  }

  session.submitted = true;
  session.translations = translations;
  submitBtn.hidden = true;

  session.queue.forEach((q, i) => {
    q.translation = translations[i];
    const refs = session.cardRefs[i];
    refs.answerSection.hidden = true;
    renderReviewSentences(session, i);
    refs.reviewSection.hidden = false;
  });

  const saveBtn = document.getElementById("tenses-test-save-btn");
  saveBtn.hidden = false;
  saveBtn.disabled = false;
  const saveStatus = document.getElementById("tenses-test-save-status");
  saveStatus.hidden = true;

  updateSentenceTestScore();
}

function backToSetup() {
  document.getElementById("tenses-test-setup").hidden = false;
  document.getElementById("tenses-test-saved-detail").hidden = true;
  document.getElementById("tenses-test-retest-quiz").hidden = true;
  document.getElementById("tenses-test-quiz").hidden = true;
  document.getElementById("tenses-test-loading-screen").hidden = true;
  document.getElementById("tenses-test-question-list").innerHTML = "";
  document.getElementById("tenses-test-submit-error").hidden = true;
  const submitBtn = document.getElementById("tenses-test-submit-btn");
  submitBtn.hidden = false;
  submitBtn.disabled = false;
  submitBtn.textContent = submitBtn.dataset.defaultLabel || submitBtn.textContent;
  const saveBtn = document.getElementById("tenses-test-save-btn");
  saveBtn.hidden = true;
  saveBtn.disabled = false;
  document.getElementById("tenses-test-save-status").hidden = true;
  document.getElementById("lookup-panel").hidden = true;
  closeMistakePanel();
  retestSession = null;
  sentenceTestSession = null;
  renderSavedTestsList();
  renderRetestSection();
}

// ---------------------------------------------------------------------
// Mistakes: click-a-word self-marking review, wrong-marked questions
// only. Flagging a word (blue) and saving stores a lightweight note
// directly in the Grammar Bank's existing "Tenses and verb
// conjugations" folder (tagged "Mistake" so it's easy to spot there) —
// reuses the same free-form grammar-note shape the original
// single-sentence notes use (sentence/translation/pattern/tags/notes),
// so it gets the existing note card's expand/collapse, Edit, Delete,
// and "+ Personal note" editing for free with no new UI to build there.
//
// The same panel also offers a second, separate save: when the mistake
// was purely a conjugation ending (not a vocab/tense-choice error), the
// "Conjugation error" mini-form saves just the correct target-language
// form + its English translation as a small flashcard (see
// Storage.addConjugationMistake) — quiz data only, not a grammar note —
// which feeds the "Retest your mistakes" EN->TL quiz below.
// ---------------------------------------------------------------------

let activeMistakeWord = null; // { span, word, session, index, side }

// A dedicated "Mistakes" folder, separate from the built-in "Tenses and
// verb conjugations" folder (which otherwise ends up a mix of the
// always-present conjugation structure cards and one-off mistake
// notes). Created lazily on the first mistake save rather than seeded
// up front — ensureDefaultGrammarThemes only seeds once per language,
// so a language that's already been opened before this folder existed
// wouldn't get it retroactively if it were added to that seed list.
function findOrCreateMistakesFolder(language) {
  Storage.ensureDefaultGrammarThemes(language);
  const themes = Storage.getGrammarThemes(language);
  const existing = themes.find((t) => (t.name || "").trim().toLowerCase() === "mistakes");
  if (existing) return existing;
  return Storage.addGrammarTheme("Mistakes", language);
}

function handleMistakeWordClick(span, word, session, index, side) {
  if (sentenceTestSession !== session) return;

  // Clicking the word whose panel is already open just closes it again
  // (the blue flag stays — click it again to reopen/edit/save/remove).
  if (activeMistakeWord && activeMistakeWord.span === span) {
    closeMistakePanel();
    return;
  }

  span.classList.add("mistake-word-flagged");
  activeMistakeWord = { span, word, session, index, side };

  const panel = document.getElementById("mistake-panel");
  panel.hidden = false;
  document.getElementById("mistake-panel-word").textContent = word;
  document.getElementById("mistake-panel-note").value = span.dataset.mistakeNote || "";
  // The clicked word is very often already the correct form (e.g. a
  // word clicked in the accurate translation) — prefill it as a
  // starting point for the conjugation-error form, easy to overwrite.
  document.getElementById("mistake-panel-correct-form").value = word;
  document.getElementById("mistake-panel-translation").value = "";
  document.getElementById("mistake-panel-conjugation-status").hidden = true;
}

function closeMistakePanel() {
  activeMistakeWord = null;
  const panel = document.getElementById("mistake-panel");
  if (panel) panel.hidden = true;
}

function handleMistakePanelSave() {
  if (!activeMistakeWord) return;
  const { span, word, session, index, side } = activeMistakeWord;
  if (sentenceTestSession !== session) return;

  const q = session.queue[index];
  const note = document.getElementById("mistake-panel-note").value.trim();
  span.dataset.mistakeNote = note;

  const folder = findOrCreateMistakesFolder("es");
  if (!folder) return; // shouldn't happen, but don't crash if it somehow does
  const tenseLabel = SpanishConjugator.ALL_TENSE_LABELS[q.tense] || q.tense;
  const saved = Storage.addGrammarNote({
    themeId: folder.id,
    sentence: word,
    translation: q.translation ? `Accurate: ${q.translation.targetSentence}` : "",
    pattern: `English: ${q.englishSentence}\nYour answer: ${q.answer || "(no answer)"}`,
    notes: note,
    tags: ["Mistake", tenseLabel, side === "user" ? "Your answer" : "Accurate answer"],
  });

  span.dataset.mistakeNoteId = saved.id;
  span.classList.add("mistake-word-saved");
  closeMistakePanel();
}

function handleMistakePanelRemove() {
  if (!activeMistakeWord) return;
  const { span } = activeMistakeWord;
  if (span.dataset.mistakeNoteId) {
    Storage.deleteGrammarNote(span.dataset.mistakeNoteId);
    delete span.dataset.mistakeNoteId;
  }
  span.classList.remove("mistake-word-flagged", "mistake-word-saved");
  delete span.dataset.mistakeNote;
  closeMistakePanel();
}

// The "Conjugation error" mini-form — a pure right-tense-wrong-ending
// slip, saved as quiz data only (see the block comment above), separate
// from the free-form note handleMistakePanelSave writes.
function handleMistakePanelSaveConjugation() {
  if (!activeMistakeWord) return;
  const { session, index } = activeMistakeWord;
  if (sentenceTestSession !== session) return;

  const q = session.queue[index];
  const correctFormInput = document.getElementById("mistake-panel-correct-form");
  const translationInput = document.getElementById("mistake-panel-translation");
  const targetForm = correctFormInput.value.trim();
  const translation = translationInput.value.trim();
  const statusEl = document.getElementById("mistake-panel-conjugation-status");
  if (!targetForm || !translation) {
    statusEl.textContent = "Fill in both the correct form and its translation.";
    statusEl.hidden = false;
    return;
  }

  Storage.addConjugationMistake({
    language: "es",
    targetForm,
    translation,
    infinitive: q.verb.infinitive,
    tenseLabel: SpanishConjugator.ALL_TENSE_LABELS[q.tense] || q.tense,
    personLabel: SpanishConjugator.PERSON_LABELS[q.person] || q.person,
  });

  statusEl.textContent = "Saved to Retest quiz.";
  statusEl.hidden = false;
  renderRetestSection();
}

// ---------------------------------------------------------------------
// Save test — entirely optional (see the "Save this test" button, only
// shown once submitted). A saved test is read-only: the question,
// the learner's own typed answer, the accurate translation, and
// whatever tick/cross the learner gave it, plus the overall score.
// ---------------------------------------------------------------------

function handleSaveTest() {
  const session = sentenceTestSession;
  if (!session || !session.submitted) return;

  const marked = session.queue.filter((q) => q.marked === true || q.marked === false);
  const correct = marked.filter((q) => q.marked === true).length;

  Storage.addSavedSentenceTest({
    language: "es",
    total: session.queue.length,
    correct,
    questions: session.queue.map((q) => ({
      englishSentence: q.englishSentence,
      userAnswer: q.answer,
      targetSentence: q.translation ? q.translation.targetSentence : "",
      marked: q.marked,
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

  const tests = Storage.getSavedSentenceTests("es")
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
      Storage.deleteSavedSentenceTest(test.id);
      renderSavedTestsList();
    });
    li.appendChild(deleteBtn);

    list.appendChild(li);
  });
}

// Read-only review of a saved test: just the question, the learner's
// own answer, the accurate translation, and their tick/cross — no word
// lookups, no re-marking, nothing to edit.
function viewSavedTest(testId) {
  const test = Storage.getSavedSentenceTest(testId);
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
    promptLabel.textContent = "Translate to Spanish:";
    card.appendChild(promptLabel);

    const promptEl = document.createElement("p");
    promptEl.className = "card-practice-prompt";
    promptEl.textContent = q.englishSentence;
    card.appendChild(promptEl);

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
    correctLabel.textContent = "Accurate translation:";
    card.appendChild(correctLabel);
    const correctEl = document.createElement("p");
    correctEl.className = "card-practice-answer";
    correctEl.textContent = q.targetSentence;
    card.appendChild(correctEl);

    const markEl = document.createElement("p");
    markEl.className =
      "tenses-test-saved-mark " +
      (q.marked === true ? "tenses-test-saved-mark-correct" : q.marked === false ? "tenses-test-saved-mark-wrong" : "");
    markEl.textContent = q.marked === true ? "✓ Correct" : q.marked === false ? "✗ Wrong" : "— Not marked";
    card.appendChild(markEl);

    list.appendChild(card);
  });
}

function backFromSavedDetail() {
  document.getElementById("tenses-test-saved-detail").hidden = true;
  document.getElementById("tenses-test-setup").hidden = false;
}

// ---------------------------------------------------------------------
// Retest your mistakes — a small EN->TL flashcard quiz over just the
// conjugation-error entries saved from the mistake panel (see
// handleMistakePanelSaveConjugation). Same self-marking shape as the
// Vocab Bank's own quiz (Show answer, then Got it/Review again), not
// AI-graded. Getting a card right removes it from the saved pool
// entirely — the whole point of "retest your mistakes" is to shrink
// this list as each form gets mastered, not to keep it around forever.
// ---------------------------------------------------------------------

let retestSession = null; // { queue, current }

function renderRetestSection() {
  const section = document.getElementById("tenses-test-retest-section");
  const countEl = document.getElementById("tenses-test-retest-count");
  if (!section) return;
  const mistakes = Storage.getConjugationMistakes("es");
  section.hidden = mistakes.length === 0;
  if (countEl) {
    countEl.textContent = `${mistakes.length} saved mistake${mistakes.length === 1 ? "" : "s"} to retest.`;
  }
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function startRetest() {
  const mistakes = Storage.getConjugationMistakes("es");
  if (!mistakes.length) return;
  retestSession = { queue: shuffleArray(mistakes.slice()), current: null };

  document.getElementById("tenses-test-setup").hidden = true;
  document.getElementById("tenses-test-retest-quiz").hidden = false;
  document.getElementById("tenses-test-retest-done").hidden = true;
  document.getElementById("tenses-test-retest-card").hidden = false;
  showNextRetestCard();
}

function showNextRetestCard() {
  const session = retestSession;
  if (!session) return;

  if (!session.queue.length) {
    document.getElementById("tenses-test-retest-card").hidden = true;
    document.getElementById("tenses-test-retest-done").hidden = false;
    return;
  }

  session.current = session.queue.shift();
  document.getElementById("tenses-test-retest-prompt").textContent = session.current.translation;
  const answerEl = document.getElementById("tenses-test-retest-answer");
  answerEl.textContent = session.current.targetForm;
  answerEl.hidden = true;
  document.getElementById("tenses-test-retest-buttons").hidden = true;
  document.getElementById("tenses-test-retest-show-btn").hidden = false;
}

function handleRetestShowAnswer() {
  document.getElementById("tenses-test-retest-answer").hidden = false;
  document.getElementById("tenses-test-retest-buttons").hidden = false;
  document.getElementById("tenses-test-retest-show-btn").hidden = true;
}

function handleRetestGotIt() {
  if (!retestSession || !retestSession.current) return;
  Storage.deleteConjugationMistake(retestSession.current.id);
  showNextRetestCard();
}

function handleRetestAgain() {
  if (!retestSession || !retestSession.current) return;
  const insertAt = Math.min(3, retestSession.queue.length);
  retestSession.queue.splice(insertAt, 0, retestSession.current);
  showNextRetestCard();
}

function backFromRetest() {
  retestSession = null;
  document.getElementById("tenses-test-retest-quiz").hidden = true;
  document.getElementById("tenses-test-setup").hidden = false;
  renderRetestSection();
}

// ---------------------------------------------------------------------
// Right-side "Add vocab" drawer — a quick manual entry (no AI call) for
// jotting down any word noticed as unfamiliar while reviewing the test,
// independent of the word-click mistake-flagging flow above.
// ---------------------------------------------------------------------

function toggleVocabDrawer(forceOpen) {
  const drawer = document.getElementById("vocab-drawer");
  if (!drawer) return;
  const open = forceOpen !== undefined ? forceOpen : drawer.hidden;
  drawer.hidden = !open;
  if (open) {
    populateVocabDrawerThemeOptions();
    document.getElementById("vocab-drawer-status").hidden = true;
  }
}

function populateVocabDrawerThemeOptions(selectId) {
  const select = document.getElementById("vocab-drawer-theme-select");
  if (!select) return;
  select.innerHTML = "";

  const themes = Storage.getThemes().filter((t) => t.language === "es");
  themes.forEach((theme) => {
    const opt = document.createElement("option");
    opt.value = theme.id;
    opt.textContent = theme.name;
    select.appendChild(opt);
  });

  const newOpt = document.createElement("option");
  newOpt.value = NEW_THEME_VALUE;
  newOpt.textContent = "+ Create new theme…";
  newOpt.dataset.immersionKey = "createNewThemeOption";
  select.appendChild(newOpt);

  if (selectId) {
    select.value = selectId;
  } else if (themes.length === 0) {
    select.value = NEW_THEME_VALUE;
  }
}

function createVocabDrawerTheme() {
  const name = prompt("Name for the new theme:");
  const existingThemes = Storage.getThemes().filter((t) => t.language === "es");
  if (!name || !name.trim()) {
    populateVocabDrawerThemeOptions(existingThemes.length ? existingThemes[0].id : null);
    return;
  }
  const theme = Storage.addTheme(name.trim(), "es");
  populateVocabDrawerThemeOptions(theme.id);
}

function handleVocabDrawerThemeSelectChange(e) {
  if (e.target.value !== NEW_THEME_VALUE) return;
  createVocabDrawerTheme();
}

function handleVocabDrawerSave() {
  const englishInput = document.getElementById("vocab-drawer-english");
  const spanishInput = document.getElementById("vocab-drawer-spanish");
  const select = document.getElementById("vocab-drawer-theme-select");
  const statusEl = document.getElementById("vocab-drawer-status");

  const english = englishInput.value.trim();
  const targetLang = spanishInput.value.trim();
  if (!english || !targetLang) {
    statusEl.textContent = "Fill in both English and Spanish.";
    statusEl.hidden = false;
    return;
  }

  let themeId = select.value;
  if (!themeId || themeId === NEW_THEME_VALUE) {
    const name = prompt("Name for the new theme:");
    if (!name || !name.trim()) return;
    const theme = Storage.addTheme(name.trim(), "es");
    populateVocabDrawerThemeOptions(theme.id);
    themeId = theme.id;
  }

  const saved = Storage.addWordIfNotDuplicate(themeId, { english, targetLang, furigana: "", notes: "" });
  statusEl.textContent = saved ? `${targetLang} (${english}) — added.` : `${targetLang} (${english}) — already in your deck.`;
  statusEl.hidden = false;
  if (saved) {
    englishInput.value = "";
    spanishInput.value = "";
    englishInput.focus();
  }
}

// ---------------------------------------------------------------------
// Word-click lookup + Add-to-Vocab — mirrors reading-app.js's
// .lookup-panel pattern. A clicked word is either the English prompt
// (pre-submit) or the accurate Spanish translation (post-submit), so
// the lookup direction and which field becomes "targetLang" vs
// "english" when saving depend on which language the word was in.
// ---------------------------------------------------------------------

const NEW_THEME_VALUE = "__new_theme__";
let selectedSentenceWord = null;

function renderSentenceThemeOptions(selectId) {
  const select = document.getElementById("add-to-theme-select");
  if (!select) return;
  select.innerHTML = "";

  const themes = Storage.getThemes().filter((t) => t.language === "es");
  themes.forEach((theme) => {
    const opt = document.createElement("option");
    opt.value = theme.id;
    opt.textContent = theme.name;
    select.appendChild(opt);
  });

  const newOpt = document.createElement("option");
  newOpt.value = NEW_THEME_VALUE;
  newOpt.textContent = "+ Create new theme…";
  newOpt.dataset.immersionKey = "createNewThemeOption";
  select.appendChild(newOpt);

  if (selectId) {
    select.value = selectId;
  } else if (themes.length === 0) {
    select.value = NEW_THEME_VALUE;
  }
}

function createSentenceLookupTheme() {
  const name = prompt("Name for the new theme:");
  const existingThemes = Storage.getThemes().filter((t) => t.language === "es");
  if (!name || !name.trim()) {
    renderSentenceThemeOptions(existingThemes.length ? existingThemes[0].id : null);
    return;
  }
  const theme = Storage.addTheme(name.trim(), "es");
  renderSentenceThemeOptions(theme.id);
}

function handleSentenceThemeSelectChange(e) {
  if (e.target.value !== NEW_THEME_VALUE) return;
  createSentenceLookupTheme();
}

function handleAddLookedUpSentenceWord() {
  const select = document.getElementById("add-to-theme-select");
  let themeId = select.value;
  if (!themeId || themeId === NEW_THEME_VALUE) {
    const name = prompt("Name for the new theme:");
    if (!name || !name.trim()) return;
    const theme = Storage.addTheme(name.trim(), "es");
    renderSentenceThemeOptions(theme.id);
    themeId = theme.id;
  }

  const addBtn = document.getElementById("add-looked-up-word");
  const english = addBtn.dataset.english;
  const targetLang = addBtn.dataset.targetLang;
  const saved = Storage.addWordIfNotDuplicate(themeId, {
    english,
    targetLang,
    furigana: "",
    notes: "",
  });

  // Always confirm with the Spanish word (targetLang) — this is a
  // Spanish vocab theme, so that's the word that actually matters here.
  // Showing "english" instead (the word as originally clicked, when the
  // click was on an English prompt word) made it look like the save had
  // reverted to English, even though the correct Spanish word was what
  // actually got stored.
  const resultEl = document.getElementById("lookup-result");
  if (saved) {
    resultEl.textContent = `${targetLang} (${english}) — added.`;
    addBtn.hidden = true;
  } else {
    resultEl.textContent = `${targetLang} (${english}) — already in your deck.`;
  }
}

// `lang` is whichever language the clicked word actually appeared in
// ("es" or "en") — the sentence shown can be either, depending on
// whether the card is still pre-submit (English) or in review (Spanish).
async function handleSentenceWordClick(span, word, lang) {
  document.querySelectorAll(".clickable-word.selected").forEach((el) => el.classList.remove("selected"));
  span.classList.add("selected");
  selectedSentenceWord = word;

  const panel = document.getElementById("lookup-panel");
  panel.hidden = false;
  document.getElementById("lookup-word").textContent = word;
  const resultEl = document.getElementById("lookup-result");
  resultEl.textContent = "Looking up…";
  document.getElementById("lookup-grammar").textContent = "";
  document.getElementById("add-looked-up-word").hidden = true;
  renderSentenceThemeOptions();

  const toLang = lang === "en" ? "es" : "en";
  const result = await Translate.lookupTranslation(word, lang, toLang);
  if (selectedSentenceWord !== word) return; // a different word was clicked meanwhile
  if (!result || !result.translation) {
    resultEl.textContent = "No translation found.";
    return;
  }

  resultEl.textContent = result.translation;
  const addBtn = document.getElementById("add-looked-up-word");
  addBtn.hidden = false;
  if (lang === "es") {
    addBtn.dataset.targetLang = word;
    addBtn.dataset.english = result.translation;
  } else {
    addBtn.dataset.targetLang = result.translation;
    addBtn.dataset.english = word;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const setup = document.getElementById("tenses-test-setup");
  if (!setup || !document.getElementById("tenses-test-question-list")) return; // not this page

  const lang = "es"; // Spanish-only page
  initTopbar(lang);
  if (typeof initHubTasks === "function") initHubTasks(lang);
  initAppTabs({
    section: "grammar",
    language: lang,
    label: "Spanish sentence test",
    href: "spanish-sentence-test.html",
  });

  populateTestCheckboxes();
  populateTestThemeCheckboxes();

  const submitBtn = document.getElementById("tenses-test-submit-btn");
  if (submitBtn) submitBtn.dataset.defaultLabel = submitBtn.textContent;

  document.getElementById("tenses-test-select-all").addEventListener("click", () => {
    document.querySelectorAll("#tenses-test-checkboxes input[type=checkbox]").forEach((i) => (i.checked = true));
  });
  document.getElementById("tenses-test-clear").addEventListener("click", () => {
    document.querySelectorAll("#tenses-test-checkboxes input[type=checkbox]").forEach((i) => (i.checked = false));
  });
  document.getElementById("tenses-test-start-btn").addEventListener("click", startTensesTest);
  document.getElementById("tenses-test-restart-btn").addEventListener("click", backToSetup);
  document.getElementById("tenses-test-loading-cancel-btn").addEventListener("click", backToSetup);
  document.getElementById("tenses-test-loading-retry-btn").addEventListener("click", retryLoadSentenceTestBatch);
  if (submitBtn) submitBtn.addEventListener("click", submitSentenceTest);

  const saveBtn = document.getElementById("tenses-test-save-btn");
  if (saveBtn) saveBtn.addEventListener("click", handleSaveTest);
  const savedDetailBackBtn = document.getElementById("tenses-test-saved-detail-back-btn");
  if (savedDetailBackBtn) savedDetailBackBtn.addEventListener("click", backFromSavedDetail);
  const mistakeSaveBtn = document.getElementById("mistake-panel-save-btn");
  if (mistakeSaveBtn) mistakeSaveBtn.addEventListener("click", handleMistakePanelSave);
  const mistakeRemoveBtn = document.getElementById("mistake-panel-remove-btn");
  if (mistakeRemoveBtn) mistakeRemoveBtn.addEventListener("click", handleMistakePanelRemove);
  const mistakeSaveConjugationBtn = document.getElementById("mistake-panel-save-conjugation-btn");
  if (mistakeSaveConjugationBtn) mistakeSaveConjugationBtn.addEventListener("click", handleMistakePanelSaveConjugation);
  renderSavedTestsList();

  const retestStartBtn = document.getElementById("tenses-test-retest-start-btn");
  if (retestStartBtn) retestStartBtn.addEventListener("click", startRetest);
  const retestBackBtn = document.getElementById("tenses-test-retest-back-btn");
  if (retestBackBtn) retestBackBtn.addEventListener("click", backFromRetest);
  const retestShowBtn = document.getElementById("tenses-test-retest-show-btn");
  if (retestShowBtn) retestShowBtn.addEventListener("click", handleRetestShowAnswer);
  const retestGotItBtn = document.getElementById("tenses-test-retest-got-it-btn");
  if (retestGotItBtn) retestGotItBtn.addEventListener("click", handleRetestGotIt);
  const retestAgainBtn = document.getElementById("tenses-test-retest-again-btn");
  if (retestAgainBtn) retestAgainBtn.addEventListener("click", handleRetestAgain);
  renderRetestSection();

  const vocabDrawerToggle = document.getElementById("vocab-drawer-toggle");
  if (vocabDrawerToggle) vocabDrawerToggle.addEventListener("click", () => toggleVocabDrawer());
  const vocabDrawerCloseBtn = document.getElementById("vocab-drawer-close-btn");
  if (vocabDrawerCloseBtn) vocabDrawerCloseBtn.addEventListener("click", () => toggleVocabDrawer(false));
  const vocabDrawerThemeSelect = document.getElementById("vocab-drawer-theme-select");
  if (vocabDrawerThemeSelect) vocabDrawerThemeSelect.addEventListener("change", handleVocabDrawerThemeSelectChange);
  const vocabDrawerNewThemeBtn = document.getElementById("vocab-drawer-new-theme-btn");
  if (vocabDrawerNewThemeBtn) vocabDrawerNewThemeBtn.addEventListener("click", createVocabDrawerTheme);
  const vocabDrawerSaveBtn = document.getElementById("vocab-drawer-save-btn");
  if (vocabDrawerSaveBtn) vocabDrawerSaveBtn.addEventListener("click", handleVocabDrawerSave);

  const themeSelect = document.getElementById("add-to-theme-select");
  if (themeSelect) themeSelect.addEventListener("change", handleSentenceThemeSelectChange);
  const newThemeBtn = document.getElementById("add-to-theme-new-theme-btn");
  if (newThemeBtn) newThemeBtn.addEventListener("click", createSentenceLookupTheme);
  const addWordBtn = document.getElementById("add-looked-up-word");
  if (addWordBtn) addWordBtn.addEventListener("click", handleAddLookedUpSentenceWord);
});
