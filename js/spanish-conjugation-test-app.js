/*
  spanish-conjugation-test-app.js
  --------------------------------
  spanish-conjugation-test.html — the "design your own or random" verb
  conjugation quiz, split out from spanish-tenses.html into its own
  page (it grew too large for a modal). Pick verbs (default list + your
  own saved-as-vocab verbs), persons, tenses, and a direction, then a
  card-style local quiz (no AI call) grades against SpanishConjugator's
  case+accent-insensitive normalizeForMatch (EN -> ES) or
  ConjugationTestPrompts' local English-sentence match (ES -> EN).
*/

// Same mood/tense grouping as spanish-tenses-app.js's TENSES_GRID_GROUPS
// — duplicated here (rather than shared) since this page doesn't load
// the tenses-overview grid at all.
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

let tensesTestSession = null;

// Spanish's own person keys map 1:1 onto conjugation-test-prompts.js's
// generic subject keys used to build English cue sentences.
const PERSON_TO_SUBJECT_KEY = { yo: "i", tu: "you", el: "heShe", nosotros: "we", vosotros: "youAll", ellos: "they" };

// The app's curated verb list, plus any verb the user has saved to
// their own Vocab Bank BY ITSELF (not as part of a saved phrase) and
// that's either already in the curated list (so it's known-accurate)
// or tagged "regular" (ar/ir) by the dictionary lookup — genuinely
// irregular verbs outside the curated list are left out rather than
// guessed at, since a wrong conjugation is worse than a smaller pool.
function buildSpanishVerbPool() {
  const curated = SpanishConjugator.VERBS.slice();
  const seen = new Set(curated.map((v) => v.infinitive));
  const savedWords = typeof Storage !== "undefined" && Storage.getVerbWords ? Storage.getVerbWords("es") : [];
  const fromVocab = [];
  savedWords.forEach((w) => {
    const infinitive = (w.targetLang || "").trim().toLowerCase();
    if (!infinitive || seen.has(infinitive)) return;
    if (w.verbType === "ar" || w.verbType === "ir") {
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
  const pool = buildSpanishVerbPool()
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
  return buildSpanishVerbPool().filter((v) => checkedInfinitives.has(v.infinitive));
}

function populateTestPersonCheckboxes() {
  const wrap = document.getElementById("tenses-test-person-checkboxes");
  if (!wrap) return;
  wrap.innerHTML = "";
  SpanishConjugator.PERSON_KEYS.forEach((person) => {
    const label = document.createElement("label");
    label.className = "tenses-test-checkbox";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = person;
    input.checked = true;
    label.appendChild(input);
    label.appendChild(document.createTextNode(` ${SpanishConjugator.PERSON_LABELS[person]}`));
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

// Every person can come up; yo/tú just show up a bit more often.
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

// config = { verbs, persons, tenses, direction, weighted }. `weighted`
// is only true for the one-click Random test (keeps the old "yo/tú
// come up a bit more" feel); the custom path is uniform across
// whatever was explicitly checked.
function buildTestQuestion(config, guard) {
  const safeGuard = guard || 0;
  if (safeGuard > 40) return null;
  const tense = config.tenses[Math.floor(Math.random() * config.tenses.length)];
  const person = pickTestPerson(tense, config.persons, config.weighted);
  if (!person) return buildTestQuestion(config, safeGuard + 1);
  const verb = config.weighted ? pickWeightedRandomVerb(config.verbs) : config.verbs[Math.floor(Math.random() * config.verbs.length)];
  const answer = SpanishConjugator.conjugate(verb, tense, person);
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
    verbs: buildSpanishVerbPool(),
    persons: SpanishConjugator.PERSON_KEYS.slice(),
    tenses: SpanishConjugator.ALL_TENSE_KEYS.slice(),
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
    revealBtn.hidden = true; // the infinitive is already shown in the prompt itself
  } else {
    const subjectKey = PERSON_TO_SUBJECT_KEY[person] || "heShe";
    const cue = ConjugationTestPrompts.buildEnglishCue(verb.english, tense, subjectKey);
    promptEl.textContent = cue || `${verb.infinitive} (${verb.english}) — ${SpanishConjugator.ALL_TENSE_LABELS[tense] || tense}, ${SpanishConjugator.PERSON_LABELS[person]}`;
    input.placeholder = "Type it in Spanish…";
    revealBtn.hidden = false; // English cue deliberately hides which verb it is — offer a peek
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
    const result = ConjugationTestPrompts.checkReverseAnswer(typed, verb.english, tense, subjectKey);
    isCorrect = result.correct;
    feedbackAnswer = result.expected;
  } else {
    const acceptable = [answer];
    if (tense === "subjImperfect") {
      const alt = SpanishConjugator.conjugate(verb, "subjImperfectSe", person);
      if (alt) acceptable.push(alt);
    }
    const normalizedTyped = SpanishConjugator.normalizeForMatch(typed);
    isCorrect = acceptable.some((a) => SpanishConjugator.normalizeForMatch(a) === normalizedTyped);
    feedbackAnswer = acceptable.join(" / ");
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

  const lang = "es"; // Spanish-only page
  initTopbar(lang);
  if (typeof initHubTasks === "function") initHubTasks(lang);
  initAppTabs({
    section: "grammar",
    language: lang,
    label: "Spanish conjugation test",
    href: "spanish-conjugation-test.html",
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
