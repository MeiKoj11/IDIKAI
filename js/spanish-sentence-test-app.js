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

  const result = await Translate.generateEnglishPracticeSentencesBatch(items, session.recentSentences);
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
  const promise = Translate.translatePracticeSentencesBatch(translateItems).then((result) => {
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

  // Only shown once the learner crosses their own answer — plain box
  // for now, no formatting/persistence decided yet.
  const noteWrap = document.createElement("div");
  noteWrap.className = "tenses-test-note-wrap";
  noteWrap.hidden = true;
  const noteLabel = document.createElement("p");
  noteLabel.className = "hint";
  noteLabel.textContent = "Note to yourself (optional):";
  noteWrap.appendChild(noteLabel);
  const noteTextarea = document.createElement("textarea");
  noteTextarea.className = "card-practice-input tenses-test-note-input";
  noteTextarea.rows = 2;
  noteTextarea.placeholder = "What went wrong, in your own words…";
  noteWrap.appendChild(noteTextarea);
  reviewSection.appendChild(noteWrap);

  card.appendChild(reviewSection);

  tickBtn.addEventListener("click", () => markQuestionAnswer(session, index, true));
  crossBtn.addEventListener("click", () => markQuestionAnswer(session, index, false));

  return {
    card,
    refs: { textarea, answerSection, reviewSection, userAnswerEl, correctAnswerEl, tickBtn, crossBtn, noteWrap, noteTextarea },
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
function markQuestionAnswer(session, index, isCorrect) {
  if (sentenceTestSession !== session) return;
  const q = session.queue[index];
  const refs = session.cardRefs[index];
  q.marked = isCorrect;
  refs.tickBtn.classList.toggle("selected", isCorrect === true);
  refs.crossBtn.classList.toggle("selected", isCorrect === false);
  refs.noteWrap.hidden = isCorrect !== false;
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
    refs.userAnswerEl.textContent = q.answer || "(no answer)";
    renderClickableSentence(refs.correctAnswerEl, q.translation.targetSentence, "es");
    refs.reviewSection.hidden = false;
  });

  updateSentenceTestScore();
}

function backToSetup() {
  document.getElementById("tenses-test-setup").hidden = false;
  document.getElementById("tenses-test-quiz").hidden = true;
  document.getElementById("tenses-test-loading-screen").hidden = true;
  document.getElementById("tenses-test-question-list").innerHTML = "";
  document.getElementById("tenses-test-submit-error").hidden = true;
  const submitBtn = document.getElementById("tenses-test-submit-btn");
  submitBtn.hidden = false;
  submitBtn.disabled = false;
  submitBtn.textContent = submitBtn.dataset.defaultLabel || submitBtn.textContent;
  document.getElementById("lookup-panel").hidden = true;
  sentenceTestSession = null;
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

  const resultEl = document.getElementById("lookup-result");
  if (saved) {
    resultEl.textContent = `${english} — added.`;
    addBtn.hidden = true;
  } else {
    resultEl.textContent = `${english} — already in your deck.`;
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

  const themeSelect = document.getElementById("add-to-theme-select");
  if (themeSelect) themeSelect.addEventListener("change", handleSentenceThemeSelectChange);
  const newThemeBtn = document.getElementById("add-to-theme-new-theme-btn");
  if (newThemeBtn) newThemeBtn.addEventListener("click", createSentenceLookupTheme);
  const addWordBtn = document.getElementById("add-looked-up-word");
  if (addWordBtn) addWordBtn.addEventListener("click", handleAddLookedUpSentenceWord);
});
