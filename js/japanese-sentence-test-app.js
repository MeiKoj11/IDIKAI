/*
  japanese-sentence-test-app.js
  -------------------------------
  japanese-sentence-test.html — the Japanese counterpart of
  spanish-sentence-test-app.js/french-sentence-test-app.js's "sentence
  mode" Conjugation Test: same SELF-MARKING flow (fast English draft,
  background accurate translation, self-marked tick/cross review,
  word-level mistake flagging into the Tenses folder, conjugation-error
  retest quiz, right-side vocab drawer, saved tests), same verb-pool
  config pattern (most-common checkbox + per-theme checkboxes), and
  locked to English -> Japanese only (no direction picker, no Japanese
  -> English or Mixed) — matching Spanish/French's own EN ->
  target-language-only design.

  Screen flow (rebuilt to match the "Website redesign discussion" test
  mockups — sentence-test-setup/-loading/-answering/-marking.html), same
  pattern as japanese-conjugation-test-app.js's own rebuild:
  setup -> loading -> answering (one sentence at a time, a focus card +
  dot-row you can jump around in) -> marking (score panel + a mark-card
  per sentence, self-marked one at a time). Unlike the conjugation test,
  grading here is never automatic — every mark-card starts neutral until
  the learner clicks "Got it right"/"Got it wrong" themselves.

  The pre-submit answering phase and the post-submit marking phase
  deliberately reuse the SAME per-question card element (built once by
  buildQuestionCard, one per question, all living in
  #tenses-test-question-list) rather than two separate renderers — the
  answering phase just shows one card at a time (toggling `hidden`) and
  the marking phase reveals every card's review half at once. This
  keeps the sentence cards' stateful DOM (flagged-word datasets,
  drag-select handlers, which side/mode each answer element is in)
  intact across the transition instead of losing it to a fresh render —
  see CLAUDE.md's "Current state" notes for the fuller rationale this
  was planned against.

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
    — normal-mode lookup only makes kanji clickable (kana alone isn't
    worth looking up); mistake-flagging mode makes EVERY character
    clickable (kanji AND kana), since a conjugation mistake often lives
    in the kana okurigana ending, not the kanji stem.
  - Furigana is captured wherever the learner types kanji by hand,
    since unlike Spanish/French there's a second "how do I read this"
    fact worth saving alongside the word itself: the vocab drawer, and
    the Mistakes panel's "Correct form" field for the conjugation-error
    retest quiz.
*/

// ---------------------------------------------------------------------
// Config screen (question count / verb pool / forms) — same pill/
// source-row pattern as japanese-conjugation-test-app.js.
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

// Verbs saved in one theme, tagged with a recognized conjugation class
// (see storage.js's getVerbWords) — mirrors spanish/french-sentence-
// test-app.js's verbsFromTheme, but Japanese vocab words carry
// verbClass/furigana instead of verbType, so the shape built here is
// { kanji, reading, meaning, class } to match JaConjugator's verb shape.
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
  const wrap = document.getElementById("sent-test-question-count-pills");
  const onPill = wrap ? wrap.querySelector(".select-pill.is-on") : null;
  const n = onPill ? parseInt(onPill.dataset.count, 10) : 20;
  return n === 10 ? 10 : 20;
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

function formLabelParts(form) {
  return (JaConjugator.FORM_LABELS[form] || form).split(" —");
}
function formLabelDisplay(form) {
  const parts = formLabelParts(form);
  return parts[1] ? `${parts[0]} ${parts[1].trim()}` : parts[0];
}

function updateStartMeta() {
  const meta = document.getElementById("sent-test-start-meta");
  if (!meta) return;
  const count = selectedQuestionCount();
  const forms = selectedTestForms().length;
  meta.textContent = `${count} sentences · ${forms} form${forms === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------------
// Screen management — setup / loading / saved-detail / quiz (answering
// then marking, same container) / retest-quiz. The pagehead (back-link
// + title + stage badge) is hidden during loading, retest-quiz, and the
// pre-submit answering phase — matching the mockups, where only the
// focused/immersive screens drop it — and shown everywhere else, with
// the badge switching to "Self-marking" once a quiz has been submitted.
// ---------------------------------------------------------------------

let currentScreen = "setup";

function showScreen(name) {
  currentScreen = name;
  document.getElementById("tenses-test-setup").hidden = name !== "setup";
  document.getElementById("tenses-test-loading-screen").hidden = name !== "loading";
  document.getElementById("tenses-test-saved-detail").hidden = name !== "saved-detail";
  document.getElementById("tenses-test-quiz").hidden = name !== "quiz";
  document.getElementById("tenses-test-retest-quiz").hidden = name !== "retest-quiz";
  updatePagehead();
}

function updatePagehead() {
  const pagehead = document.getElementById("sent-test-pagehead");
  const badge = document.getElementById("sent-test-stage-badge");
  if (!pagehead || !badge) return;
  const session = sentenceTestSession;
  const hideAlways = currentScreen === "loading" || currentScreen === "retest-quiz";
  const answeringPhase = currentScreen === "quiz" && session && !session.submitted;
  pagehead.hidden = hideAlways || answeringPhase;

  const marking = currentScreen === "quiz" && session && session.submitted;
  badge.textContent = marking ? "Self-marking" : "Set up";
  badge.dataset.immersionKey = marking ? "stageSelfMarking" : "stageSetup";
  badge.classList.toggle("is-red", marking);
}

// Toggles #tenses-test-quiz between the focused one-at-a-time layout
// (760px, used while answering) and the wider list layout the mockup's
// marking screen uses (880px, same width class every other wrap-narrow
// page uses) — same element, just restyled once submitted.
function setQuizLayout(mode) {
  const main = document.getElementById("tenses-test-quiz");
  if (!main) return;
  if (mode === "marked") {
    main.classList.remove("wrap-focus");
    main.classList.add("wrap-narrow");
    main.style.paddingTop = "24px";
  } else {
    main.classList.remove("wrap-narrow");
    main.classList.add("wrap-focus");
    main.style.paddingTop = "";
  }
}

// ---------------------------------------------------------------------
// Session / question generation — same two-pass, self-marking
// architecture as Spanish/French: a fast/cheap model writes all N
// English prompt sentences in one batch, a strong model translates
// those exact sentences into Japanese in the background while the
// learner types, and finishing the last sentence reveals every
// question's review at once for the learner to self-mark. Always
// English -> Japanese — there's no direction picker here (locked,
// matching Spanish/French).
// ---------------------------------------------------------------------

let sentenceTestSession = null; // { config, queue, cardRefs, currentIndex, translations, translationsPromise, translateItems, recentSentences, submitted }

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
    currentIndex: 0,
    translations: null,
    translationsPromise: null,
    translateItems: null,
    recentSentences: [],
    submitted: false,
  };
  document.getElementById("tenses-test-question-list").innerHTML = "";
  document.getElementById("lookup-panel").hidden = true;
  setQuizLayout("answering");
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

  const errorEl = document.getElementById("tenses-test-loading-error");
  const retryBtn = document.getElementById("tenses-test-loading-retry-btn");
  showScreen("loading");
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
      skipped: false,
      marked: null,
      translation: null,
    })
  );
  session.recentSentences = result.sentences.map((s) => s.englishSentence);

  session.cardRefs = [];
  renderQuestionCards(session);
  session.currentIndex = 0;
  showScreen("quiz");
  document.getElementById("sent-test-focus-chrome").hidden = false;
  document.getElementById("sent-test-focus-footer").hidden = false;
  document.getElementById("tenses-test-score-panel").hidden = true;
  document.getElementById("tenses-test-result-actions").hidden = true;
  renderFocusCard();

  session.translateItems = items.map((item, i) => Object.assign({}, item, { englishSentence: session.queue[i].englishSentence }));
  fetchTranslations(session, session.translateItems);
}

// Starts (or restarts) the background accurate-translation request and
// stashes the in-flight promise on the session so finishing the last
// sentence can await the SAME request rather than firing a duplicate one.
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
// answering half (a focus-card: prompt + textarea) and its post-submit
// review half (a mark-card: your answer / answer key / judge buttons) —
// the same physical element throughout, matching sentence-test-
// answering.html then sentence-test-marking.html. Always prompts in
// English, always answered in Japanese — direction is locked.
function buildQuestionCard(session, index) {
  const q = session.queue[index];

  const card = document.createElement("div");
  card.className = "focus-card";

  // ---- answering half (visible pre-submit) ----
  const answerSection = document.createElement("div");

  const kicker = document.createElement("div");
  kicker.className = "focus-kicker";
  const dotSm = document.createElement("span");
  dotSm.className = "dot-sm";
  kicker.appendChild(dotSm);
  kicker.appendChild(document.createTextNode("Translate into Japanese"));
  const kickerSpacer = document.createElement("span");
  kickerSpacer.style.flex = "1";
  kicker.appendChild(kickerSpacer);
  const formChip = document.createElement("span");
  formChip.className = "chip chip-accent";
  formChip.textContent = formLabelDisplay(q.form);
  kicker.appendChild(formChip);
  answerSection.appendChild(kicker);

  const promptEl = document.createElement("div");
  promptEl.className = "sentence-prompt";
  renderClickableSentence(promptEl, q.englishSentence, "en", "word");
  answerSection.appendChild(promptEl);

  const hint1 = document.createElement("div");
  hint1.className = "sentence-hint";
  hint1.textContent = "Tap any word you don't know.";
  answerSection.appendChild(hint1);

  const revealBtn = document.createElement("button");
  revealBtn.type = "button";
  revealBtn.className = "link-btn";
  revealBtn.style.marginTop = "14px";
  revealBtn.textContent = "Show dictionary form";
  answerSection.appendChild(revealBtn);

  const revealStrip = document.createElement("div");
  revealStrip.className = "infinitive-strip";
  revealStrip.hidden = true;
  const revealWord = document.createElement("span");
  revealWord.className = "infinitive-word";
  const revealMeaning = document.createElement("span");
  revealStrip.appendChild(revealWord);
  revealStrip.appendChild(revealMeaning);
  answerSection.appendChild(revealStrip);

  revealBtn.addEventListener("click", () => {
    // Deliberately verb-only, no form label — matches Spanish/French's
    // reveal (infinitive + meaning, no tense/person either), so this
    // doesn't hand the learner the answer's grammatical form.
    revealWord.textContent = q.verb.reading ? `${q.verb.kanji}（${q.verb.reading}）` : q.verb.kanji;
    revealMeaning.textContent = ` — ${q.verb.meaning}`;
    revealStrip.hidden = false;
  });

  const textarea = document.createElement("textarea");
  textarea.className = "focus-textarea";
  textarea.rows = 3;
  textarea.placeholder = "Write your translation";
  textarea.addEventListener("input", () => {
    q.skipped = false;
    if (currentScreen === "quiz" && sentenceTestSession === session && !session.submitted) renderDotRow();
  });
  answerSection.appendChild(textarea);

  const hint2 = document.createElement("div");
  hint2.className = "sentence-hint";
  hint2.textContent = "The answer key stays hidden until you've finished every sentence.";
  answerSection.appendChild(hint2);

  card.appendChild(answerSection);

  // ---- review half (revealed post-submit) ----
  const reviewSection = document.createElement("div");
  reviewSection.hidden = true;

  const top = document.createElement("div");
  top.className = "mark-top";
  const numEl = document.createElement("span");
  numEl.className = "mark-num";
  numEl.textContent = String(index + 1);
  top.appendChild(numEl);
  const qWrap = document.createElement("div");
  qWrap.className = "mark-q";
  const sentenceEl = document.createElement("div");
  sentenceEl.className = "mark-sentence";
  sentenceEl.textContent = q.englishSentence;
  qWrap.appendChild(sentenceEl);
  const askedChip = document.createElement("span");
  askedChip.className = "chip chip-accent";
  askedChip.style.marginTop = "9px";
  askedChip.textContent = formLabelDisplay(q.form);
  qWrap.appendChild(askedChip);
  top.appendChild(qWrap);
  reviewSection.appendChild(top);

  const answerBlock = document.createElement("div");
  answerBlock.className = "mark-block";
  const userAnswerLabel = document.createElement("span");
  userAnswerLabel.className = "label-xs";
  userAnswerLabel.textContent = "Your answer";
  answerBlock.appendChild(userAnswerLabel);
  const userAnswerEl = document.createElement("div");
  userAnswerEl.className = "mark-answer";
  answerBlock.appendChild(userAnswerEl);
  reviewSection.appendChild(answerBlock);

  const keyBlock = document.createElement("div");
  keyBlock.className = "mark-key";
  const correctAnswerLabel = document.createElement("span");
  correctAnswerLabel.className = "label-xs";
  correctAnswerLabel.textContent = "Answer key";
  keyBlock.appendChild(correctAnswerLabel);
  const correctAnswerEl = document.createElement("div");
  correctAnswerEl.className = "key-line";
  keyBlock.appendChild(correctAnswerEl);
  reviewSection.appendChild(keyBlock);

  const judgeRow = document.createElement("div");
  judgeRow.className = "judge-row";
  const tickBtn = document.createElement("button");
  tickBtn.type = "button";
  tickBtn.className = "judge";
  tickBtn.textContent = "Got it right";
  const crossBtn = document.createElement("button");
  crossBtn.type = "button";
  crossBtn.className = "judge";
  crossBtn.textContent = "Got it wrong";
  judgeRow.appendChild(tickBtn);
  judgeRow.appendChild(crossBtn);
  reviewSection.appendChild(judgeRow);

  const mistakeHint = document.createElement("p");
  mistakeHint.className = "sentence-hint";
  mistakeHint.textContent = "Click the specific word(s)/character(s) that were wrong, above, to flag and save a note.";
  mistakeHint.hidden = true;
  reviewSection.appendChild(mistakeHint);

  card.appendChild(reviewSection);

  tickBtn.addEventListener("click", () => markQuestionAnswer(session, index, true));
  crossBtn.addEventListener("click", () => markQuestionAnswer(session, index, false));

  return {
    card,
    refs: { card, textarea, answerSection, reviewSection, numEl, userAnswerEl, correctAnswerEl, tickBtn, crossBtn, mistakeHint },
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
// (Japanese has no spaces to tokenize words on, and kana alone isn't
// worth a dictionary lookup); English text is clicked word-by-word.
// `baseClass` picks the visual treatment: "word" for the sentence-
// prompt pills (sentence-test-answering.html), "key-word" for the
// answer-key line inside a mark-card (sentence-test-marking.html) —
// same click/lookup behavior either way, just different chrome.
function renderClickableSentence(container, sentence, lang, baseClass) {
  const cls = baseClass || "word";
  container.innerHTML = "";
  if (lang === "ja") {
    Array.from(sentence || "").forEach((char) => {
      if (!isKanji(char)) {
        container.appendChild(document.createTextNode(char));
        return;
      }
      const span = document.createElement("span");
      span.className = `${cls} has-lookup`;
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
    span.className = `${cls} has-lookup`;
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
function renderMistakeClickableSentence(container, sentence, lang, session, index, side, baseClass) {
  const cls = baseClass || "word";
  container.innerHTML = "";
  if (lang === "ja") {
    Array.from(sentence || "").forEach((char) => {
      if (/\s/.test(char) || /[、。！？「」『』（）・]/.test(char)) {
        container.appendChild(document.createTextNode(char));
        return;
      }
      const span = document.createElement("span");
      span.className = `${cls} mistake-clickable-word`;
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
    span.className = `${cls} mistake-clickable-word`;
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
//
// Each answer container is tagged with its qIndex/side/mode so the
// drag-select phrase handler (handleSentenceTestSelection, below) can
// figure out how to route a selection without needing its own closure
// over this specific card.
function renderReviewSentences(session, index) {
  const q = session.queue[index];
  const refs = session.cardRefs[index];
  const wrong = q.marked === false;

  refs.userAnswerEl.dataset.qIndex = String(index);
  refs.userAnswerEl.dataset.side = "user";
  refs.userAnswerEl.dataset.mode = wrong ? "mistake" : "lookup";
  refs.correctAnswerEl.dataset.qIndex = String(index);
  refs.correctAnswerEl.dataset.side = "accurate";
  refs.correctAnswerEl.dataset.mode = wrong ? "mistake" : "lookup";

  refs.userAnswerEl.classList.toggle("is-wrong", wrong);
  refs.userAnswerEl.classList.toggle("is-blank", !q.answer);

  refs.userAnswerEl.innerHTML = "";
  if (!q.answer) {
    refs.userAnswerEl.textContent = "Skipped";
  } else if (wrong) {
    renderMistakeClickableSentence(refs.userAnswerEl, q.answer, "ja", session, index, "user", "key-word");
  } else {
    renderClickableSentence(refs.userAnswerEl, q.answer, "ja", "key-word");
  }

  refs.correctAnswerEl.innerHTML = "";
  if (wrong) {
    renderMistakeClickableSentence(refs.correctAnswerEl, q.translation.targetSentence, "ja", session, index, "accurate", "key-word");
  } else {
    renderClickableSentence(refs.correctAnswerEl, q.translation.targetSentence, "ja", "key-word");
  }
}

function updateSentenceTestScore() {
  const session = sentenceTestSession;
  const scoreEl = document.getElementById("tenses-test-score");
  const noteEl = document.getElementById("sent-test-score-note");
  if (!scoreEl || !session || !session.submitted) return;

  const total = session.queue.length;
  const correct = session.queue.filter((q) => q.marked === true).length;
  const markedCount = session.queue.filter((q) => q.marked === true || q.marked === false).length;
  const unmarked = total - markedCount;

  scoreEl.textContent = `${correct} / ${total}`;
  if (noteEl) {
    noteEl.textContent =
      unmarked > 0
        ? `${unmarked} sentence${unmarked === 1 ? "" : "s"} still need${unmarked === 1 ? "s" : ""} marking — compare each answer against the key and judge it yourself.`
        : "Every sentence has been marked — nice work.";
  }
}

// Self-marking click handler — no AI involved.
function markQuestionAnswer(session, index, isCorrect) {
  if (sentenceTestSession !== session) return;
  const q = session.queue[index];
  const refs = session.cardRefs[index];
  const wasWrong = q.marked === false;
  q.marked = isCorrect;

  refs.tickBtn.classList.toggle("is-right", isCorrect === true);
  refs.crossBtn.classList.toggle("is-wrong", isCorrect === false);
  refs.numEl.classList.toggle("is-right", isCorrect === true);
  refs.numEl.classList.toggle("is-wrong", isCorrect === false);
  refs.card.classList.toggle("is-wrong", isCorrect === false);

  const nowWrong = isCorrect === false;
  refs.mistakeHint.hidden = !nowWrong;
  if (nowWrong !== wasWrong) renderReviewSentences(session, index);
  updateSentenceTestScore();
}

// ---------------------------------------------------------------------
// Answering navigation — one sentence at a time (focus card + dot row),
// matching sentence-test-answering.html. All N question cards already
// exist in the DOM (built once by renderQuestionCards); moving between
// them is just toggling `hidden`, so nothing typed is ever lost.
// ---------------------------------------------------------------------

function renderFocusCard() {
  const session = sentenceTestSession;
  if (!session) return;
  const total = session.queue.length;
  const index = session.currentIndex;

  session.cardRefs.forEach((refs, i) => {
    refs.card.hidden = i !== index;
  });

  const progressLabel = document.getElementById("sent-test-progress-label");
  if (progressLabel) progressLabel.textContent = `Sentence ${index + 1} of ${total}`;
  const progressFill = document.getElementById("sent-test-progress-fill");
  if (progressFill) progressFill.style.width = `${Math.round((index / total) * 100)}%`;

  const backBtn = document.getElementById("sent-test-back-btn");
  if (backBtn) backBtn.disabled = index === 0;

  updateNextBtnLabel();
  renderDotRow();

  const refs = session.cardRefs[index];
  if (refs && refs.textarea) refs.textarea.focus();
}

function updateNextBtnLabel() {
  const session = sentenceTestSession;
  const nextBtn = document.getElementById("tenses-test-submit-btn");
  if (!session || !nextBtn) return;
  const isLast = session.currentIndex >= session.queue.length - 1;
  nextBtn.textContent = isLast ? "Submit answers" : "Next sentence";
}

function renderDotRow() {
  const session = sentenceTestSession;
  const row = document.getElementById("sent-test-dot-row");
  if (!session || !row) return;
  row.innerHTML = "";
  session.queue.forEach((q, i) => {
    const refs = session.cardRefs[i];
    const answered = refs && refs.textarea.value.trim();
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "q-dot";
    if (i === session.currentIndex) dot.classList.add("is-current");
    else if (answered) dot.classList.add("is-answered");
    else if (q.skipped) dot.classList.add("is-skipped");
    dot.textContent = String(i + 1);
    dot.addEventListener("click", () => goToAnsweringCard(i));
    row.appendChild(dot);
  });
}

function goToAnsweringCard(index) {
  const session = sentenceTestSession;
  if (!session) return;
  session.currentIndex = Math.max(0, Math.min(session.queue.length - 1, index));
  renderFocusCard();
}

function handleSentTestBack() {
  const session = sentenceTestSession;
  if (!session || session.currentIndex === 0) return;
  goToAnsweringCard(session.currentIndex - 1);
}

function handleSentTestSkip() {
  const session = sentenceTestSession;
  if (!session) return;
  const refs = session.cardRefs[session.currentIndex];
  if (refs) refs.textarea.value = "";
  session.queue[session.currentIndex].skipped = true;
  handleSentTestAdvance();
}

function handleSentTestAdvance() {
  const session = sentenceTestSession;
  if (!session) return;
  if (session.currentIndex >= session.queue.length - 1) {
    submitSentenceTest();
  } else {
    session.currentIndex += 1;
    renderFocusCard();
  }
}

// The finishing action: locks in every typed answer, waits for the
// accurate-translation background pass if it isn't done yet, then
// reveals every card's review half at once as the marking screen.
async function submitSentenceTest() {
  const session = sentenceTestSession;
  if (!session || !session.queue.length || session.submitted) return;

  const nextBtn = document.getElementById("tenses-test-submit-btn");
  const errorEl = document.getElementById("tenses-test-submit-error");
  errorEl.hidden = true;

  session.queue.forEach((q, i) => {
    q.answer = session.cardRefs[i].textarea.value.trim();
  });

  let translations = session.translations;
  if (!translations) {
    nextBtn.disabled = true;
    nextBtn.textContent = "Finishing up your answer key…";
    const result = session.translationsPromise
      ? await session.translationsPromise
      : await fetchTranslations(session, session.translateItems);
    if (sentenceTestSession !== session) return;
    nextBtn.disabled = false;
    translations = session.translations || (result && result.translations) || null;
  }

  if (!translations) {
    updateNextBtnLabel();
    errorEl.textContent = "Couldn't finish preparing the answer key — your answers are saved, try again.";
    errorEl.hidden = false;
    return;
  }

  session.submitted = true;
  session.translations = translations;

  session.queue.forEach((q, i) => {
    q.translation = translations[i];
    const refs = session.cardRefs[i];
    refs.answerSection.hidden = true;
    refs.card.classList.remove("focus-card");
    refs.card.classList.add("mark-card");
    refs.card.hidden = false;
    renderReviewSentences(session, i);
    refs.reviewSection.hidden = false;
  });

  document.getElementById("sent-test-focus-chrome").hidden = true;
  document.getElementById("sent-test-focus-footer").hidden = true;
  document.getElementById("tenses-test-score-panel").hidden = false;
  setQuizLayout("marked");
  updatePagehead();

  const saveBtn = document.getElementById("tenses-test-save-btn");
  saveBtn.hidden = false;
  saveBtn.disabled = false;
  document.getElementById("tenses-test-save-status").hidden = true;
  document.getElementById("tenses-test-result-actions").hidden = false;

  updateSentenceTestScore();
}

function backToSetup() {
  showScreen("setup");
  document.getElementById("tenses-test-question-list").innerHTML = "";
  document.getElementById("tenses-test-submit-error").hidden = true;
  const nextBtn = document.getElementById("tenses-test-submit-btn");
  nextBtn.disabled = false;
  nextBtn.textContent = "Next sentence";
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
// existing "Mistakes" folder, tagged "Mistake" — see the block comment
// above for the fuller rationale.
//
// The "Conjugation error" mini-form saves just the correct Japanese
// form (+ furigana, since kanji alone doesn't tell you how to read it)
// + its English translation as a small flashcard — quiz data only,
// feeding the "Retest your mistakes" EN -> Japanese quiz below.
// ---------------------------------------------------------------------

let activeMistakeWord = null; // { spans, word, session, index, side }
let activeMistakeFuriganaToken = null; // guards the auto-prefill lookup against a stale response

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

function sameSpanGroup(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((s, i) => s === b[i]);
}

// `spans` can be a single span (a plain click/tap on one character) or
// an array of spans (a drag-selected run spanning a whole word/phrase —
// see handleSentenceTestSelection) — normalized to an array either way,
// since flagging/saving/removing all need to act on every span in the
// group together.
function handleMistakeWordClick(spans, word, session, index, side) {
  if (sentenceTestSession !== session) return;
  const spanArray = Array.isArray(spans) ? spans : [spans];
  if (!spanArray.length) return;

  if (activeMistakeWord && sameSpanGroup(activeMistakeWord.spans, spanArray)) {
    closeMistakePanel();
    return;
  }

  spanArray.forEach((s) => s.classList.add("mistake-word-flagged"));
  activeMistakeWord = { spans: spanArray, word, session, index, side };

  const panel = document.getElementById("mistake-panel");
  panel.hidden = false;
  document.getElementById("mistake-panel-word").textContent = word;
  document.getElementById("mistake-panel-note").value = spanArray[0].dataset.mistakeNote || "";
  document.getElementById("mistake-panel-correct-form").value = word;
  document.getElementById("mistake-panel-furigana").value = "";
  document.getElementById("mistake-panel-translation").value = "";
  document.getElementById("mistake-panel-conjugation-status").hidden = true;

  prefillMistakeFurigana(word);
}

// Auto-fills the Furigana field for whatever was just flagged — a
// flagged word is very often unfamiliar enough that the learner
// wouldn't know how to read it either, and this was already being
// fetched for the ordinary lookup panel, just not reused here. Only
// bothers looking it up if the flagged text actually contains kanji
// (a lone kana particle has no furigana to look up) and never
// overwrites anything the learner already typed in that field.
async function prefillMistakeFurigana(word) {
  if (!Array.from(word || "").some(isKanji)) return;
  const token = `mistake-furigana:${word}`;
  activeMistakeFuriganaToken = token;
  const result = await Translate.lookupKanji(word, word);
  if (activeMistakeFuriganaToken !== token || !activeMistakeWord) return;
  if (result && result.furigana) {
    const furiganaInput = document.getElementById("mistake-panel-furigana");
    if (furiganaInput && !furiganaInput.value.trim()) furiganaInput.value = result.furigana;
  }
}

function closeMistakePanel() {
  activeMistakeWord = null;
  activeMistakeFuriganaToken = null;
  const panel = document.getElementById("mistake-panel");
  if (panel) panel.hidden = true;
}

function handleMistakePanelSave() {
  if (!activeMistakeWord) return;
  const { spans, word, session, index, side } = activeMistakeWord;
  if (sentenceTestSession !== session) return;

  const q = session.queue[index];
  const note = document.getElementById("mistake-panel-note").value.trim();
  spans.forEach((s) => {
    s.dataset.mistakeNote = note;
  });

  const folder = findOrCreateMistakesFolder("ja");
  if (!folder) return;
  const formLabel = formLabelParts(q.form)[0];
  const saved = Storage.addGrammarNote({
    themeId: folder.id,
    sentence: word,
    translation: q.translation ? `Accurate: ${q.translation.targetSentence}` : "",
    pattern: `English: ${q.englishSentence}\nYour answer: ${q.answer || "(no answer)"}`,
    notes: note,
    tags: ["Mistake", formLabel, side === "user" ? "Your answer" : "Accurate answer"],
  });

  spans.forEach((s) => {
    s.dataset.mistakeNoteId = saved.id;
    s.classList.add("mistake-word-saved");
  });
  closeMistakePanel();
}

function handleMistakePanelRemove() {
  if (!activeMistakeWord) return;
  const { spans } = activeMistakeWord;
  const noteId = spans[0] && spans[0].dataset.mistakeNoteId;
  if (noteId) Storage.deleteGrammarNote(noteId);
  spans.forEach((s) => {
    s.classList.remove("mistake-word-flagged", "mistake-word-saved");
    delete s.dataset.mistakeNote;
    delete s.dataset.mistakeNoteId;
  });
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
    formLabel: formLabelParts(q.form)[0],
  });

  renderRetestSection();
  closeMistakePanel();
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
    const row = document.createElement("a");
    row.href = "#";
    row.className = "pill-row";

    const badge = document.createElement("span");
    badge.className = "score-badge" + (test.correct < test.total * 0.6 ? " is-bad" : "");
    badge.textContent = `${test.correct}/${test.total}`;
    row.appendChild(badge);

    const desc = document.createElement("span");
    desc.style.fontSize = "13.5px";
    desc.textContent = `${test.total} sentence${test.total === 1 ? "" : "s"}`;
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
      Storage.deleteSavedSentenceTest(test.id);
      renderSavedTestsList();
    });
    row.appendChild(deleteBtn);

    list.appendChild(row);
  });
}

function viewSavedTest(testId) {
  const test = Storage.getSavedSentenceTest(testId);
  if (!test) return;

  showScreen("saved-detail");
  document.getElementById("tenses-test-saved-detail-score").textContent = `${test.correct} / ${test.total}`;

  const list = document.getElementById("tenses-test-saved-detail-list");
  list.innerHTML = "";

  test.questions.forEach((q, i) => {
    const card = document.createElement("div");
    card.className = "mark-card" + (q.marked === false ? " is-wrong" : "");

    const top = document.createElement("div");
    top.className = "mark-top";
    const num = document.createElement("span");
    num.className = "mark-num" + (q.marked === true ? " is-right" : q.marked === false ? " is-wrong" : "");
    num.textContent = String(i + 1);
    top.appendChild(num);
    const qWrap = document.createElement("div");
    qWrap.className = "mark-q";
    const sentenceEl = document.createElement("div");
    sentenceEl.className = "mark-sentence";
    sentenceEl.textContent = q.englishSentence;
    qWrap.appendChild(sentenceEl);
    top.appendChild(qWrap);
    card.appendChild(top);

    const answerBlock = document.createElement("div");
    answerBlock.className = "mark-block";
    const userAnswerLabel = document.createElement("span");
    userAnswerLabel.className = "label-xs";
    userAnswerLabel.textContent = "Your answer";
    answerBlock.appendChild(userAnswerLabel);
    const userEl = document.createElement("div");
    userEl.className = "mark-answer" + (q.marked === false ? " is-wrong" : "") + (!q.userAnswer ? " is-blank" : "");
    userEl.textContent = q.userAnswer || "Skipped";
    answerBlock.appendChild(userEl);
    card.appendChild(answerBlock);

    const keyBlock = document.createElement("div");
    keyBlock.className = "mark-key";
    const correctLabel = document.createElement("span");
    correctLabel.className = "label-xs";
    correctLabel.textContent = "Answer key";
    keyBlock.appendChild(correctLabel);
    const keyLine = document.createElement("div");
    keyLine.className = "key-line";
    keyLine.textContent = q.targetSentence;
    keyBlock.appendChild(keyLine);
    card.appendChild(keyBlock);

    if (q.marked !== true && q.marked !== false) {
      const note = document.createElement("span");
      note.className = "label-xs";
      note.style.display = "block";
      note.style.marginTop = "10px";
      note.textContent = "Not marked";
      card.appendChild(note);
    }

    list.appendChild(card);
  });
}

function backFromSavedDetail() {
  showScreen("setup");
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
    countEl.textContent = `${mistakes.length} saved sentence${mistakes.length === 1 ? "" : "s"}. Ones you get right are cleared from the list.`;
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

function startRetest(e) {
  if (e) e.preventDefault();
  const mistakes = Storage.getConjugationMistakes("ja");
  if (!mistakes.length) return;
  retestSession = { queue: shuffleArray(mistakes.slice()), current: null };

  showScreen("retest-quiz");
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
  document.getElementById("tenses-test-retest-answer-strip").hidden = true;
  document.getElementById("tenses-test-retest-buttons").hidden = true;
  document.getElementById("tenses-test-retest-show-btn").hidden = false;
}

function handleRetestShowAnswer() {
  document.getElementById("tenses-test-retest-answer-strip").hidden = false;
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
  showScreen("setup");
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
  const displayForm = furigana ? `${targetLang}（${furigana}）` : targetLang;
  statusEl.textContent = saved ? `${displayForm} (${english}) — added.` : `${displayForm} (${english}) — already in your deck.`;
  statusEl.hidden = false;
  if (saved) {
    englishInput.value = "";
    japaneseInput.value = "";
    furiganaInput.value = "";
    englishInput.focus();
  }
}

// ---------------------------------------------------------------------
// Word-click lookup + Add-to-Vocab — mirrors the .lookup-strip pattern
// from the redesigned mockups. Unlike those, a clicked token here can
// come from either a kanji click (Japanese side, via
// Translate.lookupKanji) or a plain word click (English side, via
// Translate.lookupTranslation).
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
  const displayForm = furigana ? `${targetLang}（${furigana}）` : targetLang;
  if (saved) {
    resultEl.textContent = `${displayForm} (${english}) — added.`;
    addBtn.hidden = true;
  } else {
    resultEl.textContent = `${displayForm} (${english}) — already in your deck.`;
  }
}

function closeLookupPanel() {
  selectedLookupToken = null;
  const panel = document.getElementById("lookup-panel");
  if (panel) panel.hidden = true;
  document.querySelectorAll(".clickable-word.selected, .word.selected, .key-word.selected").forEach((el) => el.classList.remove("selected"));
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

// `span` is nullable — a plain click passes the single span it came
// from (for the ".selected" highlight); a drag-selected phrase spanning
// multiple sibling spans (see handleSentenceTestSelection, below) has
// no single span to highlight and passes null instead. `kanji` can be
// a lone character OR a multi-character compound/phrase — lookupKanji
// is AI-backed and handles either.
async function performKanjiLookup(kanji, context, span) {
  document.querySelectorAll(".word.selected, .key-word.selected").forEach((el) => el.classList.remove("selected"));
  if (span) span.classList.add("selected");
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

function handleJapaneseKanjiClick(span, kanji, context) {
  performKanjiLookup(kanji, context, span);
}

// `span` is nullable for the same reason as performKanjiLookup above —
// a drag-selected multi-word English phrase (e.g. "over and over") has
// no single span to highlight.
async function performEnglishWordLookup(word, span) {
  document.querySelectorAll(".word.selected, .key-word.selected").forEach((el) => el.classList.remove("selected"));
  if (span) span.classList.add("selected");
  const token = `en:${word}`;
  selectedLookupToken = token;
  beginSentenceLookup(word);

  const result = await Translate.lookupTranslation(word, "en", "ja");
  if (selectedLookupToken !== token) return;
  if (!result || !result.translation) {
    document.getElementById("lookup-result").textContent = "No translation found.";
    return;
  }

  // Show the furigana reading alongside the Japanese translation — it
  // was already being fetched and saved to the vocab word, just never
  // actually displayed here.
  document.getElementById("lookup-result").textContent = result.furigana
    ? `${result.translation}（${result.furigana}）`
    : result.translation;
  const addBtn = document.getElementById("add-looked-up-word");
  addBtn.hidden = false;
  addBtn.dataset.targetLang = result.translation;
  addBtn.dataset.english = word;
  addBtn.dataset.furigana = result.furigana || "";
}

function handleEnglishWordClick(span, word) {
  performEnglishWordLookup(word, span);
}

// ---------------------------------------------------------------------
// Drag-select a whole word/phrase (Japanese: a multi-kanji compound
// like 学院, or any run of characters; English: multiple words like
// "over and over") instead of being limited to one character/word per
// click. Reuses reading-app.js's general mouseup-selection pattern —
// any selection of 2+ characters routes to a lookup (or, in mistake
// mode, to flagging the whole selected group at once).
// ---------------------------------------------------------------------

// Every clickable-word span inside `container` that the selection
// range actually touches, in document order — used to collect the
// full group of sibling spans a drag-selection covered, since a
// Range's boundary points alone don't tell you which spans in between
// were included.
function spansInSelectionRange(container, range) {
  const spans = Array.from(container.querySelectorAll(".word, .key-word"));
  return spans.filter((span) => range.intersectsNode(span));
}

function handleSentenceTestSelection() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
  const text = selection.toString().trim();
  if (!text) return;

  const range = selection.getRangeAt(0);
  const anchorNode = selection.anchorNode;
  if (!anchorNode) return;
  const anchorEl = anchorNode.nodeType === Node.ELEMENT_NODE ? anchorNode : anchorNode.parentElement;
  if (!anchorEl) return;

  const promptContainer = anchorEl.closest(".sentence-prompt");
  if (promptContainer) {
    // English prompt — only a genuinely multi-word drag (contains
    // whitespace) is handled here; a single-word drag is left to that
    // word's own click listener so it isn't looked up twice.
    if (!/\s/.test(text)) return;
    selection.removeAllRanges();
    performEnglishWordLookup(text, null);
    return;
  }

  const answerContainer = anchorEl.closest(".mark-answer, .key-line");
  if (!answerContainer) return;
  // A single-character selection is left to that character's own click
  // listener (mouse-jitter during a plain click can otherwise fire
  // both), so only 2+ characters are handled here.
  if (text.length < 2) return;

  const qIndex = parseInt(answerContainer.dataset.qIndex, 10);
  const side = answerContainer.dataset.side;
  const mode = answerContainer.dataset.mode;
  const session = sentenceTestSession;
  if (!session || Number.isNaN(qIndex)) return;

  if (mode === "mistake") {
    const spans = spansInSelectionRange(answerContainer, range);
    if (!spans.length) return;
    selection.removeAllRanges();
    handleMistakeWordClick(spans, text, session, qIndex, side);
  } else {
    selection.removeAllRanges();
    const q = session.queue[qIndex];
    const context = q ? (side === "user" ? q.answer : q.translation && q.translation.targetSentence) || text : text;
    performKanjiLookup(text, context, null);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const setup = document.getElementById("tenses-test-setup");
  if (!setup || !document.getElementById("tenses-test-question-list")) return; // not this page

  const lang = "ja"; // Japanese-only page
  document.body.classList.add("lang-ja");
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
  updateStartMeta();

  document.getElementById("sent-test-question-count-pills").addEventListener("click", (e) => {
    const pill = e.target.closest(".select-pill");
    if (!pill) return;
    document.querySelectorAll("#sent-test-question-count-pills .select-pill").forEach((p) => p.classList.remove("is-on"));
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

  const questionList = document.getElementById("tenses-test-question-list");
  if (questionList) questionList.addEventListener("mouseup", handleSentenceTestSelection);

  document.getElementById("tenses-test-restart-btn").addEventListener("click", backToSetup);
  document.getElementById("sent-test-leave-btn").addEventListener("click", backToSetup);
  document.getElementById("tenses-test-loading-cancel-btn").addEventListener("click", backToSetup);
  document.getElementById("tenses-test-loading-retry-btn").addEventListener("click", retryLoadSentenceTestBatch);

  document.getElementById("sent-test-back-btn").addEventListener("click", handleSentTestBack);
  document.getElementById("sent-test-skip-btn").addEventListener("click", handleSentTestSkip);
  document.getElementById("tenses-test-submit-btn").addEventListener("click", handleSentTestAdvance);

  const saveBtn = document.getElementById("tenses-test-save-btn");
  if (saveBtn) saveBtn.addEventListener("click", handleSaveTest);
  const savedDetailBackBtn = document.getElementById("tenses-test-saved-detail-back-btn");
  if (savedDetailBackBtn) savedDetailBackBtn.addEventListener("click", backFromSavedDetail);

  document.getElementById("lookup-close-btn").addEventListener("click", closeLookupPanel);
  const mistakeCloseBtn = document.getElementById("mistake-panel-close-btn");
  if (mistakeCloseBtn) mistakeCloseBtn.addEventListener("click", closeMistakePanel);
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
