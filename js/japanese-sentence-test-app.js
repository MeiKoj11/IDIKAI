/*
  japanese-sentence-test-app.js
  -------------------------------
  japanese-sentence-test.html — the Japanese counterpart of
  spanish-sentence-test-app.js/french-sentence-test-app.js's "sentence
  mode" Conjugation Test, now redesigned to match those two exactly:
  same SELF-MARKING flow (fast English draft, background accurate
  translation, self-marked tick/cross review, word-level mistake
  flagging into the Tenses folder, conjugation-error retest quiz,
  right-side vocab drawer, saved tests), same verb-pool config pattern
  (most-common checkbox + per-theme checkboxes), and locked to English
  -> Japanese only (no direction picker, no Japanese -> English or
  Mixed) — matching Spanish/French's own EN -> target-language-only
  design.

  What's genuinely different here, because Japanese conjugation itself
  works differently (see ja-conjugator.js):
  - No tense/person grid — one of four special forms (potential/
    passive/causative/causative-passive) applied to a verb. The config
    screen has a "Forms" checklist instead of a "Tenses" one.
  - A verb here is { kanji, reading, meaning, class }, not
    { infinitive, english, type } — so the verb-pool/theme-filter logic
    is its own local version (verbsFromTheme/selectedVerbPool below)
    rather than shared with the ES/FR files.
  - Word-click lookup/mistake-flagging on the Japanese side is
    CHARACTER-level, not whitespace-word-level (Japanese has no spaces)
    — ported from this page's pre-redesign version. Normal-mode
    lookup only makes kanji clickable (kana alone isn't worth looking
    up); mistake-flagging mode makes EVERY character clickable
    (kanji AND kana), since a conjugation mistake often lives in the
    kana okurigana ending, not the kanji stem.
  - Furigana is captured wherever the learner types kanji by hand,
    since unlike Spanish/French there's a second "how do I read this"
    fact worth saving alongside the word itself: the vocab drawer, and
    the Mistakes panel's "Correct form" field for the conjugation-error
    retest quiz.
*/

// ---------------------------------------------------------------------
// Config screen (question count / verb pool / forms).
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

// Verbs saved in one theme, tagged with a recognized conjugation class
// (see storage.js's getVerbWords) — mirrors spanish/french-sentence-
// test-app.js's verbsFromTheme, but Japanese vocab words carry
// verbClass/furigana instead of verbType, so the shape built here is
// { kanji, reading, meaning, class } to match JaConjugator's verb shape
// (see buildJapaneseVerbPool, which this supersedes with a per-theme
// filter instead of "every saved verb, no matter which theme").
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
  const n = checked ? parseInt(checked.value, 10) : 20;
  return n === 10 ? 10 : 20;
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
// Session / question generation — same two-pass, self-marking
// architecture as Spanish/French (see spanish-sentence-test-app.js's
// header comment for the full rationale): a fast/cheap model writes
// all N English prompt sentences in one batch, a strong model
// translates those exact sentences into Japanese in the background
// while the learner types, and Submit reveals every question's review
// at once for the learner to self-mark. Always English -> Japanese —
// there's no direction picker here (locked, matching Spanish/French).
// ---------------------------------------------------------------------

let sentenceTestSession = null; // { config, queue, cardRefs, translations, translationsPromise, translateItems, recentSentences, submitted }

function pickQuestionSpec(config, guard) {
  const safeGuard = guard || 0;
  if (safeGuard > 40) return null;
  const form = config.forms[Math.floor(Math.random() * config.forms.length)];
  const verb = config.verbs[Math.floor(Math.random() * config.verbs.length)];
  if (!verb || !verb.class) return pickQuestionSpec(config, safeGuard + 1);
  return { form, verb };
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
  if (!config.verbs.length || !config.forms.length) return;
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
    forms: selectedTestForms(),
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
    errorEl.textContent = "Couldn't build any questions from this selection — try ticking more verbs or forms.";
    errorEl.hidden = false;
    return;
  }

  const items = specs.map((spec) => ({
    kanji: spec.verb.kanji,
    reading: spec.verb.reading,
    meaning: spec.verb.meaning,
    formLabel: JaConjugator.FORM_LABELS[spec.form] || spec.form,
  }));

  const result = await Translate.generateEnglishPracticeSentencesBatch("ja", items, session.recentSentences);
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
  const promise = Translate.translatePracticeSentencesBatch("ja", translateItems).then((result) => {
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
// answer box and its post-submit review section — see spanish-
// sentence-test-app.js's buildQuestionCard for the full rationale
// (unchanged here). Always prompts in English, always answered in
// Japanese — direction is locked.
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
  renderClickableSentence(promptEl, q.englishSentence, "en");
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

  // Pre-submit: a plain answer box — nothing is checked as you go.
  const answerSection = document.createElement("div");
  const textarea = document.createElement("textarea");
  textarea.className = "card-practice-input";
  textarea.rows = 2;
  textarea.placeholder = "Type your Japanese translation…";
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

  const mistakeHint = document.createElement("p");
  mistakeHint.className = "hint tenses-test-mistake-hint";
  mistakeHint.textContent = "Click the specific word(s)/character(s) that were wrong, above, to flag and save a note.";
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

// Kanji (CJK Unified Ideographs, plus the Extension A block used for
// some rarer ones) — same range as reading-app.js's isKanji.
function isKanji(char) {
  return /[一-鿿㐀-䶿]/.test(char);
}

// Splits on whitespace (keeping it) and strips leading/trailing
// punctuation per token — used only for the English side.
function tokenizeSentence(text) {
  return (text || "").split(/(\s+)/);
}
function stripPunctuation(token) {
  return token.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
}

// Normal-mode (not mistake-flagging) rendering, dispatched by language:
// Japanese text is clicked character-by-character on KANJI ONLY
// (mirroring reading-app.js's passage reader — Japanese has no spaces
// to tokenize words on, and kana alone isn't worth a dictionary
// lookup); English text is clicked word-by-word.
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
      span.addEventListener("click", () => handleJapaneseKanjiClick(span, char, sentence));
      container.appendChild(span);
    });
    return;
  }

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
    span.addEventListener("click", () => handleEnglishWordClick(span, core));
    container.appendChild(span);
  });
}

// Mistake-flagging mode, dispatched by language. For English, same
// word-level spans as the normal renderer. For Japanese, EVERY
// character becomes clickable — kanji AND kana, not just kanji — since
// a conjugation mistake very often lives in the kana okurigana ending
// (e.g. the られる in 食べられる), which normal-mode lookup
// deliberately skips because kana alone isn't a useful dictionary
// lookup. Flagging isn't a dictionary lookup though, so that
// restriction doesn't apply here. `side` is "user" (the learner's own
// typed answer) or "accurate" (the answer key), carried along so a
// saved mistake note can record which sentence the flagged character
// came from.
function renderMistakeClickableSentence(container, sentence, lang, session, index, side) {
  container.innerHTML = "";
  if (lang === "ja") {
    Array.from(sentence || "").forEach((char) => {
      if (/\s/.test(char) || /[、。！？「」『』（）・]/.test(char)) {
        container.appendChild(document.createTextNode(char));
        return;
      }
      const span = document.createElement("span");
      span.className = "clickable-word mistake-clickable-word";
      span.textContent = char;
      span.dataset.word = char;
      span.addEventListener("click", () => handleMistakeWordClick(span, char, session, index, side));
      container.appendChild(span);
    });
    return;
  }

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
// rendering when correct/unmarked, mistake-flagging rendering once
// crossed. Re-run whenever the mark flips between wrong/not-wrong.
function renderReviewSentences(session, index) {
  const q = session.queue[index];
  const refs = session.cardRefs[index];
  const wrong = q.marked === false;

  refs.userAnswerEl.innerHTML = "";
  if (!q.answer) {
    refs.userAnswerEl.textContent = "(no answer)";
  } else if (wrong) {
    renderMistakeClickableSentence(refs.userAnswerEl, q.answer, "ja", session, index, "user");
  } else {
    renderClickableSentence(refs.userAnswerEl, q.answer, "ja");
  }

  refs.correctAnswerEl.innerHTML = "";
  if (wrong) {
    renderMistakeClickableSentence(refs.correctAnswerEl, q.translation.targetSentence, "ja", session, index, "accurate");
  } else {
    renderClickableSentence(refs.correctAnswerEl, q.translation.targetSentence, "ja");
  }
}

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

// Self-marking click handler — no AI involved.
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
// reveals every card's review section at once.
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
// Mistakes: click-a-word/character self-marking review, wrong-marked
// questions only. Flagging saves directly into the Grammar Bank's
// existing "Tenses and verb conjugations" folder (tagged "Mistake"),
// reusing the same free-form grammar-note shape and card UI Spanish/
// French use — see spanish-sentence-test-app.js's block comment for
// the fuller rationale, unchanged here.
//
// The "Conjugation error" mini-form saves just the correct
// Japanese form (+ furigana, since kanji alone doesn't tell you how to
// read it) + its English translation as a small flashcard — quiz data
// only, feeding the "Retest your mistakes" EN -> Japanese quiz below.
// ---------------------------------------------------------------------

let activeMistakeWord = null; // { span, word, session, index, side }

function findTensesFolder(language) {
  Storage.ensureDefaultGrammarThemes(language);
  const themes = Storage.getGrammarThemes(language);
  return themes.find((t) => (t.name || "").trim().toLowerCase() === "tenses and verb conjugations") || null;
}

function handleMistakeWordClick(span, word, session, index, side) {
  if (sentenceTestSession !== session) return;

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
  document.getElementById("mistake-panel-correct-form").value = word;
  document.getElementById("mistake-panel-furigana").value = "";
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

  const folder = findTensesFolder("ja");
  if (!folder) return;
  const formLabel = (JaConjugator.FORM_LABELS[q.form] || q.form).split(" —")[0];
  const saved = Storage.addGrammarNote({
    themeId: folder.id,
    sentence: word,
    translation: q.translation ? `Accurate: ${q.translation.targetSentence}` : "",
    pattern: `English: ${q.englishSentence}\nYour answer: ${q.answer || "(no answer)"}`,
    notes: note,
    tags: ["Mistake", formLabel, side === "user" ? "Your answer" : "Accurate answer"],
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

// The "Conjugation error" mini-form — a pure right-form-wrong-ending
// slip, saved as quiz data only, separate from the free-form note
// handleMistakePanelSave writes. Captures furigana alongside the
// correct form since, unlike Spanish/French, the written form alone
// doesn't tell you how to read it.
function handleMistakePanelSaveConjugation() {
  if (!activeMistakeWord) return;
  const { session, index } = activeMistakeWord;
  if (sentenceTestSession !== session) return;

  const q = session.queue[index];
  const targetForm = document.getElementById("mistake-panel-correct-form").value.trim();
  const furigana = document.getElementById("mistake-panel-furigana").value.trim();
  const translation = document.getElementById("mistake-panel-translation").value.trim();
  const statusEl = document.getElementById("mistake-panel-conjugation-status");
  if (!targetForm || !translation) {
    statusEl.textContent = "Fill in both the correct form and its translation.";
    statusEl.hidden = false;
    return;
  }

  Storage.addConjugationMistake({
    language: "ja",
    targetForm,
    furigana,
    translation,
    kanji: q.verb.kanji,
    formLabel: (JaConjugator.FORM_LABELS[q.form] || q.form).split(" —")[0],
  });

  statusEl.textContent = "Saved to Retest quiz.";
  statusEl.hidden = false;
  renderRetestSection();
}

// ---------------------------------------------------------------------
// Save test — see spanish-sentence-test-app.js for the full rationale,
// unchanged here beyond the "fr"/"es" -> "ja" language tag.
// ---------------------------------------------------------------------

function handleSaveTest() {
  const session = sentenceTestSession;
  if (!session || !session.submitted) return;

  const marked = session.queue.filter((q) => q.marked === true || q.marked === false);
  const correct = marked.filter((q) => q.marked === true).length;

  Storage.addSavedSentenceTest({
    language: "ja",
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

  const tests = Storage.getSavedSentenceTests("ja")
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
    promptLabel.textContent = "Translate to Japanese:";
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
// Retest your mistakes — EN -> Japanese flashcard quiz over the saved
// conjugation-error entries. Same self-marking shape as Spanish/
// French's version (and the Vocab Bank's own quiz): Show answer, then
// Got it/Review again — not AI-graded. Getting a card right removes it
// from the pool entirely.
// ---------------------------------------------------------------------

let retestSession = null; // { queue, current }

function renderRetestSection() {
  const section = document.getElementById("tenses-test-retest-section");
  const countEl = document.getElementById("tenses-test-retest-count");
  if (!section) return;
  const mistakes = Storage.getConjugationMistakes("ja");
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
  const mistakes = Storage.getConjugationMistakes("ja");
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
  // Show the furigana reading alongside the form when one was saved —
  // the kanji form alone doesn't tell you how to read it.
  answerEl.textContent = session.current.furigana
    ? `${session.current.targetForm}（${session.current.furigana}）`
    : session.current.targetForm;
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
// Right-side "Add vocab" drawer — manual entry (no AI call), with a
// furigana field alongside the Japanese one since (unlike Spanish/
// French) the written form alone doesn't tell you how to read it.
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

function createVocabDrawerTheme() {
  const name = prompt("Name for the new theme:");
  const existingThemes = Storage.getThemes().filter((t) => t.language === "ja");
  if (!name || !name.trim()) {
    populateVocabDrawerThemeOptions(existingThemes.length ? existingThemes[0].id : null);
    return;
  }
  const theme = Storage.addTheme(name.trim(), "ja");
  populateVocabDrawerThemeOptions(theme.id);
}

function handleVocabDrawerThemeSelectChange(e) {
  if (e.target.value !== NEW_THEME_VALUE) return;
  createVocabDrawerTheme();
}

function handleVocabDrawerSave() {
  const englishInput = document.getElementById("vocab-drawer-english");
  const japaneseInput = document.getElementById("vocab-drawer-japanese");
  const furiganaInput = document.getElementById("vocab-drawer-furigana");
  const select = document.getElementById("vocab-drawer-theme-select");
  const statusEl = document.getElementById("vocab-drawer-status");

  const english = englishInput.value.trim();
  const targetLang = japaneseInput.value.trim();
  const furigana = furiganaInput.value.trim();
  if (!english || !targetLang) {
    statusEl.textContent = "Fill in both English and Japanese.";
    statusEl.hidden = false;
    return;
  }

  let themeId = select.value;
  if (!themeId || themeId === NEW_THEME_VALUE) {
    const name = prompt("Name for the new theme:");
    if (!name || !name.trim()) return;
    const theme = Storage.addTheme(name.trim(), "ja");
    populateVocabDrawerThemeOptions(theme.id);
    themeId = theme.id;
  }

  const saved = Storage.addWordIfNotDuplicate(themeId, { english, targetLang, furigana, notes: "" });
  statusEl.textContent = saved ? `${targetLang} (${english}) — added.` : `${targetLang} (${english}) — already in your deck.`;
  statusEl.hidden = false;
  if (saved) {
    englishInput.value = "";
    japaneseInput.value = "";
    furiganaInput.value = "";
    englishInput.focus();
  }
}

// ---------------------------------------------------------------------
// Word-click lookup + Add-to-Vocab — mirrors the .lookup-panel pattern
// from reading-app.js/spanish-sentence-test-app.js. Unlike those, a
// clicked token here can come from either a kanji click (Japanese
// side, via Translate.lookupKanji) or a plain word click (English
// side, via Translate.lookupTranslation).
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
  const saved = Storage.addWordIfNotDuplicate(themeId, { english, targetLang, furigana, notes: "" });

  const resultEl = document.getElementById("lookup-result");
  if (saved) {
    resultEl.textContent = `${targetLang} (${english}) — added.`;
    addBtn.hidden = true;
  } else {
    resultEl.textContent = `${targetLang} (${english}) — already in your deck.`;
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
  populateTestThemeCheckboxes();

  const submitBtn = document.getElementById("tenses-test-submit-btn");
  if (submitBtn) submitBtn.dataset.defaultLabel = submitBtn.textContent;

  document.getElementById("tenses-test-forms-select-all").addEventListener("click", () => {
    document.querySelectorAll("#tenses-test-form-checkboxes input[type=checkbox]").forEach((i) => (i.checked = true));
  });
  document.getElementById("tenses-test-forms-clear").addEventListener("click", () => {
    document.querySelectorAll("#tenses-test-form-checkboxes input[type=checkbox]").forEach((i) => (i.checked = false));
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
