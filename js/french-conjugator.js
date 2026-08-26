/*
  french-conjugator.js
  ---------------------
  Rule-based French conjugation engine — no AI, no network call. Same
  two jobs and overall shape as spanish-conjugator.js:
    1. conjugate(verb, tense, person) / getFullTable(verb) — build forms
       for the "generate a conjugation table" feature.
    2. detectVerbForm(typedWord) — reverse lookup from a typed form back
       to { infinitive, tense, person }.

  The genuinely French-specific piece is compound tenses choosing avoir
  OR être as the auxiliary (per-verb, via AUX_ETRE_VERBS), with a
  simplified past-participle agreement for être verbs (adds "s" for
  nous/vous/ils, i.e. always the masculine-plural-or-singular default —
  real agreement also depends on the subject's actual gender, which a
  bare person-pronoun table has no way to know, so this picks the same
  simplification most reference conjugation tables use).
*/

(function (root) {
  const data =
    typeof module !== "undefined" && module.exports
      ? require("./french-verb-data.js")
      : root.FrenchVerbData;

  const {
    PERSON_KEYS,
    PERSON_LABELS,
    TENSE_KEYS,
    TENSE_LABELS,
    CONDITIONAL_TENSE_KEYS,
    CONDITIONAL_TENSE_LABELS,
    SUBJUNCTIVE_TENSE_KEYS,
    SUBJUNCTIVE_TENSE_LABELS,
    IMPERATIVE_PERSON_KEYS,
    IMPERATIVE_TENSE_KEYS,
    IMPERATIVE_TENSE_LABELS,
    COMPOUND_TENSE_AUX,
    REGULAR_ENDINGS,
    AUX_ETRE_VERBS,
    PAST_PARTICIPLE_OVERRIDES,
    FUTURE_IRREGULAR_STEMS,
    IMPARFAIT_STEM_OVERRIDES,
    SPELLING_CHANGE_VERBS,
    SUBJUNCTIVE_PRESENT_OVERRIDES,
    IMPERATIVE_OVERRIDES,
    VERBS,
  } = data;

  const ALL_TENSE_KEYS = TENSE_KEYS.concat(CONDITIONAL_TENSE_KEYS, SUBJUNCTIVE_TENSE_KEYS, IMPERATIVE_TENSE_KEYS);
  const ALL_TENSE_LABELS = Object.assign({}, TENSE_LABELS, CONDITIONAL_TENSE_LABELS, SUBJUNCTIVE_TENSE_LABELS, IMPERATIVE_TENSE_LABELS);

  function findVerb(infinitive) {
    if (!infinitive) return null;
    const needle = infinitive.trim().toLowerCase();
    return VERBS.find((v) => v.infinitive === needle) || null;
  }

  function bareStem(verb) {
    return verb.infinitive.slice(0, -2);
  }

  // -ger/-cer verbs only actually need the spelling tweak in front of
  // an ending that starts with "a" or "o" (before "e"/"i", g and c are
  // already soft on their own).
  function applySpellingChange(verb, stem, ending) {
    if (!verb.spellingChange) return stem;
    const needsChange = ending && (ending[0] === "a" || ending[0] === "o");
    if (!needsChange) return stem;
    if (verb.spellingChange === "ger") return stem + "e";
    if (verb.spellingChange === "cer") return stem.slice(0, -1) + "ç";
    return stem;
  }

  function getAux(verb) {
    return verb.aux === "être" || AUX_ETRE_VERBS.has(verb.infinitive) ? "être" : "avoir";
  }

  function getParticiple(verb) {
    if (PAST_PARTICIPLE_OVERRIDES[verb.infinitive]) return PAST_PARTICIPLE_OVERRIDES[verb.infinitive];
    const stem = bareStem(verb);
    if (verb.type === "er") return stem + "é";
    if (verb.type === "ir") return stem + "i";
    return stem + "u";
  }

  // Simplified agreement — see file header. nous/vous/ils all get the
  // "plural" form; je/tu/il stay masculine-singular (no added letter).
  function agreeParticiple(participle, aux, person) {
    if (aux !== "être") return participle;
    if (person === "nous" || person === "vous" || person === "ils") {
      return participle.endsWith("s") ? participle : participle + "s";
    }
    return participle;
  }

  // The imperfect stem is also what nous/vous borrow for the present
  // subjunctive (see subjPresentStem below) — same derivation either
  // way: the "nous" present form minus "-ons", which correctly carries
  // over any présent irregularity (faisons -> fais-, disons -> dis-)
  // without carrying over a -ger/-cer spelling tweak that only belongs
  // in the nous-present cell itself (mangeons has the tweak; mangions,
  // in the imperfect, doesn't).
  function imparfaitStem(verb) {
    if (IMPARFAIT_STEM_OVERRIDES[verb.infinitive]) return IMPARFAIT_STEM_OVERRIDES[verb.infinitive];
    if (verb.spellingChange) return bareStem(verb);
    const nousForm = conjugate(verb, "present", "nous");
    return nousForm.slice(0, -3); // strip "ons"
  }

  function futureStem(verb) {
    if (FUTURE_IRREGULAR_STEMS[verb.infinitive]) return FUTURE_IRREGULAR_STEMS[verb.infinitive];
    return verb.type === "re" ? verb.infinitive.slice(0, -1) : verb.infinitive;
  }

  // je/tu/il/ils come from the "ils" present form minus "-ent"; nous/
  // vous borrow the imperfect stem instead (the classic French
  // subjunctive "split stem" — most visible in boot verbs like venir:
  // que je vienne / que nous venions).
  function subjPresentStem(verb, person) {
    if (person === "nous" || person === "vous") return imparfaitStem(verb);
    const ilsForm = conjugate(verb, "present", "ils");
    return ilsForm.slice(0, -3); // strip "ent"
  }

  function conjugateImperativePresent(verb, person) {
    if (IMPERATIVE_OVERRIDES[verb.infinitive] && IMPERATIVE_OVERRIDES[verb.infinitive][person]) {
      return IMPERATIVE_OVERRIDES[verb.infinitive][person];
    }
    let form = conjugate(verb, "present", person);
    if (!form) return null;
    // -er verbs (and aller, which conjugates like one here) drop the
    // final "s" from tu-présent: (tu) parles -> Parle !
    if (person === "tu" && verb.type === "er" && form.endsWith("s")) {
      form = form.slice(0, -1);
    }
    return form;
  }

  function conjugate(verb, tense, person) {
    // 1. A hand-verified override always wins.
    const override = verb.overrides && verb.overrides[tense] && verb.overrides[tense][person];
    if (override) return override;

    const idx = PERSON_KEYS.indexOf(person);
    if (idx === -1) return null;

    // 2. Compound tenses: avoir/être (whichever this verb takes) in
    // the mapped simple tense, + this verb's agreed past participle.
    if (COMPOUND_TENSE_AUX[tense]) {
      const aux = getAux(verb);
      const auxVerb = findVerb(aux);
      const auxForm = conjugate(auxVerb, COMPOUND_TENSE_AUX[tense], person);
      if (!auxForm) return null;
      const participle = agreeParticiple(getParticiple(verb), aux, person);
      return `${auxForm} ${participle}`;
    }

    if (tense === "present") {
      const ending = REGULAR_ENDINGS.present[verb.type][idx];
      const stem = applySpellingChange(verb, bareStem(verb), ending);
      return stem + ending;
    }

    if (tense === "imperfect") {
      const ending = REGULAR_ENDINGS.imperfect[idx];
      const stem = applySpellingChange(verb, imparfaitStem(verb), ending);
      return stem + ending;
    }

    if (tense === "future") {
      return futureStem(verb) + REGULAR_ENDINGS.future[idx];
    }

    if (tense === "conditionalPresent") {
      return futureStem(verb) + REGULAR_ENDINGS.conditionalPresent[idx];
    }

    if (tense === "subjPresent") {
      if (SUBJUNCTIVE_PRESENT_OVERRIDES[verb.infinitive]) {
        return SUBJUNCTIVE_PRESENT_OVERRIDES[verb.infinitive][idx];
      }
      return subjPresentStem(verb, person) + REGULAR_ENDINGS.subjPresent[idx];
    }

    if (tense === "imperativePresent") {
      if (person !== "tu" && person !== "nous" && person !== "vous") return null;
      return conjugateImperativePresent(verb, person);
    }

    return null;
  }

  function getFullTable(verb, tenses, persons) {
    const useTenses = tenses && tenses.length ? tenses : TENSE_KEYS;
    const usePersons = persons && persons.length ? persons : PERSON_KEYS;
    const table = {};
    useTenses.forEach((tense) => {
      table[tense] = {};
      usePersons.forEach((person) => {
        table[tense][person] = conjugate(verb, tense, person);
      });
    });
    return table;
  }

  // Same accent/case-insensitive convention as SpanishConjugator's
  // normalizeForMatch, reused here for grading and for the loose index.
  function normalizeForMatch(text) {
    return text
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  }

  let exactIndex = null;
  let looseIndex = null;
  function buildFormIndexes() {
    exactIndex = new Map();
    looseIndex = new Map();
    function indexTense(verb, tense, persons) {
      persons.forEach((person) => {
        const form = conjugate(verb, tense, person);
        if (!form) return;
        const match = { infinitive: verb.infinitive, tense, person };

        const exactKey = form.toLowerCase();
        if (!exactIndex.has(exactKey)) exactIndex.set(exactKey, []);
        exactIndex.get(exactKey).push(match);

        const looseKey = normalizeForMatch(form);
        if (!looseIndex.has(looseKey)) looseIndex.set(looseKey, []);
        looseIndex.get(looseKey).push(match);
      });
    }
    VERBS.forEach((verb) => {
      TENSE_KEYS.concat(CONDITIONAL_TENSE_KEYS, SUBJUNCTIVE_TENSE_KEYS).forEach((tense) => indexTense(verb, tense, PERSON_KEYS));
      IMPERATIVE_TENSE_KEYS.forEach((tense) => indexTense(verb, tense, IMPERATIVE_PERSON_KEYS));
    });
  }

  function detectVerbForm(typedWord) {
    if (!typedWord) return null;
    if (!exactIndex) buildFormIndexes();

    const exact = exactIndex.get(typedWord.trim().toLowerCase());
    if (exact && exact.length) return exact;

    const loose = looseIndex.get(normalizeForMatch(typedWord));
    return loose && loose.length ? loose : null;
  }

  const FrenchConjugator = {
    VERBS,
    TENSE_KEYS,
    TENSE_LABELS,
    PERSON_KEYS,
    PERSON_LABELS,
    CONDITIONAL_TENSE_KEYS,
    CONDITIONAL_TENSE_LABELS,
    SUBJUNCTIVE_TENSE_KEYS,
    SUBJUNCTIVE_TENSE_LABELS,
    IMPERATIVE_PERSON_KEYS,
    IMPERATIVE_TENSE_KEYS,
    IMPERATIVE_TENSE_LABELS,
    ALL_TENSE_KEYS,
    ALL_TENSE_LABELS,
    conjugate,
    getFullTable,
    findVerb,
    detectVerbForm,
    normalizeForMatch,
    getAux,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = FrenchConjugator;
  } else {
    root.FrenchConjugator = FrenchConjugator;
  }
})(typeof window !== "undefined" ? window : globalThis);
