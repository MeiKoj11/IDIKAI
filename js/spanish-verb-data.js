/*
  spanish-verb-data.js
  ---------------------
  Raw data for the rule-based Spanish conjugator: regular endings,
  stem-change / spelling-change patterns, and a curated list of verbs.

  Every form is either:
    a) computed from REGULAR_ENDINGS + a pattern flag on the verb, or
    b) a hand-verified "override" for the handful of cells that don't
       follow any general pattern (e.g. ser, ir, irregular yo-forms).

  Curated verb count is intentionally modest (accuracy over coverage) —
  add more verbs to VERBS below following the same shape; the
  conjugator and detector automatically pick up anything added here.
*/

// yo / tú / él-ella-usted / nosotros / vosotros / ellos-ellas-ustedes
const PERSON_KEYS = ["yo", "tu", "el", "nosotros", "vosotros", "ellos"];
const PERSON_LABELS = {
  yo: "yo",
  tu: "tú",
  el: "él / ella / usted",
  nosotros: "nosotros/as",
  vosotros: "vosotros/as",
  ellos: "ellos / ellas / ustedes",
};

// Four simple tenses, one simple "conditional" tense, and four compound
// (perfect) tenses built from haber + a past participle.
const TENSE_KEYS = [
  "present",
  "preterite",
  "imperfect",
  "future",
  "conditional",
  "presentPerfect",
  "pluperfect",
  "futurePerfect",
  "conditionalPerfect",
];
const TENSE_LABELS = {
  present: "Present",
  preterite: "Preterite",
  imperfect: "Imperfect",
  future: "Future",
  conditional: "Conditional",
  presentPerfect: "Present Perfect",
  pluperfect: "Pluperfect",
  futurePerfect: "Future Perfect",
  conditionalPerfect: "Conditional Perfect",
};

// Which simple tense of "haber" forms the auxiliary for each compound
// tense (e.g. pluperfect = imperfect of haber + participle).
const COMPOUND_TENSE_AUX = {
  presentPerfect: "present",
  pluperfect: "imperfect",
  futurePerfect: "future",
  conditionalPerfect: "conditional",
};

const REGULAR_ENDINGS = {
  present: {
    ar: ["o", "as", "a", "amos", "áis", "an"],
    er: ["o", "es", "e", "emos", "éis", "en"],
    ir: ["o", "es", "e", "imos", "ís", "en"],
  },
  preterite: {
    ar: ["é", "aste", "ó", "amos", "asteis", "aron"],
    er: ["í", "iste", "ió", "imos", "isteis", "ieron"],
  },
  imperfect: {
    ar: ["aba", "abas", "aba", "ábamos", "abais", "aban"],
    er: ["ía", "ías", "ía", "íamos", "íais", "ían"],
    ir: ["ía", "ías", "ía", "íamos", "íais", "ían"],
  },
  future: ["é", "ás", "á", "emos", "éis", "án"],
  // Same endings as imperfect er/ir, but applied to the infinitive (or
  // the same irregular stem future uses) rather than the bare stem.
  conditional: ["ía", "ías", "ía", "íamos", "íais", "ían"],
  // Present subjunctive: -ar verbs take "opposite" (-er/-ir-style)
  // endings and vice versa — unlike indicative present, -er and -ir
  // verbs share identical subjunctive endings (no imos/ís split).
  subjPresentAr: ["e", "es", "e", "emos", "éis", "en"],
  subjPresentOther: ["a", "as", "a", "amos", "áis", "an"],
};

// Past participles (for the compound tenses): regular formula is
// bareStem + "ado" (-ar) or bareStem + "ido" (-er/-ir); anything not
// following that pattern is a hand-verified override.
const PAST_PARTICIPLE_OVERRIDES = {
  hacer: "hecho",
  decir: "dicho",
  ver: "visto",
  poner: "puesto",
  volver: "vuelto",
  escribir: "escrito",
  abrir: "abierto",
  // "traer" is regular in shape (tra + ído) but needs the accent mark —
  // an unstressed i after a strong vowel that's itself stressed always
  // takes one (same reason leer -> leído, creer -> creído).
  traer: "traído",
};

// Present-tense vowel change, applied to the stem's last matching vowel,
// for every person except nosotros/vosotros.
const STEM_CHANGE_MAP = {
  "e-ie": { from: "e", to: "ie" },
  "o-ue": { from: "o", to: "ue" },
  "e-i": { from: "e", to: "i" },
  "u-ue": { from: "u", to: "ue" },
  "o-u": { from: "o", to: "u" }, // preterite-only pattern (dormir -> durmió)
};

// -ir verbs with preteriteStemChange:true also change in the preterite,
// but only in the él/ellos rows, and the vowel shift is different from
// the present-tense one.
const PRETERITE_STEM_CHANGE_MAP = {
  "e-ie": "e-i", // sentir: siento (present) -> sintió (preterite)
  "o-ue": "o-u", // dormir: duermo (present) -> durmió (preterite)
  "e-i": "e-i", // pedir: pido (present) -> pidió (preterite)
};

// Irregular future stems (endings stay regular: é, ás, á, emos, éis, án).
const FUTURE_IRREGULAR_STEMS = {
  decir: "dir",
  hacer: "har",
  poder: "podr",
  poner: "pondr",
  querer: "querr",
  saber: "sabr",
  salir: "saldr",
  tener: "tendr",
  valer: "valdr",
  venir: "vendr",
  haber: "habr",
  caber: "cabr",
};

// Only three verbs are irregular in the imperfect.
const IMPERFECT_OVERRIDES = {
  ir: ["iba", "ibas", "iba", "íbamos", "ibais", "iban"],
  ser: ["era", "eras", "era", "éramos", "erais", "eran"],
  ver: ["veía", "veías", "veía", "veíamos", "veíais", "veían"],
};

const VERBS = [
  // --- Fully regular: present/preterite/imperfect/future are all
  // computed purely from REGULAR_ENDINGS, no overrides at all. ---
  { infinitive: "hablar", english: "to speak", type: "ar" },
  { infinitive: "comer", english: "to eat", type: "er" },
  { infinitive: "vivir", english: "to live", type: "ir" },
  { infinitive: "estudiar", english: "to study", type: "ar" },
  { infinitive: "trabajar", english: "to work", type: "ar" },
  { infinitive: "comprar", english: "to buy", type: "ar" },
  { infinitive: "escuchar", english: "to listen", type: "ar" },
  { infinitive: "aprender", english: "to learn", type: "er" },
  { infinitive: "beber", english: "to drink", type: "er" },
  { infinitive: "escribir", english: "to write", type: "ir" },
  { infinitive: "abrir", english: "to open", type: "ir" },
  { infinitive: "decidir", english: "to decide", type: "ir" },
  { infinitive: "ayudar", english: "to help", type: "ar" },
  { infinitive: "viajar", english: "to travel", type: "ar" },
  { infinitive: "cocinar", english: "to cook", type: "ar" },
  { infinitive: "cantar", english: "to sing", type: "ar" },
  { infinitive: "caminar", english: "to walk", type: "ar" },
  { infinitive: "mirar", english: "to look at / watch", type: "ar" },
  { infinitive: "tomar", english: "to take / drink", type: "ar" },
  // -car / -gar / -zar: only the preterite yo-form needs a spelling
  // tweak (handled generically in the conjugator), everything else
  // is fully regular.
  { infinitive: "buscar", english: "to look for", type: "ar" },
  { infinitive: "llegar", english: "to arrive", type: "ar" },
  { infinitive: "practicar", english: "to practice", type: "ar" },

  // --- Present-tense stem-changers only. Preterite/imperfect/future
  // are fully regular for these (true for every -ar and -er
  // stem-changing verb — only -ir stem-changers carry into the
  // preterite). ---
  { infinitive: "pensar", english: "to think", type: "ar", stemChange: "e-ie" },
  { infinitive: "cerrar", english: "to close", type: "ar", stemChange: "e-ie" },
  { infinitive: "empezar", english: "to begin", type: "ar", stemChange: "e-ie" },
  { infinitive: "entender", english: "to understand", type: "er", stemChange: "e-ie" },
  { infinitive: "perder", english: "to lose", type: "er", stemChange: "e-ie" },
  { infinitive: "volver", english: "to return", type: "er", stemChange: "o-ue" },
  { infinitive: "encontrar", english: "to find", type: "ar", stemChange: "o-ue" },
  { infinitive: "mostrar", english: "to show", type: "ar", stemChange: "o-ue" },
  { infinitive: "jugar", english: "to play", type: "ar", stemChange: "u-ue" },

  // --- -ir stem-changers that ALSO shift in the preterite él/ellos
  // rows (preteriteStemChange:true tells the conjugator to apply
  // PRETERITE_STEM_CHANGE_MAP there). ---
  { infinitive: "pedir", english: "to ask for", type: "ir", stemChange: "e-i", preteriteStemChange: true },
  { infinitive: "dormir", english: "to sleep", type: "ir", stemChange: "o-ue", preteriteStemChange: true },
  { infinitive: "sentir", english: "to feel", type: "ir", stemChange: "e-ie", preteriteStemChange: true },
  {
    infinitive: "seguir",
    english: "to follow / continue",
    type: "ir",
    stemChange: "e-i",
    preteriteStemChange: true,
    // "gu" only needs the u before e/i to keep the hard-g sound; before
    // an "o" ending it's dropped for spelling — sigo, not siguo.
    overrides: { present: { yo: "sigo" } },
  },

  // --- Fully irregular verbs. Every cell below is a hand-verified
  // form, not a computed one. ---
  {
    // Auxiliary verb used internally to build the four compound tenses
    // (he/había/habré/habría + participle) — also a normal curated verb
    // in its own right ("hay" aside, which isn't part of this
    // person-based paradigm and isn't included here).
    infinitive: "haber",
    english: "to have (auxiliary)",
    type: "er",
    irregular: true,
    overrides: {
      present: { yo: "he", tu: "has", el: "ha", nosotros: "hemos", vosotros: "habéis", ellos: "han" },
      // Irregular "hub-" stem — not the regular "habí-" the formula
      // would otherwise produce. This also feeds the new Subjunctive
      // Imperfect/Future/Pluperfect, which derive from this form.
      preterite: { yo: "hube", tu: "hubiste", el: "hubo", nosotros: "hubimos", vosotros: "hubisteis", ellos: "hubieron" },
    },
  },
  {
    infinitive: "ser",
    english: "to be",
    type: "er",
    irregular: true,
    overrides: {
      present: { yo: "soy", tu: "eres", el: "es", nosotros: "somos", vosotros: "sois", ellos: "son" },
      preterite: { yo: "fui", tu: "fuiste", el: "fue", nosotros: "fuimos", vosotros: "fuisteis", ellos: "fueron" },
    },
  },
  {
    infinitive: "estar",
    english: "to be (location / state)",
    type: "ar",
    irregular: true,
    overrides: {
      present: { yo: "estoy", tu: "estás", el: "está", nosotros: "estamos", vosotros: "estáis", ellos: "están" },
      preterite: { yo: "estuve", tu: "estuviste", el: "estuvo", nosotros: "estuvimos", vosotros: "estuvisteis", ellos: "estuvieron" },
    },
  },
  {
    infinitive: "ir",
    english: "to go",
    type: "ir",
    irregular: true,
    overrides: {
      present: { yo: "voy", tu: "vas", el: "va", nosotros: "vamos", vosotros: "vais", ellos: "van" },
      preterite: { yo: "fui", tu: "fuiste", el: "fue", nosotros: "fuimos", vosotros: "fuisteis", ellos: "fueron" },
    },
  },
  {
    infinitive: "dar",
    english: "to give",
    type: "ar",
    irregular: true,
    overrides: {
      present: { yo: "doy", tu: "das", el: "da", nosotros: "damos", vosotros: "dais", ellos: "dan" },
      preterite: { yo: "di", tu: "diste", el: "dio", nosotros: "dimos", vosotros: "disteis", ellos: "dieron" },
    },
  },
  {
    infinitive: "ver",
    english: "to see",
    type: "er",
    irregular: true,
    overrides: {
      present: { yo: "veo", tu: "ves", el: "ve", nosotros: "vemos", vosotros: "veis", ellos: "ven" },
      preterite: { yo: "vi", tu: "viste", el: "vio", nosotros: "vimos", vosotros: "visteis", ellos: "vieron" },
    },
  },
  {
    infinitive: "hacer",
    english: "to do / make",
    type: "er",
    irregular: true,
    overrides: {
      present: { yo: "hago" },
      preterite: { yo: "hice", tu: "hiciste", el: "hizo", nosotros: "hicimos", vosotros: "hicisteis", ellos: "hicieron" },
    },
  },
  {
    infinitive: "tener",
    english: "to have",
    type: "er",
    irregular: true,
    stemChange: "e-ie",
    overrides: {
      present: { yo: "tengo" },
      preterite: { yo: "tuve", tu: "tuviste", el: "tuvo", nosotros: "tuvimos", vosotros: "tuvisteis", ellos: "tuvieron" },
    },
  },
  {
    infinitive: "poder",
    english: "to be able to",
    type: "er",
    irregular: true,
    stemChange: "o-ue",
    overrides: {
      preterite: { yo: "pude", tu: "pudiste", el: "pudo", nosotros: "pudimos", vosotros: "pudisteis", ellos: "pudieron" },
    },
  },
  {
    infinitive: "querer",
    english: "to want / love",
    type: "er",
    irregular: true,
    stemChange: "e-ie",
    overrides: {
      preterite: { yo: "quise", tu: "quisiste", el: "quiso", nosotros: "quisimos", vosotros: "quisisteis", ellos: "quisieron" },
    },
  },
  {
    infinitive: "decir",
    english: "to say / tell",
    type: "ir",
    irregular: true,
    stemChange: "e-i",
    overrides: {
      present: { yo: "digo" },
      preterite: { yo: "dije", tu: "dijiste", el: "dijo", nosotros: "dijimos", vosotros: "dijisteis", ellos: "dijeron" },
    },
  },
  {
    infinitive: "venir",
    english: "to come",
    type: "ir",
    irregular: true,
    stemChange: "e-ie",
    overrides: {
      present: { yo: "vengo" },
      preterite: { yo: "vine", tu: "viniste", el: "vino", nosotros: "vinimos", vosotros: "vinisteis", ellos: "vinieron" },
    },
  },
  {
    infinitive: "salir",
    english: "to leave / go out",
    type: "ir",
    irregular: true,
    overrides: { present: { yo: "salgo" } },
  },
  {
    infinitive: "poner",
    english: "to put",
    type: "er",
    irregular: true,
    overrides: {
      present: { yo: "pongo" },
      preterite: { yo: "puse", tu: "pusiste", el: "puso", nosotros: "pusimos", vosotros: "pusisteis", ellos: "pusieron" },
    },
  },
  {
    infinitive: "traer",
    english: "to bring",
    type: "er",
    irregular: true,
    overrides: {
      present: { yo: "traigo" },
      preterite: { yo: "traje", tu: "trajiste", el: "trajo", nosotros: "trajimos", vosotros: "trajisteis", ellos: "trajeron" },
    },
  },
  {
    infinitive: "saber",
    english: "to know (facts)",
    type: "er",
    irregular: true,
    overrides: {
      present: { yo: "sé" },
      // Irregular "sup-" stem in the preterite (supe, not "sabí").
      preterite: { yo: "supe", tu: "supiste", el: "supo", nosotros: "supimos", vosotros: "supisteis", ellos: "supieron" },
    },
  },
  {
    infinitive: "conocer",
    english: "to know (people / places)",
    type: "er",
    irregular: true,
    overrides: { present: { yo: "conozco" } },
  },
];

// ---------------------------------------------------------------------
// Subjunctive + Imperative — added alongside the original Indicative-
// only tense set above. Almost none of this needs new hand-verified
// per-verb data: present subjunctive derives from the (already-correct)
// present-indicative yo form; imperfect/future subjunctive derive from
// the (already-correct) preterite ellos form; imperative derives mostly
// from present indicative / present subjunctive. See the derivation
// functions in spanish-conjugator.js. The only genuinely irregular data
// needed is below: 6 present-subjunctive stem exceptions and 9
// imperative-affirmative exceptions.
// ---------------------------------------------------------------------

const MOOD_KEYS = ["indicative", "subjunctive", "imperative"];

const SUBJUNCTIVE_TENSE_KEYS = ["subjPresent", "subjImperfect", "subjImperfectSe", "subjFuture", "subjPresentPerfect", "subjPluperfect"];
const SUBJUNCTIVE_TENSE_LABELS = {
  subjPresent: "Present",
  subjImperfect: "Imperfect (-ra)",
  subjImperfectSe: "Imperfect (-se)",
  subjFuture: "Future",
  subjPresentPerfect: "Present Perfect",
  subjPluperfect: "Past Perfect",
};

// -ra and -se are both fully correct, interchangeable in almost every
// context (-ra is more common in speech, -se more common in formal
// writing) — treated as two separate tense keys so both can be shown,
// but the quiz accepts either as correct for "Imperfect Subjunctive".
const SUBJUNCTIVE_IMPERFECT_VARIANT_OF = { subjImperfectSe: "subjImperfect" };

const IMPERATIVE_TENSE_KEYS = ["imperativeAffirmative", "imperativeNegative"];
const IMPERATIVE_TENSE_LABELS = {
  imperativeAffirmative: "Affirmative",
  imperativeNegative: "Negative",
};
// Imperative has no "yo" form — commands aren't given to yourself.
const IMPERATIVE_PERSON_KEYS = ["tu", "el", "nosotros", "vosotros", "ellos"];

// Present subjunctive is built from the present-indicative yo form
// (already correct, including irregular yo's like tengo/hago/salgo) —
// strip the final "o" and add the "opposite" ending. These six verbs
// are the only ones whose present-yo form does NOT end in "o", so the
// strip-and-swap trick can't apply — hand-verified in full instead.
const SUBJUNCTIVE_PRESENT_OVERRIDES = {
  ser: ["sea", "seas", "sea", "seamos", "seáis", "sean"],
  estar: ["esté", "estés", "esté", "estemos", "estéis", "estén"],
  ir: ["vaya", "vayas", "vaya", "vayamos", "vayáis", "vayan"],
  dar: ["dé", "des", "dé", "demos", "deis", "den"],
  saber: ["sepa", "sepas", "sepa", "sepamos", "sepáis", "sepan"],
  haber: ["haya", "hayas", "haya", "hayamos", "hayáis", "hayan"],
};

// Which simple SUBJUNCTIVE tense of "haber" forms each compound
// subjunctive tense — same idea as COMPOUND_TENSE_AUX above, just
// pointing at subjunctive tenses instead of indicative ones. Reuses
// the exact same compound-tense code path in the conjugator.
const SUBJUNCTIVE_COMPOUND_AUX = {
  subjPresentPerfect: "subjPresent",
  subjPluperfect: "subjImperfect",
};

// tú affirmative commands are normally just the present-indicative
// él/ella/usted form — these 8 verbs are the well-known exceptions.
const IMPERATIVE_TU_AFFIRMATIVE_OVERRIDES = {
  decir: "di",
  hacer: "haz",
  ir: "ve",
  poner: "pon",
  salir: "sal",
  ser: "sé",
  tener: "ten",
  venir: "ven",
};

// nosotros affirmative ("let's...") is normally the present-subjunctive
// nosotros form — "ir" is the one common exception ("vamos", not the
// technically-correct-but-almost-never-used "vayamos").
const IMPERATIVE_NOSOTROS_AFFIRMATIVE_OVERRIDES = {
  ir: "vamos",
};

const SpanishVerbData = {
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
  MOOD_KEYS,
  SUBJUNCTIVE_TENSE_KEYS,
  SUBJUNCTIVE_TENSE_LABELS,
  SUBJUNCTIVE_IMPERFECT_VARIANT_OF,
  IMPERATIVE_TENSE_KEYS,
  IMPERATIVE_TENSE_LABELS,
  IMPERATIVE_PERSON_KEYS,
  SUBJUNCTIVE_PRESENT_OVERRIDES,
  SUBJUNCTIVE_COMPOUND_AUX,
  IMPERATIVE_TU_AFFIRMATIVE_OVERRIDES,
  IMPERATIVE_NOSOTROS_AFFIRMATIVE_OVERRIDES,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = SpanishVerbData;
} else {
  window.SpanishVerbData = SpanishVerbData;
}
