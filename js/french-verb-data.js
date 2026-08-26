/*
  french-verb-data.js
  --------------------
  Rule-based French conjugation data, same philosophy as
  spanish-verb-data.js: regular formulas + a pattern flag on the verb
  for the common cases, hand-verified overrides for the cells that
  don't fit any pattern. Loaded by french-conjugator.js.

  Three verb groups (by infinitive ending):
    "er" — 1st group (parler)      — by far the most common, regular
    "ir" — 2nd group (finir)       — regular, -iss- infix in plural
    "re" — 3rd group (vendre)      — "regular" 3rd-group pattern, but
                                      most 3rd-group verbs are actually
                                      irregular and get hand overrides

  Infinitives are written with their real accents (être, écrire,
  connaître...) since they're shown to the user directly — every
  override map below is keyed the same way, so lookups always match.
*/

const PERSON_KEYS = ["je", "tu", "il", "nous", "vous", "ils"];
const PERSON_LABELS = {
  je: "je",
  tu: "tu",
  il: "il / elle / on",
  nous: "nous",
  vous: "vous",
  ils: "ils / elles",
};

const TENSE_KEYS = ["present", "imperfect", "passeCompose", "pluperfect", "future", "futurePerfect"];
const TENSE_LABELS = {
  present: "Présent",
  imperfect: "Imparfait",
  passeCompose: "Passé Composé",
  pluperfect: "Plus-que-parfait",
  future: "Futur Simple",
  futurePerfect: "Futur Antérieur",
};

const CONDITIONAL_TENSE_KEYS = ["conditionalPresent", "conditionalPast"];
const CONDITIONAL_TENSE_LABELS = {
  conditionalPresent: "Conditionnel Présent",
  conditionalPast: "Conditionnel Passé",
};

const SUBJUNCTIVE_TENSE_KEYS = ["subjPresent", "subjPast"];
const SUBJUNCTIVE_TENSE_LABELS = {
  subjPresent: "Subjonctif Présent",
  subjPast: "Subjonctif Passé",
};

// French's imperative only has 3 persons — you don't command yourself,
// and "il/elle/on" and "ils/elles" don't take direct commands either.
const IMPERATIVE_PERSON_KEYS = ["tu", "nous", "vous"];
const IMPERATIVE_TENSE_KEYS = ["imperativePresent"];
const IMPERATIVE_TENSE_LABELS = { imperativePresent: "Impératif" };

// Compound tenses: which simple tense of the auxiliary (avoir or être,
// chosen per-verb — see AUX_ETRE_VERBS below) forms each one.
const COMPOUND_TENSE_AUX = {
  passeCompose: "present",
  pluperfect: "imperfect",
  futurePerfect: "future",
  conditionalPast: "conditionalPresent",
  subjPast: "subjPresent",
};

const REGULAR_ENDINGS = {
  present: {
    er: ["e", "es", "e", "ons", "ez", "ent"],
    ir: ["is", "is", "it", "issons", "issez", "issent"],
    re: ["s", "s", "", "ons", "ez", "ent"],
  },
  imperfect: ["ais", "ais", "ait", "ions", "iez", "aient"],
  future: ["ai", "as", "a", "ons", "ez", "ont"],
  // Same endings as imperfect, applied to the future stem instead.
  conditionalPresent: ["ais", "ais", "ait", "ions", "iez", "aient"],
  // Uniform across all three groups — unlike the indicative present,
  // French's subjunctive present doesn't split endings by verb group.
  subjPresent: ["e", "es", "e", "ions", "iez", "ent"],
};

// The classic "DR & MRS VANDERTRAMP" list — these (plus anything built
// on them, e.g. redescendre, repartir) take être instead of avoir in
// every compound tense. Reflexive/pronominal verbs also take être, but
// aren't in this curated list at all (skipped — the reflexive pronoun
// adds a whole separate layer this build doesn't cover yet).
const AUX_ETRE_VERBS = new Set([
  "devenir",
  "revenir",
  "monter",
  "rester",
  "sortir",
  "venir",
  "aller",
  "naître",
  "descendre",
  "entrer",
  "rentrer",
  "tomber",
  "retourner",
  "arriver",
  "mourir",
  "partir",
]);

// Past participles (for every compound tense): regular formula is
// bareStem + "é" (-er) / bareStem + "i" (-ir) / bareStem + "u" (-re);
// anything not following that — which is most of the irregular 3rd-
// group verbs — is a hand-verified override.
const PAST_PARTICIPLE_OVERRIDES = {
  être: "été",
  avoir: "eu",
  faire: "fait",
  dire: "dit",
  écrire: "écrit",
  lire: "lu",
  prendre: "pris",
  mettre: "mis",
  voir: "vu",
  savoir: "su",
  pouvoir: "pu",
  vouloir: "voulu",
  devoir: "dû",
  venir: "venu",
  devenir: "devenu",
  revenir: "revenu",
  tenir: "tenu",
  naître: "né",
  mourir: "mort",
  ouvrir: "ouvert",
  offrir: "offert",
  connaître: "connu",
  vivre: "vécu",
  croire: "cru",
  boire: "bu",
  recevoir: "reçu",
  courir: "couru",
};

// Irregular future/conditional stems (endings stay regular).
const FUTURE_IRREGULAR_STEMS = {
  être: "ser",
  avoir: "aur",
  aller: "ir",
  faire: "fer",
  venir: "viendr",
  devenir: "deviendr",
  revenir: "reviendr",
  tenir: "tiendr",
  voir: "verr",
  savoir: "saur",
  pouvoir: "pourr",
  vouloir: "voudr",
  devoir: "devr",
  envoyer: "enverr",
  courir: "courr",
  mourir: "mourr",
  recevoir: "recevr",
};

// The ONE true exception to "imperfect stem = present nous-form minus
// -ons" — être's présent nous-form is "sommes", which doesn't give the
// right stem at all.
const IMPARFAIT_STEM_OVERRIDES = { être: "ét" };

// -er verbs ending in -ger/-cer need a spelling tweak (not a sound
// change) whenever the ending that follows starts with "a" or "o", so
// the "soft" g/c sound is preserved: manger -> nous mangeons,
// je mangeais; commencer -> nous commençons, je commençais.
const SPELLING_CHANGE_VERBS = {
  manger: "ger",
  changer: "ger",
  voyager: "ger",
  nager: "ger",
  partager: "ger",
  bouger: "ger",
  ranger: "ger",
  commencer: "cer",
  placer: "cer",
  avancer: "cer",
  lancer: "cer",
  prononcer: "cer",
};

// Present subjunctive: the 7 verbs whose stem doesn't derive from
// their own "ils" present form the normal way (and, for several of
// these, nous/vous ALSO don't fall back to the usual imparfait-style
// stem) — hand-verified in full.
const SUBJUNCTIVE_PRESENT_OVERRIDES = {
  être: ["sois", "sois", "soit", "soyons", "soyez", "soient"],
  avoir: ["aie", "aies", "ait", "ayons", "ayez", "aient"],
  aller: ["aille", "ailles", "aille", "allions", "alliez", "aillent"],
  faire: ["fasse", "fasses", "fasse", "fassions", "fassiez", "fassent"],
  pouvoir: ["puisse", "puisses", "puisse", "puissions", "puissiez", "puissent"],
  savoir: ["sache", "saches", "sache", "sachions", "sachiez", "sachent"],
  vouloir: ["veuille", "veuilles", "veuille", "voulions", "vouliez", "veuillent"],
};

// Imperative present: derived from indicative présent tu/nous/vous
// (minus the pronoun) for almost every verb — these 3 don't follow
// that rule at all.
const IMPERATIVE_OVERRIDES = {
  être: { tu: "sois", nous: "soyons", vous: "soyez" },
  avoir: { tu: "aie", nous: "ayons", vous: "ayez" },
  savoir: { tu: "sache", nous: "sachons", vous: "sachez" },
};

const VERBS = [
  // --- Fully regular -er (1st group) ---
  { infinitive: "parler", english: "to speak", type: "er" },
  { infinitive: "aimer", english: "to like / love", type: "er" },
  { infinitive: "donner", english: "to give", type: "er" },
  { infinitive: "jouer", english: "to play", type: "er" },
  { infinitive: "regarder", english: "to watch / look at", type: "er" },
  { infinitive: "écouter", english: "to listen", type: "er" },
  { infinitive: "travailler", english: "to work", type: "er" },
  { infinitive: "habiter", english: "to live (somewhere)", type: "er" },
  { infinitive: "chercher", english: "to look for", type: "er" },
  { infinitive: "trouver", english: "to find", type: "er" },
  { infinitive: "penser", english: "to think", type: "er" },
  { infinitive: "manger", english: "to eat", type: "er", spellingChange: "ger" },
  { infinitive: "commencer", english: "to begin", type: "er", spellingChange: "cer" },

  // --- -er verbs that take être in compound tenses ---
  { infinitive: "arriver", english: "to arrive", type: "er", aux: "être" },
  { infinitive: "rester", english: "to stay", type: "er", aux: "être" },
  { infinitive: "entrer", english: "to enter", type: "er", aux: "être" },
  { infinitive: "tomber", english: "to fall", type: "er", aux: "être" },
  { infinitive: "monter", english: "to go up", type: "er", aux: "être" },
  { infinitive: "retourner", english: "to return / go back", type: "er", aux: "être" },

  // --- Regular -ir (2nd group, -iss- plural) ---
  { infinitive: "finir", english: "to finish", type: "ir" },
  { infinitive: "choisir", english: "to choose", type: "ir" },
  { infinitive: "réussir", english: "to succeed", type: "ir" },
  { infinitive: "grandir", english: "to grow (up)", type: "ir" },
  { infinitive: "remplir", english: "to fill", type: "ir" },
  { infinitive: "obéir", english: "to obey", type: "ir" },

  // --- Regular 3rd-group -re ---
  { infinitive: "vendre", english: "to sell", type: "re" },
  { infinitive: "attendre", english: "to wait (for)", type: "re" },
  { infinitive: "répondre", english: "to answer", type: "re" },
  { infinitive: "perdre", english: "to lose", type: "re" },
  { infinitive: "entendre", english: "to hear", type: "re" },

  // --- Irregular -re that takes être ---
  { infinitive: "descendre", english: "to go down", type: "re", aux: "être" },

  // --- Fully irregular verbs (hand-verified present tense) ---
  {
    infinitive: "être",
    english: "to be",
    type: "re",
    irregular: true,
    overrides: { present: { je: "suis", tu: "es", il: "est", nous: "sommes", vous: "êtes", ils: "sont" } },
  },
  {
    infinitive: "avoir",
    english: "to have",
    type: "re",
    irregular: true,
    overrides: { present: { je: "ai", tu: "as", il: "a", nous: "avons", vous: "avez", ils: "ont" } },
  },
  {
    infinitive: "aller",
    english: "to go",
    type: "er",
    irregular: true,
    aux: "être",
    overrides: { present: { je: "vais", tu: "vas", il: "va", nous: "allons", vous: "allez", ils: "vont" } },
  },
  {
    infinitive: "faire",
    english: "to do / make",
    type: "re",
    irregular: true,
    overrides: { present: { je: "fais", tu: "fais", il: "fait", nous: "faisons", vous: "faites", ils: "font" } },
  },
  {
    infinitive: "dire",
    english: "to say / tell",
    type: "re",
    irregular: true,
    overrides: { present: { je: "dis", tu: "dis", il: "dit", nous: "disons", vous: "dites", ils: "disent" } },
  },
  {
    infinitive: "écrire",
    english: "to write",
    type: "re",
    irregular: true,
    overrides: { present: { je: "écris", tu: "écris", il: "écrit", nous: "écrivons", vous: "écrivez", ils: "écrivent" } },
  },
  {
    infinitive: "lire",
    english: "to read",
    type: "re",
    irregular: true,
    overrides: { present: { je: "lis", tu: "lis", il: "lit", nous: "lisons", vous: "lisez", ils: "lisent" } },
  },
  {
    infinitive: "prendre",
    english: "to take",
    type: "re",
    irregular: true,
    overrides: { present: { je: "prends", tu: "prends", il: "prend", nous: "prenons", vous: "prenez", ils: "prennent" } },
  },
  {
    infinitive: "mettre",
    english: "to put",
    type: "re",
    irregular: true,
    overrides: { present: { je: "mets", tu: "mets", il: "met", nous: "mettons", vous: "mettez", ils: "mettent" } },
  },
  {
    infinitive: "voir",
    english: "to see",
    type: "re",
    irregular: true,
    overrides: { present: { je: "vois", tu: "vois", il: "voit", nous: "voyons", vous: "voyez", ils: "voient" } },
  },
  {
    infinitive: "savoir",
    english: "to know (facts)",
    type: "re",
    irregular: true,
    overrides: { present: { je: "sais", tu: "sais", il: "sait", nous: "savons", vous: "savez", ils: "savent" } },
  },
  {
    infinitive: "pouvoir",
    english: "to be able to / can",
    type: "re",
    irregular: true,
    overrides: { present: { je: "peux", tu: "peux", il: "peut", nous: "pouvons", vous: "pouvez", ils: "peuvent" } },
  },
  {
    infinitive: "vouloir",
    english: "to want",
    type: "re",
    irregular: true,
    overrides: { present: { je: "veux", tu: "veux", il: "veut", nous: "voulons", vous: "voulez", ils: "veulent" } },
  },
  {
    infinitive: "devoir",
    english: "to have to / must",
    type: "re",
    irregular: true,
    overrides: { present: { je: "dois", tu: "dois", il: "doit", nous: "devons", vous: "devez", ils: "doivent" } },
  },
  {
    infinitive: "venir",
    english: "to come",
    type: "ir",
    irregular: true,
    aux: "être",
    overrides: { present: { je: "viens", tu: "viens", il: "vient", nous: "venons", vous: "venez", ils: "viennent" } },
  },
  {
    infinitive: "devenir",
    english: "to become",
    type: "ir",
    irregular: true,
    aux: "être",
    overrides: { present: { je: "deviens", tu: "deviens", il: "devient", nous: "devenons", vous: "devenez", ils: "deviennent" } },
  },
  {
    infinitive: "revenir",
    english: "to come back",
    type: "ir",
    irregular: true,
    aux: "être",
    overrides: { present: { je: "reviens", tu: "reviens", il: "revient", nous: "revenons", vous: "revenez", ils: "reviennent" } },
  },
  {
    infinitive: "tenir",
    english: "to hold",
    type: "ir",
    irregular: true,
    overrides: { present: { je: "tiens", tu: "tiens", il: "tient", nous: "tenons", vous: "tenez", ils: "tiennent" } },
  },
  {
    infinitive: "sortir",
    english: "to go out",
    type: "ir",
    irregular: true,
    aux: "être",
    overrides: { present: { je: "sors", tu: "sors", il: "sort", nous: "sortons", vous: "sortez", ils: "sortent" } },
  },
  {
    infinitive: "partir",
    english: "to leave",
    type: "ir",
    irregular: true,
    aux: "être",
    overrides: { present: { je: "pars", tu: "pars", il: "part", nous: "partons", vous: "partez", ils: "partent" } },
  },
  {
    infinitive: "naître",
    english: "to be born",
    type: "re",
    irregular: true,
    aux: "être",
    overrides: { present: { je: "nais", tu: "nais", il: "naît", nous: "naissons", vous: "naissez", ils: "naissent" } },
  },
  {
    infinitive: "mourir",
    english: "to die",
    type: "ir",
    irregular: true,
    aux: "être",
    overrides: { present: { je: "meurs", tu: "meurs", il: "meurt", nous: "mourons", vous: "mourez", ils: "meurent" } },
  },
  {
    infinitive: "connaître",
    english: "to know (people / places)",
    type: "re",
    irregular: true,
    overrides: { present: { je: "connais", tu: "connais", il: "connaît", nous: "connaissons", vous: "connaissez", ils: "connaissent" } },
  },
  {
    infinitive: "vivre",
    english: "to live",
    type: "re",
    irregular: true,
    overrides: { present: { je: "vis", tu: "vis", il: "vit", nous: "vivons", vous: "vivez", ils: "vivent" } },
  },
  {
    infinitive: "croire",
    english: "to believe",
    type: "re",
    irregular: true,
    overrides: { present: { je: "crois", tu: "crois", il: "croit", nous: "croyons", vous: "croyez", ils: "croient" } },
  },
  {
    infinitive: "boire",
    english: "to drink",
    type: "re",
    irregular: true,
    overrides: { present: { je: "bois", tu: "bois", il: "boit", nous: "buvons", vous: "buvez", ils: "boivent" } },
  },
  {
    infinitive: "recevoir",
    english: "to receive",
    type: "re",
    irregular: true,
    overrides: { present: { je: "reçois", tu: "reçois", il: "reçoit", nous: "recevons", vous: "recevez", ils: "reçoivent" } },
  },
  {
    infinitive: "courir",
    english: "to run",
    type: "re",
    irregular: true,
    overrides: { present: { je: "cours", tu: "cours", il: "court", nous: "courons", vous: "courez", ils: "courent" } },
  },
  {
    infinitive: "ouvrir",
    english: "to open",
    type: "ir",
    irregular: true,
    overrides: { present: { je: "ouvre", tu: "ouvres", il: "ouvre", nous: "ouvrons", vous: "ouvrez", ils: "ouvrent" } },
  },
  {
    infinitive: "offrir",
    english: "to offer / give (a gift)",
    type: "ir",
    irregular: true,
    overrides: { present: { je: "offre", tu: "offres", il: "offre", nous: "offrons", vous: "offrez", ils: "offrent" } },
  },
  {
    infinitive: "envoyer",
    english: "to send",
    type: "er",
    irregular: true,
    overrides: { present: { je: "envoie", tu: "envoies", il: "envoie", nous: "envoyons", vous: "envoyez", ils: "envoient" } },
  },
];

const FrenchVerbData = {
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
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = FrenchVerbData;
} else {
  window.FrenchVerbData = FrenchVerbData;
}
