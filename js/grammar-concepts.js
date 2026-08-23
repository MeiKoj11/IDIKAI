/*
  grammar-concepts.js
  --------------------
  A small, deliberately short registry of "recognized" grammar concepts —
  patterns common and well-defined enough that (a) a grammar-check
  correction can be reliably tagged with one, and (b) practice questions
  can actually be generated for it (vs. an arbitrary one-off correction,
  which just gets saved as a plain note with no promise of practice).

  Kept intentionally small on purpose: every key here needs matching
  support on the backend (see server.js's own copy of this list, and its
  /generate-grammar-practice handler) — a concept only "counts" once both
  sides know what to do with it. Add new concepts to both places at once.

  practiceType values:
    "pair-recall" — the concept is a set of two-sided word pairs (e.g.
      transitive/intransitive verbs); practice shows one side (with
      furigana) and asks for the other. pairLabels names the two sides,
      in a fixed order matching the pair objects the backend returns
      (see server.js's practice-generation prompt for the exact shape).
*/

const GRAMMAR_CONCEPTS = {
  "verb-transitivity": {
    key: "verb-transitivity",
    label: "Transitive vs Intransitive Verbs",
    languages: ["ja"],
    practiceType: "pair-recall",
    pairLabels: ["Transitive", "Intransitive"],
  },
};

function getGrammarConcept(key) {
  return (key && GRAMMAR_CONCEPTS[key]) || null;
}

// A concept only actually applies if the note/theme's language matches
// one of the languages it's defined for (e.g. verb-transitivity is
// Japanese-only for now).
function grammarConceptAppliesToLanguage(key, language) {
  const concept = getGrammarConcept(key);
  return !!concept && concept.languages.includes(language);
}
