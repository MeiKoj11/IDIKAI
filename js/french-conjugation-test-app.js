/*
  french-conjugation-test-app.js
  --------------------------------
  french-conjugation-test.html — the French mirror of
  spanish-conjugation-test-app.js. Same shape throughout; the only real
  differences are FrenchConjugator's own tense/person keys and the
  FR_TENSE_TO_CATEGORY map below, which translates them onto the
  generic categories conjugation-test-prompts.js understands (French's
  own key names don't happen to match the generic ones 1:1 the way
  Spanish's did — e.g. "passeCompose" isn't a category name).
*/

const FRENCH_TENSES_GRID_GROUPS = [
  {
    mood: "Indicatif",
    rows: [
      { label: "Past", tenses: ["imperfect", "passeCompose", "pluperfect"] },
      { label: "Present", tenses: ["present"] },
      { label: "Future", tenses: ["future", "futurePerfect"] },
    ],
  },
  {
    mood: "Conditionnel",
    rows: [{ label: "Conditionnel", tenses: ["conditionalPresent", "conditionalPast"] }],
  },
  {
    mood: "Subjonctif",
    rows: [{ label: "Subjonctif", tenses: ["subjPresent", "subjPast"] }],
  },
  {
    mood: "Impératif",
    rows: [{ label: "Commands", tenses: ["imperativePresent"] }],
  },
];

// French's own tense keys -> the generic categories conjugation-test-
// prompts.js's buildEnglishCue() understands. passeCompose is spoken
// French's default simple-past-equivalent, so it maps to "preterite"
// ("he ate") rather than "presentPerfect" ("he has eaten") — closer to
// how it's actually used and taught.
const FR_TENSE_TO_CATEGORY = {
  present: "present",
  imperfect: "imperfect",
  passeCompose: "preterite",
  pluperfect: "pluperfect",
  future: "future",
  futurePerfect: "futurePerfect",
  conditionalPresent: "conditional",
  conditionalPast: "conditionalPerfect",
  subjPresent: "subjPresent",
  subjPast: "subjPresentPerfect",
  imperativePresent: "imperativeAffirmative",
};

function frenchPersonsForTense(tense) {
  return FrenchConjugator.IMPERATIVE_TENSE_KEYS.includes(tense)
    ? FrenchConjugator.IMPERATIVE_PERSON_KEYS
    : FrenchConjugator.PERSON_KEYS;
}

let tensesTestSession = null;

// French's own person keys map 1:1 onto conjugation-test-prompts.js's
// generic subject keys used to build English cue sentences.
const PERSON_TO_SUBJECT_KEY = { je: "i", tu: "you", il: "heShe", nous: "we", vous: "youAll", ils: "they" };

// The app's curated verb list, plus any verb the user has saved to
// their own Vocab Bank BY ITSELF (not as part of a saved phrase) and
// that's either already in the curated list (so it's known-accurate)
// or tagged "regular" (er/ir/re) by the dictionary lookup — genuinely
// irregular verbs (including anything taking être, or with a spelling
// change) outside the curated list are left out rather than guessed
// at, since a wrong conjugation is worse than a smaller pool.
function buildFrenchVerbPool() {
  const curated = FrenchConjugator.VERBS.slice();
  const seen = new Set(curated.map((v) => v.infinitive));
  const savedWords = typeof Storage !== "undefined" && Storage.getVerbWords ? Storage.getVerbWords("fr") : [];
  const fromVocab = [];
  savedWords.forEach((w) => {
    const infinitive = (w.targetLang || "").trim().toLowerCase();
    if (!infinitive || seen.has(infinitive)) return;
    if (w.verbType === "er" || w.verbType === "ir" || w.verbType === "re") {
      fromVocab.push({ infinitive, type: w.verbType, english: w.english || "", irregular: false, fromVocab: true });
      seen.add(infinitive);
    }
  });
  return curated.concat(fromVocab);
}

function populateTestVerbCheckboxes() {
  const wrap = document.getElementById("tenses-test-verb-checkboxes");
  if (!wrap) return;
  wrap.innerHTML = "";
  const pool = buildFrenchVerbPool()
    .slice()
    .sort((a, b) => a.infinitive.localeCompare(b.infinitive));
  pool.forEach((verb) => {
    const label = document.createElement("label");
    label.className = "tenses-test-checkbox";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = verb.infinitive;
    input.checked = true;
    label.appendChild(input);
    label.appendChild(document.createTextNode(` ${verb.infinitive} (${verb.english || "?"})${verb.fromVocab ? " ★" : ""}`));
    wrap.appendChild(label);
  });
}

function selectedTestVerbs() {
  const wrap = document.getElementById("tenses-test-verb-checkboxes");
  if (!wrap) return [];
  const checkedInfinitives = new Set(
    Array.from(wrap.querySelectorAll("input[type=checkbox]:checked")).map((i) => i.value)
  );
  return buildFrenchVerbPool().filter((v) => checkedInfinitives.has(v.infinitive));
}

function populateTestPersonCheckboxes() {
  const wrap = document.getElementById("tenses-test-person-checkboxes");
  if (!wrap) return;
  wrap.innerHTML = "";
  FrenchConjugator.PERSON_KEYS.forEach((person) => {
    const label = document.createElement("label");
    label.className = "tenses-test-checkbox";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = person;
    input.checked = true;
    label.appendChild(input);
    label.appendChild(document.createTextNode(` ${FrenchConjugator.PERSON_LABELS[person]}`));
    wrap.appendChild(label);
  });
}

function selectedTestPersons() {
  const wrap = document.getElementById("tenses-test-person-checkboxes");
  if (!wrap) return [];
  return Array.from(wrap.querySelectorAll("input[type=checkbox]:checked")).map((i) => i.value);
}

function selectedTestDirection() {
  const checked = document.querySelector('input[name="tenses-test-direction"]:checked');
  return checked ? checked.value : "enToTl";
}

function populateTestCheckboxes() {
  const wrap = document.getElementById("tenses-test-checkboxes");
  if (!wrap) return;
  wrap.innerHTML = "";
  FRENCH_TENSES_GRID_GROUPS.forEach((group) => {
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
        label.appendChild(document.createTextNode(FrenchConjugator.ALL_TENSE_LABELS[tense] || tense));
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

// Every person can come up; je/tu just show up a bit more often.
const TEST_PERSON_WEIGHTS = { je: 0.24, tu: 0.24, il: 0.15, nous: 0.13, vous: 0.11, ils: 0.13 };
const TEST_IMPERATIVE_PERSON_WEIGHTS = { tu: 0.45, nous: 0.25, vous: 0.3 };

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

// 70% regular / 30% irregular — reuses the data's own "irregular: true"
// split rather than inventing a new classification. Only used by the
// one-click Random test (the custom path uses whatever verbs were
// checked, picked uniformly).
function pickWeightedRandomVerb(verbs) {
  const irregular = verbs.filter((v) => v.irregular);
  const regular = verbs.filter((v) => !v.irregular);
  const pool = Math.random() < 0.3 && irregular.length ? irregular : regular.length ? regular : verbs;
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickTestPerson(tense, persons, weighted) {
  const validPersons = persons.filter((p) => frenchPersonsForTense(tense).includes(p));
  if (!validPersons.length) return null;
  if (!weighted) return validPersons[Math.floor(Math.random() * validPersons.length)];
  const fullWeights = FrenchConjugator.IMPERATIVE_TENSE_KEYS.includes(tense) ? TEST_IMPERATIVE_PERSON_WEIGHTS : TEST_PERSON_WEIGHTS;
  const weights = {};
  validPersons.forEach((p) => {
    if (fullWeights[p]) weights[p] = fullWeights[p];
  });
  return Object.keys(weights).length ? weightedPick(weights) : validPersons[Math.floor(Math.random() * validPersons.length)];
}

// config = { verbs, persons, tenses, direction, weighted }.
function buildTestQuestion(config, guard) {
  const safeGuard = guard || 0;
  if (safeGuard > 40) return null;
  const tense = config.tenses[Math.floor(Math.random() * config.tenses.length)];
  const person = pickTestPerson(tense, config.persons, config.weighted);
  if (!person) return buildTestQuestion(config, safeGuard + 1);
  const verb = config.weighted ? pickWeightedRandomVerb(config.verbs) : config.verbs[Math.floor(Math.random() * config.verbs.length)];
  const answer = FrenchConjugator.conjugate(verb, tense, person);
  if (!answer) return buildTestQuestion(config, safeGuard + 1);
  const direction = config.direction === "mixed" ? (Math.random() < 0.5 ? "enToTl" : "tlToEn") : config.direction;
  return { tense, verb, person, answer, direction };
}

function startTensesTestWithConfig(config) {
  if (!config.verbs.length || !config.persons.length || !config.tenses.length) return;
  tensesTestSession = { config, correct: 0, total: 0, current: null };
  document.getElementById("tenses-test-setup").hidden = true;
  document.getElementById("tenses-test-quiz").hidden = false;
  nextTestQuestion();
}

function startTensesTest() {
  const verbs = selectedTestVerbs();
  const persons = selectedTestPersons();
  const tenses = selectedTestTenses();
  const direction = selectedTestDirection();
  startTensesTestWithConfig({ verbs, persons, tenses, direction, weighted: false });
}

function startRandomTensesTest() {
  startTensesTestWithConfig({
    verbs: buildFrenchVerbPool(),
    persons: FrenchConjugator.PERSON_KEYS.slice(),
    tenses: FrenchConjugator.ALL_TENSE_KEYS.slice(),
    direction: "enToTl",
    weighted: true,
  });
}

function nextTestQuestion() {
  if (!tensesTestSession) return;
  const question = buildTestQuestion(tensesTestSession.config);
  const revealBtn = document.getElementById("tenses-test-show-infinitive-btn");
  const revealEl = document.getElementById("tenses-test-infinitive-reveal");
  revealEl.hidden = true;
  revealEl.textContent = "";

  if (!question) {
    document.getElementById("tenses-test-prompt").textContent = "Couldn't build a question from this selection — try picking more verbs/persons/tenses.";
    revealBtn.hidden = true;
    return;
  }
  tensesTestSession.current = question;
  const { verb, tense, person, answer, direction } = question;
  const promptEl = document.getElementById("tenses-test-prompt");
  const input = document.getElementById("tenses-test-input");

  if (direction === "tlToEn") {
    promptEl.textContent = `${answer}  (${verb.infinitive})`;
    input.placeholder = "Type it in English…";
    revealBtn.hidden = true;
  } else {
    const subjectKey = PERSON_TO_SUBJECT_KEY[person] || "heShe";
    const category = FR_TENSE_TO_CATEGORY[tense] || "present";
    const cue = ConjugationTestPrompts.buildEnglishCue(verb.english, category, subjectKey);
    promptEl.textContent = cue || `${verb.infinitive} (${verb.english}) — ${FrenchConjugator.ALL_TENSE_LABELS[tense] || tense}, ${FrenchConjugator.PERSON_LABELS[person]}`;
    input.placeholder = "Type it in French…";
    revealBtn.hidden = false;
  }

  input.value = "";
  input.disabled = false;
  document.getElementById("tenses-test-feedback").hidden = true;
  document.getElementById("tenses-test-check-btn").hidden = false;
  document.getElementById("tenses-test-next-btn").hidden = true;
  updateTestScore();
  input.focus();
}

function showInfinitiveReveal() {
  if (!tensesTestSession || !tensesTestSession.current) return;
  const { verb } = tensesTestSession.current;
  const revealEl = document.getElementById("tenses-test-infinitive-reveal");
  revealEl.textContent = `${verb.infinitive} (${verb.english})`;
  revealEl.hidden = false;
}

function updateTestScore() {
  const score = document.getElementById("tenses-test-score");
  if (score && tensesTestSession) score.textContent = `Score: ${tensesTestSession.correct} / ${tensesTestSession.total}`;
}

function checkTestAnswer() {
  if (!tensesTestSession || !tensesTestSession.current) return;
  const input = document.getElementById("tenses-test-input");
  const typed = input.value.trim();
  if (!typed) return;

  const { tense, verb, person, answer, direction } = tensesTestSession.current;
  let isCorrect;
  let feedbackAnswer;

  if (direction === "tlToEn") {
    const subjectKey = PERSON_TO_SUBJECT_KEY[person] || "heShe";
    const category = FR_TENSE_TO_CATEGORY[tense] || "present";
    const result = ConjugationTestPrompts.checkReverseAnswer(typed, verb.english, category, subjectKey);
    isCorrect = result.correct;
    feedbackAnswer = result.expected;
  } else {
    isCorrect = FrenchConjugator.normalizeForMatch(answer) === FrenchConjugator.normalizeForMatch(typed);
    feedbackAnswer = answer;
  }

  tensesTestSession.total += 1;
  if (isCorrect) tensesTestSession.correct += 1;
  updateTestScore();

  const feedback = document.getElementById("tenses-test-feedback");
  feedback.hidden = false;
  feedback.textContent = isCorrect ? "Correct!" : `Not quite — ${feedbackAnswer}`;
  feedback.className = isCorrect ? "card-practice-answer" : "card-practice-answer card-practice-wrong";

  input.disabled = true;
  document.getElementById("tenses-test-check-btn").hidden = true;
  document.getElementById("tenses-test-next-btn").hidden = false;
}

function backToSetup() {
  document.getElementById("tenses-test-setup").hidden = false;
  document.getElementById("tenses-test-quiz").hidden = true;
  tensesTestSession = null;
}

document.addEventListener("DOMContentLoaded", () => {
  const setup = document.getElementById("tenses-test-setup");
  if (!setup) return; // not this page
  if (typeof FrenchConjugator === "undefined") return;

  const lang = "fr"; // French-only page
  initTopbar(lang);
  if (typeof initHubTasks === "function") initHubTasks(lang);
  initAppTabs({
    section: "grammar",
    language: lang,
    label: "French conjugation test",
    href: "french-conjugation-test.html",
  });

  populateTestCheckboxes();
  populateTestVerbCheckboxes();
  populateTestPersonCheckboxes();

  document.getElementById("tenses-test-select-all").addEventListener("click", () => {
    document.querySelectorAll("#tenses-test-checkboxes input[type=checkbox]").forEach((i) => (i.checked = true));
  });
  document.getElementById("tenses-test-clear").addEventListener("click", () => {
    document.querySelectorAll("#tenses-test-checkboxes input[type=checkbox]").forEach((i) => (i.checked = false));
  });
  document.getElementById("tenses-test-verbs-select-all").addEventListener("click", () => {
    document.querySelectorAll("#tenses-test-verb-checkboxes input[type=checkbox]").forEach((i) => (i.checked = true));
  });
  document.getElementById("tenses-test-verbs-clear").addEventListener("click", () => {
    document.querySelectorAll("#tenses-test-verb-checkboxes input[type=checkbox]").forEach((i) => (i.checked = false));
  });
  document.getElementById("tenses-test-random-btn").addEventListener("click", startRandomTensesTest);
  document.getElementById("tenses-test-start-btn").addEventListener("click", startTensesTest);
  document.getElementById("tenses-test-restart-btn").addEventListener("click", backToSetup);
  document.getElementById("tenses-test-show-infinitive-btn").addEventListener("click", showInfinitiveReveal);
  document.getElementById("tenses-test-check-btn").addEventListener("click", checkTestAnswer);
  document.getElementById("tenses-test-next-btn").addEventListener("click", nextTestQuestion);
  document.getElementById("tenses-test-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (!document.getElementById("tenses-test-check-btn").hidden) checkTestAnswer();
      else nextTestQuestion();
    }
  });
});
