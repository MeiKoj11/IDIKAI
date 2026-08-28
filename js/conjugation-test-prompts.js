/*
  conjugation-test-prompts.js
  ----------------------------
  Shared, local (no AI) English sentence-cue generator for the
  Conjugation Test feature. Each language's own app.js maps its own
  tense/person keys onto the generic categories used here (see
  TENSE_CATEGORY_MAP conventions in spanish-tenses-app.js etc.), then
  calls buildEnglishCue() to get a natural-ish English sentence like
  "he just ate" for the forward (EN -> target language) prompt — and
  the exact same function is reused as the canonical reference answer
  for the reverse (target language -> EN) direction, so the two
  directions are always self-consistent even though nothing here is
  AI-generated.

  Six generic subject keys cover every language's person system:
    "i", "you", "heShe", "we", "youAll", "they"
  A language's person keys (e.g. Spanish's yo/tu/el/nosotros/vosotros/
  ellos) map onto these 1:1 — Japanese, having no grammatical person,
  simply omits the persons step and picks one at random per question
  for sentence variety (it doesn't affect the Japanese answer either
  way).
*/

(function (root) {
  const EnglishVerbForms =
    typeof module !== "undefined" && module.exports ? require("./english-verb-forms.js") : root.EnglishVerbForms;

  const SUBJECTS = {
    i: { pronoun: "I", plural: false, firstOrThird: "i" },
    you: { pronoun: "you", plural: false, firstOrThird: "you" },
    heShe: { pronoun: "he", plural: false, firstOrThird: "third" },
    we: { pronoun: "we", plural: true, firstOrThird: "plural" },
    youAll: { pronoun: "you all", plural: true, firstOrThird: "plural" },
    they: { pronoun: "they", plural: true, firstOrThird: "plural" },
  };

  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  // "be" is the one verb where EnglishVerbForms' past form is the
  // literal string "was/were" (can't resolve without knowing the
  // subject) — every other verb's forms.past is already usable as-is.
  function pastForm(forms, subjectKey) {
    if (forms.base !== "be") return forms.past;
    return subjectKey === "i" || subjectKey === "heShe" ? "was" : "were";
  }

  // "be" is fully irregular in the English present tense (am/is/are) —
  // every other verb just uses the base form, except 3rd person
  // singular which EnglishVerbForms already resolves correctly.
  function presentForm(forms, subjectKey) {
    if (forms.base === "be") {
      if (subjectKey === "i") return "am";
      if (subjectKey === "heShe") return "is";
      return "are";
    }
    return subjectKey === "heShe" ? forms.thirdPerson : forms.infinitive;
  }

  function haveAux(subjectKey) {
    return subjectKey === "heShe" ? "has" : "have";
  }

  // Builds the natural English cue sentence for one {gloss, category,
  // subjectKey} combination. `category` is one of the generic tense
  // categories below; unrecognized categories fall back to present
  // tense rather than returning null, so a not-yet-mapped tense still
  // produces something reasonable instead of breaking the quiz.
  function buildEnglishCue(englishGloss, category, subjectKey) {
    const forms = EnglishVerbForms.getEnglishForms(englishGloss);
    if (!forms) return null;
    const subj = SUBJECTS[subjectKey] || SUBJECTS.heShe;
    const pronoun = subj.pronoun;

    let sentence;
    switch (category) {
      case "preterite":
      case "past":
        sentence = `${pronoun} ${pastForm(forms, subjectKey)}.`;
        break;
      case "imperfect":
        sentence = forms.base === "be" ? `${pronoun} used to be.` : `${pronoun} used to ${forms.infinitive}.`;
        break;
      case "future":
        sentence = `${pronoun} will ${forms.infinitive}.`;
        break;
      case "conditional":
        sentence = `${pronoun} would ${forms.infinitive}.`;
        break;
      case "presentPerfect":
        sentence = `${pronoun} ${haveAux(subjectKey)} ${forms.pastParticiple}.`;
        break;
      case "pluperfect":
        sentence = `${pronoun} had ${forms.pastParticiple}.`;
        break;
      case "futurePerfect":
        sentence = `${pronoun} will have ${forms.pastParticiple}.`;
        break;
      case "conditionalPerfect":
        sentence = `${pronoun} would have ${forms.pastParticiple}.`;
        break;
      case "subjPresent":
        // English mandative subjunctive uses the bare base form for
        // every person, including he/she ("that he speak", not "speaks").
        sentence = `It's important that ${pronoun} ${forms.infinitive}.`;
        break;
      case "subjImperfect":
        // Hypothetical subjunctive "be" is "were" for every person
        // ("if I were", not "if I was") — the one place English
        // subjunctive mood overrides the ordinary past-tense form.
        sentence = `If ${pronoun} ${forms.base === "be" ? "were" : pastForm(forms, subjectKey)}...`;
        break;
      case "subjPresentPerfect":
        sentence = `It's important that ${pronoun} have ${forms.pastParticiple}.`;
        break;
      case "subjPluperfect":
        sentence = `If ${pronoun} had ${forms.pastParticiple}...`;
        break;
      case "subjFuture":
        sentence = `If ${pronoun} were to ${forms.infinitive}...`;
        break;
      case "imperativeAffirmative":
        sentence = subjectKey === "we" ? `Let's ${forms.infinitive}!` : `${capitalize(forms.infinitive)}!`;
        break;
      case "imperativeNegative":
        sentence = subjectKey === "we" ? `Let's not ${forms.infinitive}!` : `Don't ${forms.infinitive}!`;
        break;
      case "present":
      default:
        sentence = `${pronoun} ${presentForm(forms, subjectKey)}.`;
        break;
    }
    return capitalize(sentence);
  }

  // Lenient-ish local grading for the reverse (target language -> EN)
  // direction: normalizes case/punctuation/whitespace and treats a
  // handful of common contractions as equivalent, then compares against
  // the exact same cue this module would generate for the question —
  // no AI call, fully deterministic, and always in sync with the prompt.
  function normalizeForGrading(s) {
    return (s || "")
      .toLowerCase()
      .trim()
      .replace(/’/g, "'")
      .replace(/\bwon't\b/g, "will not")
      .replace(/\bdon't\b/g, "do not")
      .replace(/\bdoesn't\b/g, "does not")
      .replace(/\bdidn't\b/g, "did not")
      .replace(/\bhasn't\b/g, "has not")
      .replace(/\bhadn't\b/g, "had not")
      .replace(/\bisn't\b/g, "is not")
      .replace(/\bwasn't\b/g, "was not")
      .replace(/\bweren't\b/g, "were not")
      .replace(/\baren't\b/g, "are not")
      .replace(/\bi'm\b/g, "i am")
      .replace(/\bit's\b/g, "it is")
      .replace(/\blet's\b/g, "let us")
      .replace(/'ll\b/g, " will")
      .replace(/'d\b/g, " would")
      .replace(/'ve\b/g, " have")
      .replace(/[.!?]+$/g, "")
      .replace(/\.\.\.$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function checkReverseAnswer(typed, englishGloss, category, subjectKey) {
    const expected = buildEnglishCue(englishGloss, category, subjectKey);
    if (!expected) return { correct: false, expected: "" };
    return {
      correct: normalizeForGrading(typed) === normalizeForGrading(expected),
      expected,
    };
  }

  const ConjugationTestPrompts = {
    SUBJECTS,
    buildEnglishCue,
    normalizeForGrading,
    checkReverseAnswer,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ConjugationTestPrompts;
  } else {
    root.ConjugationTestPrompts = ConjugationTestPrompts;
  }
})(typeof window !== "undefined" ? window : globalThis);
