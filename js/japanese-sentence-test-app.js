/*
  japanese-sentence-test-app.js
  -------------------------------
  japanese-sentence-test.html — the Japanese counterpart of
  spanish-sentence-test-app.js/french-sentence-test-app.js's "sentence
  mode" Conjugation Test, adapted for how Japanese conjugation actually
  works here: no tense/person grid, just one of the four special forms
  (potential/passive/causative/causative-passive, see ja-conjugator.js)
  applied to a verb. Each question is a full AI-generated sentence pair
  (see server.js's GENERATE_JA_CONJUGATION_SENTENCE_PROMPT), which is
  specifically instructed to always name both parties involved in a
  causative/passive relationship explicitly, so there's never ambiguity
  about who's doing what to whom (e.g. never a bare "I was allowed to
  play" with the "by whom" left out).

  Word-click lookup differs by language shown: Japanese text is clicked
  character-by-character on kanji only (mirroring reading-app.js's
  passage reader — Japanese has no spaces to tokenize words on), while
  English text is clicked word-by-word like the Spanish/French version.
*/

// ---------------------------------------------------------------------
// Config screen (verbs/forms/direction) — verb-pool logic mirrors
// grammar-app.js's buildConjugationVerbPool/pickRandomVerb (used by the
// quick, fully-local per-card quiz) rather than the Spanish/French
// sentence-test files, since Japanese's verb-pool shape (kanji/reading/
// meaning/class) is different from theirs (infinitive/english/type).
// ---------------------------------------------------------------------

function buildJapaneseVerbPool() {
  const fromVocab = (typeof Storage !== "undefined" && Storage.getVerbWords ? Storage.getVerbWords("ja") : []).map((w) => ({
    kanji: w.targetLang,
    reading: w.furigana,
    meaning: w.english,
    class: w.verbClass,
    fromVocab: true,
  }));
  const seen = new Set(fromVocab.map((v) => v.kanji));
  const fromBuiltIn = (typeof JaConjugator !== "undefined" ? JaConjugator.COMMON_VERBS : []).filter((v) => !seen.has(v.kanji));
  return [...fromVocab, ...fromBuiltIn];
}

function populateTestVerbCheckboxes() {
  const wrap = document.getElementById("tenses-test-verb-checkboxes");
  if (!wrap) return;
  wrap.innerHTML = "";
  const pool = buildJapaneseVerbPool()
    .slice()
    .sort((a, b) => (a.reading || "").localeCompare(b.reading || ""));
  pool.forEach((verb) => {
    const label = document.createElement("label");
    label.className = "tenses-test-checkbox";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = verb.kanji;
    input.checked = true;
    label.appendChild(input);
    label.appendChild(
      document.createTextNode(` ${verb.kanji} (${verb.reading || "?"}) — ${verb.meaning || "?"}${verb.fromVocab ? " ★" : ""}`)
    );
    wrap.appendChild(label);
  });
}

function selectedTestVerbs() {
  const wrap = document.getElementById("tenses-test-verb-checkboxes");
  if (!wrap) return [];
  const checkedKanji = new Set(Array.from(wrap.querySelectorAll("input[type=checkbox]:checked")).map((i) => i.value));
  return buildJapaneseVerbPool().filter((v) => checkedKanji.has(v.kanji));
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

function selectedTestDirection() {
  const checked = document.querySelector('input[name="tenses-test-direction"]:checked');
  return checked ? checked.value : "enToJa";
}

// Same class weighting as grammar-app.js's quick quiz — every
// irregular-suru verb conjugates by the exact same rule regardless of
// which one it is, so a plain uniform-across-all-verbs pick would let
// them crowd out godan verbs just because more of them happen to be
// saved/built-in. Only used by the one-click Random test.
const JA_TEST_CLASS_WEIGHTS = { godan: 0.45, ichidan: 0.35, "irregular-suru": 0.15, "irregular-kuru": 0.05 };

function pickWeightedRandomVerb(verbs) {
  if (!verbs.length) return null;
  const byClass = {};
  verbs.forEach((v) => {
    (byClass[v.class] = byClass[v.class] || []).push(v);
  });
  const classes = Object.keys(byClass);
  const weighted = classes.map((cls) => ({ cls, weight: JA_TEST_CLASS_WEIGHTS[cls] ?? 1 / classes.length }));
  const total = weighted.reduce((sum, c) => sum + c.weight, 0) || 1;
  let r = Math.random() * total;
  for (const c of weighted) {
    r -= c.weight;
    if (r <= 0) return byClass[c.cls][Math.floor(Math.random() * byClass[c.cls].length)];
  }
  const lastClass = classes[classes.length - 1];
  return byClass[lastClass][Math.floor(Math.random() * byClass[lastClass].length)];
}

// ---------------------------------------------------------------------
// Session / question generation — questions come in one batch of
// SENTENCE_TEST_BATCH_SIZE, generated in a SINGLE AI round-trip (rather
// than one round-trip per question), so there's one longer wait up
// front instead of a short wait before every question. It's also
// meaningfully cheaper: the prompt and Opus's per-request thinking
// overhead are only paid once for the whole batch instead of once per
// question. ALL fetched questions are shown at once, as one long
// scrollable page of question cards (not one at a time) — each card
// grades itself independently when its own Check button is used, since
// grading depends on what was actually typed and can't be pre-computed.
// ---------------------------------------------------------------------

const SENTENCE_TEST_BATCH_SIZE = 20;

let sentenceTestSession = null; // { config, correct, total, queue, recentSentences }

function pickQuestionSpec(config, guard) {
  const safeGuard = guard || 0;
  if (safeGuard > 40) return null;
  if (!config.forms.length || !config.verbs.length) return null;
  const form = config.forms[Math.floor(Math.random() * config.forms.length)];
  const verb = config.weighted ? pickWeightedRandomVerb(config.verbs) : config.verbs[Math.floor(Math.random() * config.verbs.length)];
  if (!verb || !verb.class) return pickQuestionSpec(config, safeGuard + 1);
  const direction = config.direction === "mixed" ? (Math.random() < 0.5 ? "enToJa" : "jaToEn") : config.direction;
  return { form, verb, direction };
}

// Builds up to `count` question specs from the config — all decided
// synchronously before the one batch AI call that actually writes the
// sentences for them.
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
  if (!config.verbs.length || !config.forms.length) return;
  sentenceTestSession = { config, correct: 0, total: 0, queue: [], recentSentences: [] };
  document.getElementById("tenses-test-setup").hidden = true;
  document.getElementById("tenses-test-quiz").hidden = true;
  document.getElementById("tenses-test-question-list").innerHTML = "";
  document.getElementById("lookup-panel").hidden = true;
  loadSentenceTestBatch(sentenceTestSession);
}

function startTensesTest() {
  const verbs = selectedTestVerbs();
  const forms = selectedTestForms();
  const direction = selectedTestDirection();
  startTensesTestWithConfig({ verbs, forms, direction, weighted: false });
}

function startRandomTensesTest() {
  startTensesTestWithConfig({
    verbs: buildJapaneseVerbPool(),
    forms: JaConjugator.FORMS.slice(),
    direction: "enToJa",
    weighted: true,
  });
}

// Fetches a fresh batch of SENTENCE_TEST_BATCH_SIZE sentences in ONE
// request and appends them (as rendered cards) to the question list.
// The FIRST batch shows the dedicated full-panel "loading your test"
// screen, since nothing else is on the page yet to show around it;
// later batches (via "Load 20 more questions") just disable that
// button and relabel it while the existing 20 stay fully visible.
async function loadSentenceTestBatch(session) {
  if (sentenceTestSession !== session) return;

  const isFirstBatch = session.queue.length === 0;
  const loadingScreen = document.getElementById("tenses-test-loading-screen");
  const errorEl = document.getElementById("tenses-test-loading-error");
  const retryBtn = document.getElementById("tenses-test-loading-retry-btn");
  const loadMoreBtn = document.getElementById("tenses-test-new-batch-btn");

  if (isFirstBatch) {
    document.getElementById("tenses-test-quiz").hidden = true;
    loadingScreen.hidden = false;
    errorEl.hidden = true;
    retryBtn.hidden = true;
  } else {
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = "Loading more…";
  }

  const specs = buildQuestionSpecs(session.config, SENTENCE_TEST_BATCH_SIZE);
  if (!specs.length) {
    if (isFirstBatch) {
      errorEl.textContent = "Couldn't build any questions from this selection — try picking more verbs/forms.";
      errorEl.hidden = false;
    } else {
      loadMoreBtn.disabled = false;
      loadMoreBtn.textContent = "Load 20 more questions";
    }
    return;
  }

  const items = specs.map((spec) => ({
    kanji: spec.verb.kanji,
    reading: spec.verb.reading,
    meaning: spec.verb.meaning,
    formLabel: JaConjugator.FORM_LABELS[spec.form] || spec.form,
  }));

  const result = await Translate.generateJaConjugationSentencesBatch(items, session.recentSentences);

  // The learner may have hit "Change setup" while this call was in
  // flight — bail rather than rendering into a session that's gone.
  if (sentenceTestSession !== session) return;

  if (result.error || !result.sentences) {
    if (isFirstBatch) {
      errorEl.textContent = `Couldn't generate your test (${result.error || "unexpected response"}).`;
      errorEl.hidden = false;
      retryBtn.hidden = false;
    } else {
      loadMoreBtn.disabled = false;
      loadMoreBtn.textContent = "Load 20 more questions";
    }
    return;
  }

  const startIndex = session.queue.length;
  const newQuestions = specs.map((spec, i) => Object.assign({}, spec, result.sentences[i]));
  session.queue = session.queue.concat(newQuestions);
  session.recentSentences = session.recentSentences.concat(
    result.sentences.flatMap((s) => [s.japaneseSentence, s.englishSentence])
  );
  if (session.recentSentences.length > 80) {
    session.recentSentences.splice(0, session.recentSentences.length - 80);
  }

  if (isFirstBatch) {
    loadingScreen.hidden = true;
    document.getElementById("tenses-test-quiz").hidden = false;
  } else {
    loadMoreBtn.disabled = false;
    loadMoreBtn.textContent = "Load 20 more questions";
  }

  renderQuestionCards(session, startIndex);
  updateSentenceTestScore();
}

function retryLoadSentenceTestBatch() {
  if (sentenceTestSession) loadSentenceTestBatch(sentenceTestSession);
}

function loadMoreSentenceTestQuestions() {
  if (sentenceTestSession) loadSentenceTestBatch(sentenceTestSession);
}

// Builds and appends one card per queue entry starting at `fromIndex`
// — used both for the first batch and for each "Load 20 more".
function renderQuestionCards(session, fromIndex) {
  const list = document.getElementById("tenses-test-question-list");
  for (let i = fromIndex; i < session.queue.length; i++) {
    list.appendChild(buildQuestionCard(session, i));
  }
}

// Builds one self-contained question card: its own prompt, reveal
// button, answer input, and Check button, all wired to grade just this
// one question against session.queue[index] — no shared/global "current
// question" state, since every card is live on screen simultaneously.
function buildQuestionCard(session, index) {
  const q = session.queue[index];
  const promptLang = q.direction === "jaToEn" ? "ja" : "en";
  const promptSentence = promptLang === "ja" ? q.japaneseSentence : q.englishSentence;

  const card = document.createElement("div");
  card.className = "tenses-test-question-card";

  const number = document.createElement("p");
  number.className = "tenses-test-question-number";
  number.textContent = `Question ${index + 1}`;
  card.appendChild(number);

  const promptLabel = document.createElement("p");
  promptLabel.className = "hint";
  promptLabel.textContent = promptLang === "ja" ? "Translate to English:" : "Translate to Japanese:";
  card.appendChild(promptLabel);

  const promptEl = document.createElement("p");
  promptEl.className = "card-practice-prompt";
  renderClickableSentence(promptEl, promptSentence, promptLang);
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
    revealEl.textContent = `${q.verb.kanji} (${q.verb.reading}) — ${q.verb.meaning} — ${JaConjugator.FORM_LABELS[q.form].split(" —")[0]}`;
    revealEl.hidden = false;
  });

  const inputLabel = document.createElement("label");
  const input = document.createElement("input");
  input.type = "text";
  input.className = "card-practice-input";
  input.autocomplete = "off";
  input.placeholder = promptLang === "ja" ? "Type it in English…" : "Type it in Japanese…";
  inputLabel.appendChild(input);
  card.appendChild(inputLabel);

  const checkingEl = document.createElement("p");
  checkingEl.className = "hint";
  checkingEl.hidden = true;
  checkingEl.textContent = "Checking…";
  card.appendChild(checkingEl);

  const feedback = document.createElement("div");
  feedback.hidden = true;
  card.appendChild(feedback);

  const judgeRow = document.createElement("div");
  judgeRow.className = "card-practice-judge-row";
  const checkBtn = document.createElement("button");
  checkBtn.type = "button";
  checkBtn.textContent = "Check";
  judgeRow.appendChild(checkBtn);
  card.appendChild(judgeRow);

  const refs = { input, checkBtn, checkingEl, feedback };
  const doCheck = () => checkSentenceTestAnswer(session, index, refs);
  checkBtn.addEventListener("click", doCheck);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !checkBtn.disabled) doCheck();
  });

  return card;
}

// Kanji (CJK Unified Ideographs, plus the Extension A block used for
// some rarer ones) — same range as reading-app.js's isKanji.
function isKanji(char) {
  return /[一-鿿㐀-䶿]/.test(char);
}

// Splits on whitespace (keeping it) and strips leading/trailing
// punctuation per token — same as the Spanish/French version, used
// only for the English side here.
function tokenizeEnglish(text) {
  return (text || "").split(/(\s+)/);
}
function stripPunctuation(token) {
  return token.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
}

// Dispatches to the right rendering strategy per language: Japanese
// text is clicked character-by-character on kanji only (mirroring
// reading-app.js's passage reader, since Japanese has no spaces to
// tokenize words on); English text is clicked word-by-word.
function renderClickableSentence(container, sentence, lang) {
  container.innerHTML = "";
  if (lang === "ja") {
    Array.from(sentence || "").forEach((char) => {
      if (!isKanji(char)) {
        container.appendChild(document.createTextNode(char));
        return;
      }
      const span = document.createElement("span");
      span.className = "clickable-word clickable-kanji";
      span.textContent = char;
      span.dataset.kanji = char;
      // The generated sentence IS the sentence context already (unlike
      // a passage reader, which has to walk outward to find sentence
      // boundaries within a much longer text) — so the whole displayed
      // string is the right context to send as-is.
      span.addEventListener("click", () => handleJapaneseKanjiClick(span, char, sentence));
      container.appendChild(span);
    });
    return;
  }

  tokenizeEnglish(sentence).forEach((token) => {
    const core = stripPunctuation(token);
    if (!token || !core) {
      container.appendChild(document.createTextNode(token));
      return;
    }
    const span = document.createElement("span");
    span.className = "clickable-word";
    span.textContent = token;
    span.dataset.word = core;
    span.addEventListener("click", () => handleEnglishWordClick(span, core));
    container.appendChild(span);
  });
}

function updateSentenceTestScore() {
  const score = document.getElementById("tenses-test-score");
  if (score && sentenceTestSession) score.textContent = `Score: ${sentenceTestSession.correct} / ${sentenceTestSession.total}`;
}

// Verb-form-strict, everything-else-lenient — the AI does the actual
// judgment (see CHECK_CONJUGATION_SENTENCE_PROMPT in server.js, now
// widened to cover Japanese and kanji/hiragana equivalence); this just
// picks which side of the sentence pair to grade against based on
// which language the learner was asked to answer in. Scoped to one
// question card via `index`/`refs` rather than a single shared "current
// question", since every card on the page can be answered independently
// and in any order.
async function checkSentenceTestAnswer(session, index, refs) {
  if (sentenceTestSession !== session) return;
  const { input, checkBtn, checkingEl, feedback } = refs;
  const typed = input.value.trim();
  if (!typed) return;

  const q = session.queue[index];
  const { direction, japaneseSentence, englishSentence, verbFormJapanese, verbFormEnglish } = q;
  const answerLanguage = direction === "jaToEn" ? "en" : "ja";
  const referenceSentence = answerLanguage === "ja" ? japaneseSentence : englishSentence;
  const expectedVerbForm = answerLanguage === "ja" ? verbFormJapanese : verbFormEnglish;

  input.disabled = true;
  checkBtn.disabled = true;
  checkingEl.hidden = false;

  const result = await Translate.checkConjugationSentence(answerLanguage, referenceSentence, expectedVerbForm, typed);

  if (sentenceTestSession !== session) return;
  checkingEl.hidden = true;

  feedback.innerHTML = "";
  feedback.hidden = false;

  if (result.error || result.verbCorrect === null) {
    feedback.textContent = "Couldn't check that answer — try again.";
    feedback.className = "card-practice-answer card-practice-wrong";
    input.disabled = false;
    checkBtn.disabled = false;
    return;
  }

  session.total += 1;
  if (result.verbCorrect) session.correct += 1;
  updateSentenceTestScore();

  const verdict = document.createElement("strong");
  verdict.textContent = result.verbCorrect ? "Correct form!" : "Not quite — the verb form wasn't right.";
  feedback.appendChild(verdict);

  // Always show the correct sentence as clickable words/kanji — even
  // when it matches exactly what was typed — so any word can be looked
  // up and saved to the Vocab Bank straight from the feedback too.
  const correctedText = (result.corrected && result.corrected.trim()) || typed;
  const correctedLine = document.createElement("div");
  renderClickableSentence(correctedLine, correctedText, answerLanguage);
  feedback.appendChild(correctedLine);

  if (result.note) {
    const noteLine = document.createElement("div");
    noteLine.className = "hint";
    noteLine.textContent = result.note;
    feedback.appendChild(noteLine);
  }
  feedback.className = result.verbCorrect ? "card-practice-answer" : "card-practice-answer card-practice-wrong";

  // This question is done — leave the input/feedback in place (there's
  // no "Next" to move to, every question is already on screen) and just
  // retire the Check button.
  checkBtn.hidden = true;
}

function backToSetup() {
  document.getElementById("tenses-test-setup").hidden = false;
  document.getElementById("tenses-test-quiz").hidden = true;
  document.getElementById("tenses-test-loading-screen").hidden = true;
  document.getElementById("tenses-test-question-list").innerHTML = "";
  document.getElementById("lookup-panel").hidden = true;
  sentenceTestSession = null;
}

// ---------------------------------------------------------------------
// Word-click lookup + Add-to-Vocab — mirrors the .lookup-panel pattern
// from reading-app.js/spanish-sentence-test-app.js. Unlike those, a
// clicked token here can come from either a kanji click (Japanese
// side, via Translate.lookupKanji) or a plain word click (English
// side, via Translate.lookupTranslation) — handleJapaneseKanjiClick and
// handleEnglishWordClick both funnel into the same shared panel/save
// logic below.
// ---------------------------------------------------------------------

const NEW_THEME_VALUE = "__new_theme__";
let selectedLookupToken = null; // guards against a slow lookup overwriting a newer click

function renderSentenceThemeOptions(selectId) {
  const select = document.getElementById("add-to-theme-select");
  if (!select) return;
  select.innerHTML = "";

  const themes = Storage.getThemes().filter((t) => t.language === "ja");
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
  const existingThemes = Storage.getThemes().filter((t) => t.language === "ja");
  if (!name || !name.trim()) {
    renderSentenceThemeOptions(existingThemes.length ? existingThemes[0].id : null);
    return;
  }
  const theme = Storage.addTheme(name.trim(), "ja");
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
    const theme = Storage.addTheme(name.trim(), "ja");
    renderSentenceThemeOptions(theme.id);
    themeId = theme.id;
  }

  const addBtn = document.getElementById("add-looked-up-word");
  const english = addBtn.dataset.english;
  const targetLang = addBtn.dataset.targetLang;
  const furigana = addBtn.dataset.furigana || "";
  const saved = Storage.addWordIfNotDuplicate(themeId, {
    english,
    targetLang,
    furigana,
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

function beginSentenceLookup(label) {
  const panel = document.getElementById("lookup-panel");
  panel.hidden = false;
  document.getElementById("lookup-word").textContent = label;
  const resultEl = document.getElementById("lookup-result");
  resultEl.textContent = "Looking up…";
  document.getElementById("lookup-grammar").textContent = "";
  document.getElementById("add-looked-up-word").hidden = true;
  renderSentenceThemeOptions();
}

async function handleJapaneseKanjiClick(span, kanji, context) {
  document.querySelectorAll(".clickable-word.selected").forEach((el) => el.classList.remove("selected"));
  span.classList.add("selected");
  const token = `ja:${kanji}:${context}`;
  selectedLookupToken = token;
  beginSentenceLookup(kanji);

  const result = await Translate.lookupKanji(kanji, context);
  if (selectedLookupToken !== token) return; // a different word was clicked meanwhile
  if (!result || !result.word) {
    document.getElementById("lookup-result").textContent = "No translation found.";
    return;
  }

  document.getElementById("lookup-result").textContent = `${result.word}（${result.furigana}） — ${result.meaning}`;
  const addBtn = document.getElementById("add-looked-up-word");
  addBtn.hidden = false;
  addBtn.dataset.targetLang = result.word;
  addBtn.dataset.english = result.meaning;
  addBtn.dataset.furigana = result.furigana || "";
}

async function handleEnglishWordClick(span, word) {
  document.querySelectorAll(".clickable-word.selected").forEach((el) => el.classList.remove("selected"));
  span.classList.add("selected");
  const token = `en:${word}`;
  selectedLookupToken = token;
  beginSentenceLookup(word);

  const result = await Translate.lookupTranslation(word, "en", "ja");
  if (selectedLookupToken !== token) return;
  if (!result || !result.translation) {
    document.getElementById("lookup-result").textContent = "No translation found.";
    return;
  }

  document.getElementById("lookup-result").textContent = result.translation;
  const addBtn = document.getElementById("add-looked-up-word");
  addBtn.hidden = false;
  addBtn.dataset.targetLang = result.translation;
  addBtn.dataset.english = word;
  addBtn.dataset.furigana = result.furigana || "";
}

document.addEventListener("DOMContentLoaded", () => {
  const setup = document.getElementById("tenses-test-setup");
  if (!setup || !document.getElementById("tenses-test-question-list")) return; // not this page

  const lang = "ja"; // Japanese-only page
  initTopbar(lang);
  if (typeof initHubTasks === "function") initHubTasks(lang);
  initAppTabs({
    section: "grammar",
    language: lang,
    label: "Japanese sentence test",
    href: "japanese-sentence-test.html",
  });

  populateTestFormCheckboxes();
  populateTestVerbCheckboxes();

  document.getElementById("tenses-test-verbs-select-all").addEventListener("click", () => {
    document.querySelectorAll("#tenses-test-verb-checkboxes input[type=checkbox]").forEach((i) => (i.checked = true));
  });
  document.getElementById("tenses-test-verbs-clear").addEventListener("click", () => {
    document.querySelectorAll("#tenses-test-verb-checkboxes input[type=checkbox]").forEach((i) => (i.checked = false));
  });
  document.getElementById("tenses-test-random-btn").addEventListener("click", startRandomTensesTest);
  document.getElementById("tenses-test-start-btn").addEventListener("click", startTensesTest);
  document.getElementById("tenses-test-restart-btn").addEventListener("click", backToSetup);
  document.getElementById("tenses-test-loading-cancel-btn").addEventListener("click", backToSetup);
  document.getElementById("tenses-test-loading-retry-btn").addEventListener("click", retryLoadSentenceTestBatch);
  document.getElementById("tenses-test-new-batch-btn").addEventListener("click", loadMoreSentenceTestQuestions);

  const themeSelect = document.getElementById("add-to-theme-select");
  if (themeSelect) themeSelect.addEventListener("change", handleSentenceThemeSelectChange);
  const newThemeBtn = document.getElementById("add-to-theme-new-theme-btn");
  if (newThemeBtn) newThemeBtn.addEventListener("click", createSentenceLookupTheme);
  const addWordBtn = document.getElementById("add-looked-up-word");
  if (addWordBtn) addWordBtn.addEventListener("click", handleAddLookedUpSentenceWord);
});
