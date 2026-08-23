/*
  spanish-conjugator.js
  ----------------------
  Rule-based Spanish conjugation engine — no AI, no network call.
  Every form comes from spanish-verb-data.js: either the regular
  endings + a pattern flag (stem change / spelling change), or a
  hand-verified override for the cells that don't fit any pattern.

  Two jobs:
    1. conjugate(verb, tense, person) / getFullTable(verb) — build forms
       for the "generate a conjugation table" feature.
    2. detectVerbForm(typedWord) — given something the user typed (e.g.
       "hablo"), work out which verb/tense/person it is, so the app can
       offer to build a table for that verb. Works by building the full
       form table for every known verb once, then doing a plain lookup.
*/

(function (root) {
  const data =
    typeof module !== "undefined" && module.exports
      ? require("./spanish-verb-data.js")
      : root.SpanishVerbData;

  const {
    PERSON_KEYS,
    PERSON_LABELS,
    TENSE_KEYS,
    TENSE_LABELS,
    COMPOUND_TENSE_AUX,
    REGULAR_ENDINGS,
    STEM_CHANGE_MAP,
    PRETERITE_STEM_CHANGE_MAP,
    FUTURE_IRREGULAR_STEMS,
    IMPERFECT_OVERRIDES,
    PAST_PARTICIPLE_OVERRIDES,
    VERBS,
  } = data;

  function applyStemChange(stem, pattern) {
    const map = STEM_CHANGE_MAP[pattern];
    if (!map) return stem;
    const idx = stem.lastIndexOf(map.from);
    if (idx === -1) return stem;
    return stem.slice(0, idx) + map.to + stem.slice(idx + map.from.length);
  }

  // Orthographic-only changes so the stem's "hard" consonant sound is
  // kept before an "é" ending (spelling, not grammar).
  function applyPreteriteYoSpelling(infinitive, stem) {
    if (infinitive.endsWith("car")) return stem.slice(0, -1) + "qu";
    if (infinitive.endsWith("gar")) return stem.slice(0, -1) + "gu";
    if (infinitive.endsWith("zar")) return stem.slice(0, -1) + "c";
    return stem;
  }

  // Regular formula is bareStem + "ado" (-ar) / bareStem + "ido" (-er/-ir);
  // a short hand-verified list covers the handful that don't fit that.
  function getParticiple(verb) {
    if (PAST_PARTICIPLE_OVERRIDES[verb.infinitive]) return PAST_PARTICIPLE_OVERRIDES[verb.infinitive];
    const bareStem = verb.infinitive.slice(0, -2);
    return verb.type === "ar" ? bareStem + "ado" : bareStem + "ido";
  }

  function conjugate(verb, tense, person) {
    // 1. A hand-verified override always wins.
    const override = verb.overrides && verb.overrides[tense] && verb.overrides[tense][person];
    if (override) return override;

    const personIndex = PERSON_KEYS.indexOf(person);
    if (personIndex === -1) return null;

    // 2. Compound tenses: haber (in whichever simple tense is the
    // auxiliary for this one) + this verb's past participle.
    if (COMPOUND_TENSE_AUX[tense]) {
      const haberVerb = findVerb("haber");
      const auxForm = conjugate(haberVerb, COMPOUND_TENSE_AUX[tense], person);
      if (!auxForm) return null;
      return `${auxForm} ${getParticiple(verb)}`;
    }

    // 3. Imperfect: only ir/ser/ver are irregular, everything else regular.
    if (tense === "imperfect") {
      if (IMPERFECT_OVERRIDES[verb.infinitive]) {
        return IMPERFECT_OVERRIDES[verb.infinitive][personIndex];
      }
      const bareStem = verb.infinitive.slice(0, -2);
      return bareStem + REGULAR_ENDINGS.imperfect[verb.type][personIndex];
    }

    // 4. Future: regular stem is the infinitive itself unless the verb
    // has an irregular future stem; endings are always regular.
    if (tense === "future") {
      const stem = FUTURE_IRREGULAR_STEMS[verb.infinitive] || verb.infinitive;
      return stem + REGULAR_ENDINGS.future[personIndex];
    }

    // 5. Conditional: same irregular stems as future, different endings.
    if (tense === "conditional") {
      const stem = FUTURE_IRREGULAR_STEMS[verb.infinitive] || verb.infinitive;
      return stem + REGULAR_ENDINGS.conditional[personIndex];
    }

    const bareStem = verb.infinitive.slice(0, -2);
    const isNosotrosVosotros = person === "nosotros" || person === "vosotros";

    if (tense === "present") {
      let stem = bareStem;
      if (verb.stemChange && !isNosotrosVosotros) {
        stem = applyStemChange(stem, verb.stemChange);
      }
      return stem + REGULAR_ENDINGS.present[verb.type][personIndex];
    }

    if (tense === "preterite") {
      let stem = bareStem;
      const isElOrEllos = person === "el" || person === "ellos";
      if (verb.type === "ir" && verb.preteriteStemChange && isElOrEllos) {
        const pattern = PRETERITE_STEM_CHANGE_MAP[verb.stemChange];
        if (pattern) stem = applyStemChange(stem, pattern);
      }
      if (person === "yo") {
        stem = applyPreteriteYoSpelling(verb.infinitive, stem);
      }
      const endingSet = verb.type === "ar" ? REGULAR_ENDINGS.preterite.ar : REGULAR_ENDINGS.preterite.er;
      return stem + endingSet[personIndex];
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

  function findVerb(infinitive) {
    if (!infinitive) return null;
    const needle = infinitive.trim().toLowerCase();
    return VERBS.find((v) => v.infinitive === needle) || null;
  }

  // Built lazily, once, on first use. Two indices: "exact" (accents as
  // written) and "loose" (accents stripped) — exact is tried first so a
  // correctly-accented "hablo" doesn't get muddied with "habló", but a
  // missing accent ("comia" for "comía") still gets found via loose.
  let exactIndex = null;
  let looseIndex = null;
  function buildFormIndexes() {
    exactIndex = new Map();
    looseIndex = new Map();
    VERBS.forEach((verb) => {
      TENSE_KEYS.forEach((tense) => {
        PERSON_KEYS.forEach((person) => {
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
      });
    });
  }

  // Most people don't bother typing Spanish accents on a US keyboard
  // ("comia" instead of "comía") — this strips them for the fallback,
  // accent-insensitive lookup.
  function normalizeForMatch(text) {
    return text
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  }

  // Returns an array of { infinitive, tense, person } matches, or null
  // if the typed word isn't a known conjugated form of any curated verb.
  // (Multiple matches happen — e.g. "trabajo" is also the noun "work",
  // or "comía" being both yo and él/ella/usted in the imperfect.)
  function detectVerbForm(typedWord) {
    if (!typedWord) return null;
    if (!exactIndex) buildFormIndexes();

    const exact = exactIndex.get(typedWord.trim().toLowerCase());
    if (exact && exact.length) return exact;

    const loose = looseIndex.get(normalizeForMatch(typedWord));
    return loose && loose.length ? loose : null;
  }

  const SpanishConjugator = {
    VERBS,
    TENSE_KEYS,
    TENSE_LABELS,
    PERSON_KEYS,
    PERSON_LABELS,
    conjugate,
    getFullTable,
    findVerb,
    detectVerbForm,
    normalizeForMatch,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = SpanishConjugator;
  } else {
    root.SpanishConjugator = SpanishConjugator;
  }
})(typeof window !== "undefined" ? window : globalThis);
