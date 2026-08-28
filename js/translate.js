/*
  translate.js
  ------------
  Optional dictionary lookup, used only when you leave one side of a
  word blank.

  Primary source: a small local backend (see /server) that calls the
  Claude API — a real dictionary-quality lookup, including gender and
  article for Spanish nouns, and always a clean infinitive for verbs
  (no more "to eat" -> "para comer"). Needs the server running
  (node server.js) and an internet connection.

  Fallback: if the backend isn't running, or you're offline, this
  quietly falls back to MyMemory (the original free translation-memory
  API — no signup, works directly from the browser, but lower quality
  and no gender info). Nothing breaks either way — if both fail, the
  field is just left for you to fill in by hand.

  Either path returns the same shape from lookupTranslation():
    { translation, gender, article, plural, source }
  gender/article/plural are null/false unless the backend supplied
  them (MyMemory never does).
*/

// Opened as a local file (file://), there's no server to be same-origin
// with, so keep talking to localhost:3001 as before. Once served BY that
// same server (a deployed link, or visiting localhost:3001 directly),
// window.location.origin already points at it, so relative paths ("")
// just work — no separate static host and no CORS setup needed.
const API_BASE = window.location.protocol === "file:" ? "http://localhost:3001" : "";

const BACKEND_URL = `${API_BASE}/lookup`;

async function lookupViaBackend(word, fromLang, toLang) {
  try {
    const url = `${BACKEND_URL}?word=${encodeURIComponent(word)}&from=${fromLang}&to=${toLang}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.translation) return null;
    return {
      translation: data.translation,
      gender: data.gender || null,
      article: data.article || null,
      plural: !!data.plural,
      furigana: data.furigana || null,
      conjugationInfo: data.conjugationInfo || null,
      partOfSpeech: data.partOfSpeech || null,
      verbClass: data.verbClass || null,
      verbType: data.verbType || null,
      source: "claude",
    };
  } catch (e) {
    // Server not running, or offline — fall back to MyMemory below.
    return null;
  }
}

async function lookupViaMyMemory(word, fromLang, toLang) {
  const langpair = `${fromLang}|${toLang}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=${langpair}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const result = data && data.responseData && data.responseData.translatedText;
    if (!result) return null;
    // If it just handed back the same word, treat that as "no real match".
    if (result.toLowerCase().trim() === word.toLowerCase().trim()) return null;
    return { translation: result, gender: null, article: null, plural: false, furigana: null, conjugationInfo: null, partOfSpeech: null, verbClass: null, verbType: null, source: "mymemory" };
  } catch (e) {
    console.warn("MyMemory lookup failed (probably offline):", e);
    return null;
  }
}

async function lookupTranslation(word, fromLang, toLang) {
  const backendResult = await lookupViaBackend(word, fromLang, toLang);
  if (backendResult) return backendResult;
  return lookupViaMyMemory(word, fromLang, toLang);
}

// Used by the verb-conjugation quiz when the answer doesn't exactly
// match locally — asks Claude for a second opinion (accepts regional
// variants, explains real mistakes) rather than a hard string match.
// Returns { correct, feedback } or null if the server isn't reachable.
async function checkConjugation(infinitive, tense, person, expected, userAnswer) {
  try {
    const params = new URLSearchParams({ infinitive, tense, person, expected, userAnswer });
    const res = await fetch(`${API_BASE}/check-conjugation?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.correct !== "boolean") return null;
    return data;
  } catch (e) {
    return null;
  }
}

// Sends a screenshot to the backend and gets back the transcribed text,
// for the Reading bubble's "upload an image instead of typing/pasting"
// option. Always returns { text, error } — text is null on failure, and
// error is a human-readable reason (also logged to the console) so a
// failure is actually diagnosable instead of a silent dead end.
async function extractTextFromImage(base64Image, mediaType) {
  try {
    const res = await fetch(`${API_BASE}/extract-text`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: base64Image, mediaType }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const reason = (data && data.error) || `Server responded with ${res.status}.`;
      console.error("extract-text failed:", reason);
      return { text: null, error: reason };
    }
    if (!data || !data.text) {
      console.error("extract-text: unexpected response shape", data);
      return { text: null, error: "The server didn't return any text." };
    }
    return { text: data.text, error: null };
  } catch (e) {
    console.error("extract-text: could not reach the server", e);
    return { text: null, error: "Couldn't reach the lookup server at localhost:3001 — is `node server.js` running?" };
  }
}

// Used by the Grammar bubble's collapsed "AI hint" and the always-shown
// reference translation — never used to auto-fill the notes/tags fields,
// those stay written by hand. Returns { translation, structure, explanation }
// or null if the server isn't reachable. "structure" is a short formulaic
// label (e.g. "como si + pluperfect subjunctive"); "explanation" is the
// fuller paragraph.
async function explainGrammar(phrase, context) {
  try {
    // POST with a JSON body (not a GET query string) — a whole passage
    // as context used to blow past the URL length limit on long passages.
    const res = await fetch(`${API_BASE}/explain-grammar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phrase, context: context || "" }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.translation) return null;
    return {
      translation: data.translation,
      furigana: data.furigana || "",
      dictionaryForm: data.dictionaryForm || "",
      dictionaryFormEnglish: data.dictionaryFormEnglish || "",
      structure: data.structure || "",
      explanation: data.explanation || "",
    };
  } catch (e) {
    return null;
  }
}

// Powers the "Generate 3 examples" box on the Reading bubble's vocab-add
// panel and word-lookup panel — 3 short sentences that each use the word
// EXACTLY as given (same conjugation/form, not re-tensed), plus an
// English translation of each. Returns { examples, error } — examples is
// null on failure, mirroring the other lookup helpers in this file.
async function generateExampleSentences(word, language, meaning) {
  try {
    const params = new URLSearchParams({ word, language: language || "es", meaning: meaning || "" });
    const res = await fetch(`${API_BASE}/generate-examples?${params.toString()}`);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const reason = (data && data.error) || `Server responded with ${res.status}.`;
      console.error("generate-examples failed:", reason);
      return { examples: null, error: reason };
    }
    if (!data || !Array.isArray(data.examples) || data.examples.length === 0) {
      console.error("generate-examples: unexpected response shape", data);
      return { examples: null, error: "The server didn't return any example sentences." };
    }
    return { examples: data.examples, error: null };
  } catch (e) {
    console.error("generate-examples: could not reach the server", e);
    return {
      examples: null,
      error: "Couldn't reach the lookup server at localhost:3001 — is `node server.js` running?",
    };
  }
}

// Used by the Japanese Reading bubble's click-any-kanji lookup. Returns
// { word, furigana, meaning, error } — "word" is the dictionary form of
// the compound/word the clicked kanji is actually part of (identified
// using the surrounding sentence), not just the isolated character.
// "error" is null on success and a human-readable reason on failure
// (also logged to the console) so a failure is diagnosable instead of a
// generic "check the server" dead end — mirrors extractTextFromImage.
async function lookupKanji(kanji, context) {
  try {
    const params = new URLSearchParams({ kanji, context: context || "" });
    const res = await fetch(`${API_BASE}/lookup-kanji?${params.toString()}`);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const reason = (data && data.error) || `Server responded with ${res.status}.`;
      console.error("lookup-kanji failed:", reason);
      return { word: null, furigana: "", meaning: "", error: reason };
    }
    if (!data || !data.word) {
      console.error("lookup-kanji: unexpected response shape", data);
      return { word: null, furigana: "", meaning: "", kanjiMeaning: null, error: "The server didn't return a result for this kanji." };
    }
    return {
      word: data.word,
      furigana: data.furigana || "",
      meaning: data.meaning || "",
      kanjiMeaning: data.kanjiMeaning || null,
      error: null,
    };
  } catch (e) {
    console.error("lookup-kanji: could not reach the server", e);
    return {
      word: null,
      furigana: "",
      meaning: "",
      error: "Couldn't reach the lookup server at localhost:3001 — is `node server.js` running?",
    };
  }
}

// Used by the Vocab Bank's "Import a vocab list" bulk-add option.
// Sends a whole pasted block of text and gets back a batch of
// { targetLang, english, furigana } pairs to review before saving.
// Always returns { words, error } — words is null on failure, error is
// a human-readable reason (also logged), mirroring extractTextFromImage.
async function extractVocabList(text, language) {
  try {
    const res = await fetch(`${API_BASE}/extract-vocab-list`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, language }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const reason = (data && data.error) || `Server responded with ${res.status}.`;
      console.error("extract-vocab-list failed:", reason);
      return { words: null, error: reason };
    }
    if (!data || !Array.isArray(data.words)) {
      console.error("extract-vocab-list: unexpected response shape", data);
      return { words: null, error: "The server didn't return a usable result." };
    }
    return { words: data.words, error: null };
  } catch (e) {
    console.error("extract-vocab-list: could not reach the server", e);
    return {
      words: null,
      error: "Couldn't reach the lookup server at localhost:3001 — is `node server.js` running?",
    };
  }
}

// Used by the Writing bubble's "Grammar check" button — sends a whole
// saved entry and gets back a corrected version plus the specific list
// of what changed and why. Distinct from Vocab check (which only
// resolves <bracketed> words via a plain dictionary lookup) — this
// reads full sentences for real grammatical correctness. Always returns
// { correctedText, corrections, error } — correctedText/corrections are
// null on failure, error is a human-readable reason (also logged),
// mirroring extractVocabList.
async function checkWritingGrammar(text, language) {
  try {
    const res = await fetch(`${API_BASE}/check-writing-grammar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, language }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const reason = (data && data.error) || `Server responded with ${res.status}.`;
      console.error("check-writing-grammar failed:", reason);
      return { correctedText: null, corrections: null, error: reason };
    }
    if (!data || typeof data.correctedText !== "string" || !Array.isArray(data.corrections)) {
      console.error("check-writing-grammar: unexpected response shape", data);
      return { correctedText: null, corrections: null, error: "The server didn't return a usable result." };
    }
    return { correctedText: data.correctedText, corrections: data.corrections, error: null };
  } catch (e) {
    console.error("check-writing-grammar: could not reach the server", e);
    return {
      correctedText: null,
      corrections: null,
      error: "Couldn't reach the lookup server at localhost:3001 — is `node server.js` running?",
    };
  }
}

// Powers the light, per-sentence check on a Grammar structure card's
// example sentences — patternContext (optional) is the card's own
// header + explanation, so the check can flag an example that's
// grammatical but doesn't actually demonstrate the pattern, not just
// catch typos. Always returns { isCorrect, corrected, note, error }.
async function checkExampleSentence(text, language, patternContext) {
  try {
    const res = await fetch(`${API_BASE}/check-example-sentence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, language, patternContext: patternContext || "" }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const reason = (data && data.error) || `Server responded with ${res.status}.`;
      console.error("check-example-sentence failed:", reason);
      return { isCorrect: null, corrected: null, note: null, error: reason };
    }
    if (!data || typeof data.isCorrect !== "boolean" || typeof data.corrected !== "string") {
      console.error("check-example-sentence: unexpected response shape", data);
      return { isCorrect: null, corrected: null, note: null, error: "The server didn't return a usable result." };
    }
    return { isCorrect: data.isCorrect, corrected: data.corrected, note: data.note || "", error: null };
  } catch (e) {
    console.error("check-example-sentence: could not reach the server", e);
    return {
      isCorrect: null,
      corrected: null,
      note: null,
      error: "Couldn't reach the lookup server at localhost:3001 — is `node server.js` running?",
    };
  }
}

// Powers the "what grammar point is this?" check that runs on a
// structure card's own header/explanation/examples (grammar-add-note.html).
// Always returns { label, note, error }; label is null both on failure
// AND on a legitimate "no single clear point found" result — check
// `error` to tell the two apart.
async function classifyGrammarPoint(header, explanation, examples, language) {
  try {
    const res = await fetch(`${API_BASE}/classify-grammar-point`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ header, explanation, examples, language }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const reason = (data && data.error) || `Server responded with ${res.status}.`;
      console.error("classify-grammar-point failed:", reason);
      return { label: null, note: null, error: reason };
    }
    if (!data || typeof data.note !== "string") {
      console.error("classify-grammar-point: unexpected response shape", data);
      return { label: null, note: null, error: "The server didn't return a usable result." };
    }
    return { label: data.label || null, note: data.note, error: null };
  } catch (e) {
    console.error("classify-grammar-point: could not reach the server", e);
    return {
      label: null,
      note: null,
      error: "Couldn't reach the lookup server at localhost:3001 — is `node server.js` running?",
    };
  }
}

// Powers a structure card's "Test me on this" practice — only offered
// once the card has a recognized label. Always returns { items, error };
// items is null on failure.
async function generateCardPractice(header, explanation, label, examples, language, excludeSentences) {
  try {
    const res = await fetch(`${API_BASE}/generate-card-practice`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ header, explanation, label, examples, language, excludeSentences: excludeSentences || [] }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const reason = (data && data.error) || `Server responded with ${res.status}.`;
      console.error("generate-card-practice failed:", reason);
      return { items: null, error: reason };
    }
    if (!data || !Array.isArray(data.items)) {
      console.error("generate-card-practice: unexpected response shape", data);
      return { items: null, error: "The server didn't return a usable result." };
    }
    return { items: data.items, error: null };
  } catch (e) {
    console.error("generate-card-practice: could not reach the server", e);
    return {
      items: null,
      error: "Couldn't reach the lookup server at localhost:3001 — is `node server.js` running?",
    };
  }
}

// Powers a Grammar folder's "Practice this grammar point" option — only
// called for folders tagged with a recognized concept (see
// grammar-concepts.js). excludeWords lets a practice session avoid
// repeating pairs it's already shown this sitting. Always returns
// { pairs, error }; pairs is null on failure, mirroring the other
// Translate functions.
async function generateGrammarPractice(concept, language, excludeWords) {
  try {
    const res = await fetch(`${API_BASE}/generate-grammar-practice`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ concept, language, excludeWords: excludeWords || [] }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const reason = (data && data.error) || `Server responded with ${res.status}.`;
      console.error("generate-grammar-practice failed:", reason);
      return { pairs: null, error: reason };
    }
    if (!data || !Array.isArray(data.pairs)) {
      console.error("generate-grammar-practice: unexpected response shape", data);
      return { pairs: null, error: "The server didn't return a usable result." };
    }
    return { pairs: data.pairs, error: null };
  } catch (e) {
    console.error("generate-grammar-practice: could not reach the server", e);
    return {
      pairs: null,
      error: "Couldn't reach the lookup server at localhost:3001 — is `node server.js` running?",
    };
  }
}

const Translate = {
  lookupTranslation,
  checkConjugation,
  extractTextFromImage,
  explainGrammar,
  generateExampleSentences,
  lookupKanji,
  extractVocabList,
  checkWritingGrammar,
  checkExampleSentence,
  classifyGrammarPoint,
  generateCardPractice,
  generateGrammarPractice,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = Translate;
} else {
  window.Translate = Translate;
}
