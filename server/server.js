/*
  server.js
  ---------
  Tiny local backend for the Vocab Bank dictionary lookup. Its only
  job: hold the Claude API key server-side (never send it to the
  browser) and turn a word/phrase into structured dictionary data —
  a clean dictionary-form translation, part of speech, and (for
  Spanish nouns) gender/article — instead of the guesswork you get
  from a plain machine-translation API.

  No npm packages required — everything here is a Node built-in.

  Run it with:
    1. Copy .env.example to .env and paste in your real API key.
    2. node server.js   (or: npm start)
    3. Leave that terminal window open while you use the Vocab Bank —
       vocab.html calls this on localhost:3001 whenever you leave one
       side of a word blank.
*/

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const db = require("./db.js");

// Hosting platforms (Render, Railway, etc.) assign their own port via
// this env var and expect the app to listen on it — 3001 stays as the
// local-dev fallback.
const PORT = process.env.PORT || 3001;
const MODEL = "claude-haiku-4-5-20251001";
// Full-sentence grammar checking has to actually parse sentence
// structure, agreement, and idiom across a whole paragraph — a much
// harder reasoning task than a single-word dictionary lookup, and for
// this one endpoint accuracy is the only thing that matters (cost and
// latency explicitly don't) — so it gets the largest flagship model
// available rather than the mid-tier one everything else uses.
const GRAMMAR_CHECK_MODEL = "claude-opus-5";

// Minimal .env loader — no "dotenv" package needed for something this small.
function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, "utf8")
    .split("\n")
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const eq = trimmed.indexOf("=");
      if (eq === -1) return;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    });
}
loadEnvFile();

const API_KEY = process.env.ANTHROPIC_API_KEY;

const LANGUAGE_NAMES = { en: "English", es: "Spanish", ja: "Japanese", fr: "French" };

const SYSTEM_PROMPT = `You are a bilingual dictionary AND verb-conjugation lookup for a personal
vocabulary-learning app. Given a single word or short phrase and a translation direction, respond
with ONLY a JSON object (no markdown, no code fences, no explanation) with exactly this shape:

{
  "translation": string or null,
  "partOfSpeech": "noun" | "verb" | "adjective" | "adverb" | "other",
  "gender": "masculine" | "feminine" | null,
  "article": string or null,
  "plural": boolean,
  "furigana": string or null,
  "conjugationInfo": {
    "infinitive": string,
    "infinitiveEnglish": string,
    "tense": string,
    "person": string
  } or null,
  "verbClass": "godan" | "ichidan" | "irregular-suru" | "irregular-kuru" | null
}

Rules:
- "furigana" is ONLY ever the hiragana reading of a JAPANESE word — never Spanish, never English.
  Whichever side of this particular translation is Japanese (the "translation" if translating INTO
  Japanese, or the original input word itself if translating FROM Japanese into English), fill in
  its reading entirely in hiragana (convert any katakana in the reading to hiragana too). If no
  Japanese is involved on either side (e.g. English<->Spanish), set "furigana" to null. If the
  Japanese word is already all-hiragana/katakana with no kanji, still give its hiragana reading
  (won't just repeat kanji, since there isn't any) rather than null.
- If the input describes a SPECIFIC verb form — a particular tense/person, whether written in
  English ("I would have eaten", "she ran", "we are leaving") or already conjugated in Spanish
  ("comía", "recibí", "habría comido", "supiera") — "translation" must be the correctly conjugated
  form in the OUTPUT language (not the infinitive), and "conjugationInfo" must be filled in with
  the verb's infinitive, the infinitive's English meaning, a short human-readable tense name that
  ALWAYS includes the mood when it isn't plain indicative (e.g. "preterite", "imperfect", "future",
  "conditional", "conditional perfect", "present progressive", "present subjunctive", "imperfect
  subjunctive", "present perfect subjunctive", "pluperfect subjunctive", "imperative (affirmative)",
  "imperative (negative)"), and the grammatical person (e.g. "yo", "tú", "él/ella/usted",
  "nosotros", "vosotros", "ellos/ellas/ustedes"). For example "supiera" -> infinitive "saber",
  tense "imperfect subjunctive", person "yo" (or "él/ella/usted" — both share this form; pick "yo"
  unless context says otherwise).
- If the input is just a GENERIC reference to the verb itself — "to eat", "eat", or the bare
  Spanish infinitive "comer" — "translation" is the infinitive and "conjugationInfo" is null.
- For nouns translated INTO Spanish, "translation" is the bare noun, with no article included in
  the string itself.
- "gender" and "article" only apply to Spanish nouns (masculine/feminine, el/la/los/las as
  commonly used for that word). Set both to null for anything else, including English output,
  verbs, and Japanese.
- For Spanish ADJECTIVES whose ending changes with gender (typically -o for masculine / -a for
  feminine, e.g. cansado/cansada), if the input doesn't specify a gender (e.g. "I am tired", "tired"
  — English rarely marks adjective gender), write "translation" using the "/a" shorthand so it
  captures both forms, e.g. "estoy cansado/a" (keep any accompanying verb like "estoy" untouched,
  only the adjective gets the "/a"). If the input DOES specify gender ("she is tired" -> feminine,
  "he is tired" -> masculine), give the single correctly-gendered form instead ("cansada" /
  "cansado"). Adjectives that don't change with gender (e.g. "feliz", "inteligente") are unaffected
  — never add "/a" to those.
- Match the grammatical number of the input exactly — do not silently convert a plural input into
  a singular "dictionary form" translation, or vice versa. If the English input is plural (e.g.
  "grapes"), "translation" must be the plural Spanish noun (e.g. "uvas", not "uva"), "plural" must
  be true, and "article" must be the plural article ("las"/"los"), not the singular one. If the
  English input is singular (e.g. "grape"), return the singular noun, "plural": false, and the
  singular article ("la"/"el").
- If you are not confident of a correct translation, set "translation" to null rather than guessing.
- "verbClass" is ONLY ever filled in when "partOfSpeech" is "verb" AND the verb is JAPANESE (the
  dictionary/infinitive form, on whichever side is Japanese) — set it to null for every other case
  (Spanish verbs, non-verbs, no Japanese involved). This is a personal app feature that lets locally
  written code conjugate the verb correctly without another API call later, so get it right:
    - "irregular-suru": the verb is literally する ("to do"), or a suru-verb compound ending in する
      (e.g. 勉強する "to study", 運転する "to drive") — the する part conjugates irregularly.
    - "irregular-kuru": the verb is literally 来る ("to come") — also irregular.
    - "ichidan" (a "ru-verb"): dictionary form ends in る, and the vowel immediately before that る
      is い or え (e.g. 食べる taberu, 見る miru, 起きる okiru, 忘れる wasureru). Conjugates by simply
      dropping る and adding a suffix.
    - "godan" (a "u-verb"): every other verb, INCLUDING る-ending verbs whose preceding vowel is あ/う/お
      (e.g. 帰る kaeru, 入る hairu, 走る hashiru, 知る shiru — these look like ichidan but conjugate as
      godan, a well-known trap; get this distinction right rather than guessing from the spelling
      pattern alone) and every verb ending in う/く/ぐ/す/つ/ぬ/ぶ/む. Conjugates by shifting the final
      kana across its row (e.g. 飲む -> 飲ま/飲み/飲む/飲め/飲も).
- Output nothing except the JSON object described above.`;

// Claude sometimes wraps JSON in a ```json ... ``` code fence even when
// told not to — strip that defensively rather than relying on the model
// always following the "no markdown" instruction.
function stripCodeFences(text) {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1] : trimmed;
}

// Strict JSON.parse first; if Claude slipped in a stray sentence before
// or after the object despite instructions not to, fall back to pulling
// out the first {...} block instead of failing the whole lookup over
// one wayward line of prose.
function extractJsonObject(text) {
  const stripped = stripCodeFences(text);
  try {
    return JSON.parse(stripped);
  } catch (e) {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e2) {
        // fall through to the original error below
      }
    }
    const snippet = stripped.length > 300 ? `${stripped.slice(0, 300)}…` : stripped;
    throw new Error(`Could not parse Claude's response as JSON: ${e.message}. Raw response: ${snippet}`);
  }
}

// Generic "ask Claude for a JSON object back" helper — most endpoints
// use this, just with different system prompts. `model` defaults to the
// fast/cheap MODEL; pass GRAMMAR_CHECK_MODEL explicitly for the one
// endpoint that needs stronger reasoning.
function callClaudeJSON(systemPrompt, userMessage, maxTokens, model) {
  return new Promise((resolve, reject) => {
    if (!API_KEY) {
      reject(new Error("ANTHROPIC_API_KEY is not set — copy .env.example to .env and add your key."));
      return;
    }

    const payload = JSON.stringify({
      model: model || MODEL,
      max_tokens: maxTokens || 200,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const req = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01",
          "content-length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        // Collect raw Buffer chunks and decode ONCE at the end, rather
        // than `body += chunk` (implicitly stringifying each chunk on
        // its own) — a multi-byte UTF-8 character (any Japanese text,
        // for example) can land split across two chunks on the wire,
        // and decoding each chunk in isolation mangles that character
        // into a replacement glyph (�) instead of waiting for the full
        // byte sequence.
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode !== 200) {
            reject(new Error(`Claude API error ${res.statusCode}: ${body}`));
            return;
          }
          try {
            const data = JSON.parse(body);
            // Check this BEFORE looking for a text block — models with
            // adaptive thinking (on by default at "high" effort) bill
            // thinking tokens against the same max_tokens budget as the
            // real answer, with no separate allowance. On a request that
            // makes Claude think hard, thinking alone can exhaust the
            // whole budget before any text block is even started, which
            // leaves content with ONLY an (empty-looking — thinking text
            // is omitted by default, though the tokens were still spent)
            // thinking block and stop_reason "max_tokens" — a real
            // out-of-budget failure, not the generic "shape" error below.
            if (data.stop_reason === "max_tokens") {
              reject(
                new Error(
                  "Claude's response was cut off before it finished (hit the token limit for this request) — try again, or if this keeps happening with this entry, it may be too long for one grammar check."
                )
              );
              return;
            }
            // Find the first actual TEXT block rather than assuming
            // content[0] is one — some responses can lead with a
            // non-text block (e.g. "thinking"), which would otherwise
            // make this fail even though real text is present further
            // along in the array.
            const textBlock = Array.isArray(data.content) ? data.content.find((b) => b && b.type === "text" && b.text) : null;
            if (!textBlock) {
              const snippet = body.length > 600 ? `${body.slice(0, 600)}…` : body;
              reject(new Error(`Unexpected response shape from Claude API. Raw response: ${snippet}`));
              return;
            }
            resolve(extractJsonObject(textBlock.text));
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        });
      }
    );

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function callClaude(word, fromLang, toLang) {
  const userMessage = `Translate "${word}" from ${LANGUAGE_NAMES[fromLang] || fromLang} to ${LANGUAGE_NAMES[toLang] || toLang}.`;
  return callClaudeJSON(SYSTEM_PROMPT, userMessage, 200);
}

// Used by the Japanese Reading bubble's click-any-kanji lookup. Japanese
// has no spaces to tokenize on, so instead of trying to segment the
// whole text into words (a much harder problem), each individual kanji
// character is made clickable and this figures out — using the
// surrounding sentence for context — what word or compound it's
// actually part of, rather than just returning that one character in
// isolation.
const KANJI_LOOKUP_PROMPT = `You are a Japanese dictionary lookup for a learner reading real text.
You'll be given either a single kanji character the learner clicked on, or a short run of kanji
they selected together, plus the sentence it appeared in. Identify the word or compound that kanji
(or selection) is actually part of in that context — it might be a standalone single-kanji word,
a multi-kanji compound (possibly larger than what was selected/clicked, if it's only part of a
bigger compound), or the kanji stem of a verb/adjective with okurigana. Respond with ONLY a JSON
object (no markdown, no code fences, no explanation) with exactly this shape:

{ "word": string, "furigana": string, "meaning": string, "kanjiMeaning": string or null }

"word" is the dictionary form of the word/compound containing the clicked/selected kanji, written
the normal way (include any okurigana for verbs/adjectives, e.g. "食べる" not just "食").
"furigana" is that word's reading written entirely in hiragana.
"meaning" is a concise, natural English meaning of that word or compound — not just the isolated
kanji's meaning if it's actually part of a compound with a different combined meaning.
"kanjiMeaning" is ONLY filled in when exactly ONE kanji character was given as input (not a
multi-character selection) AND that character is part of a larger word/compound (i.e. "word" is
longer than the single input character) — in that case, give that one character's own standalone
dictionary meaning as a character (e.g. for 授 clicked inside 授業, "kanjiMeaning" is something like
"to grant, instruct, bestow" — its own meaning, which is NOT the same as "meaning", the compound's
combined meaning "class, lesson"). A compound's overall meaning is very often unrelated to or
different from any one of its individual kanji's meanings — don't just repeat "meaning" here. If
the input was already a multi-character selection, or if "word" IS just that one single character
(a standalone single-kanji word with no larger compound), set "kanjiMeaning" to null.
Always fill in "word" with your best answer — never leave it empty, even if you're not fully
certain; give your best reading of the character(s) in that context instead.`;

// A single kanji lookup is cheap and the interaction it powers (click a
// character, get an answer) has no other fallback path the way the
// dictionary lookup does (MyMemory) — so it's worth one automatic retry
// if the first attempt errors out or comes back with an empty "word"
// (Claude occasionally under-commits on a lookup it's actually fine at)
// rather than surfacing a dead end on the first hiccup.
async function callClaudeForKanjiLookup(kanji, context) {
  const userMessage = `Clicked kanji: "${kanji}". Sentence: "${context}"`;
  const MAX_ATTEMPTS = 2;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await callClaudeJSON(KANJI_LOOKUP_PROMPT, userMessage, 200);
      if (result && result.word) return result;
      lastErr = new Error("Claude returned an empty lookup result for this kanji.");
    } catch (err) {
      lastErr = err;
    }
    if (attempt < MAX_ATTEMPTS) await sleep(300);
  }
  throw lastErr;
}

const CONJUGATION_CHECK_PROMPT = `You are checking a single answer in a Spanish verb-conjugation quiz.
Respond with ONLY a JSON object (no markdown, no code fences, no explanation) with exactly this shape:

{ "correct": boolean, "feedback": string }

"feedback" is one short sentence: if correct, briefly affirm it; if incorrect, name the specific
issue (wrong ending, wrong person, wrong stem change, missing/wrong accent, wrong auxiliary, etc).
Accept minor accent omissions as a typo rather than an error unless accent is the entire point of
the question. Accept well-known valid regional variants (e.g. vosotros vs. ustedes forms, voseo)
as correct if they are genuinely valid for that tense/person — don't fail an answer just for using
a different but equally correct regional form. Be strict about actual conjugation mistakes.`;

function callClaudeForConjugationCheck(infinitive, tense, person, expected, userAnswer) {
  const userMessage =
    `Verb: ${infinitive}. Tense: ${tense}. Person: ${person}. ` +
    `Expected canonical answer: "${expected}". Student wrote: "${userAnswer}". ` +
    `Is the student's answer an acceptable correct conjugation?`;
  return callClaudeJSON(CONJUGATION_CHECK_PROMPT, userMessage, 150);
}

// Used by the Reading bubble's "select a phrase" flow and the Grammar
// bubble's manual note form. Deliberately kept to a plain translation +
// a short explanation, not a full structured breakdown — the note-taking
// UI treats this as an optional, collapsed "hint," not something that
// gets pasted into the saved note automatically. The learner writes the
// pattern/notes themselves.
const GRAMMAR_EXPLAIN_PROMPT = `You are a language tutor helping an English-speaking learner
understand a phrase or sentence they selected while reading (Spanish, Japanese, or French — detect
which from the text itself). Respond with ONLY a JSON object (no markdown, no code fences, no
explanation) with exactly this shape:

{ "translation": string, "furigana": string or null, "dictionaryForm": string or null,
  "dictionaryFormEnglish": string or null, "structure": string, "explanation": string }

"translation" is a natural, idiomatic English translation of the phrase.

"furigana" is ONLY ever the hiragana reading of the phrase, and ONLY when the phrase is Japanese —
convert any katakana in the reading to hiragana too, and give the reading for the WHOLE phrase (not
just one word in it). Set to null for Spanish or French phrases, or if the phrase has no kanji and
is already all-hiragana/katakana, still give its hiragana reading rather than null.

"dictionaryForm" and "dictionaryFormEnglish" are ONLY ever filled in when the phrase is a SINGLE
WORD (not a multi-word phrase or sentence — a bare space, for Spanish/French, or more than one
grammatical word, for Japanese, means this is NOT a single word) AND that word is a verb or other
inflectable word given in a conjugated/inflected form. In that case, "dictionaryForm" is the word's
dictionary/infinitive/base form written normally (e.g. Spanish "quería" -> "querer", French
"mangeait" -> "manger", Japanese "扱った" -> "扱う"), and "dictionaryFormEnglish" is a short English
gloss of that base form (e.g. "to want", "to eat", "to handle"). If the phrase is already in its
dictionary/base form, is a multi-word phrase or full sentence, or isn't the kind of word that has a
distinct base form (most nouns, adverbs, etc), set both to null.

"structure" is a SHORT formulaic label naming the main grammatical construction. For Spanish, style
it like "como si + pluperfect subjunctive" or "ir a + infinitive" or "se + indirect object + verb
(unplanned occurrences)" — a trigger/connector word or fixed element plus the grammatical term for
what follows. For Japanese, style it like "〜たら + past tense (conditional)" or "〜ている (progressive/
resultative)" or "〜ば〜ほど (the more..., the more...)" — the grammar pattern itself plus a short
gloss of what it does. Not a full sentence either way. If multiple constructions are present, name
the most notable one only. Keep it under 8 words.

"explanation" is 2-4 short sentences, in plain teaching language (not linguistics jargon), covering
whatever is actually notable — which tense/mood/form is used and why, any fixed idiomatic
expressions and what they really mean, particles and what they're doing (Japanese), reflexive
constructions, unusual word order, sequence-of-tenses logic, politeness/register level (Japanese).
If a surrounding sentence is provided for context, use it to judge form correctly, but only explain
the phrase itself, not the whole sentence. If nothing is particularly notable, keep the explanation
brief rather than padding it out.`;

function callClaudeForGrammarExplain(phrase, context) {
  const userMessage = context && context.trim() && context.trim() !== phrase.trim()
    ? `Phrase: "${phrase}"\nFull sentence for context: "${context}"`
    : `Phrase: "${phrase}"`;
  return callClaudeJSON(GRAMMAR_EXPLAIN_PROMPT, userMessage, 300);
}

// Powers the "Generate 3 examples" box on the vocab-add panel (Reading
// bubble) — the whole point is to show the word being saved used in a
// few natural sentences, in EXACTLY the form the learner is saving
// (whatever conjugation/inflection that is), not some other tense —
// generating 3 sentences that all quietly switched to the infinitive
// would defeat the purpose.
const GENERATE_EXAMPLES_PROMPT = `You are a language tutor writing short example sentences for a
vocabulary flashcard. You'll be given a word or short phrase, its language, and its English meaning.
Respond with ONLY a JSON object (no markdown, no code fences, no explanation) with exactly this
shape:

{ "examples": [
    { "text": string, "furigana": string or null, "translation": string },
    { "text": string, "furigana": string or null, "translation": string },
    { "text": string, "furigana": string or null, "translation": string }
] }

Write exactly 3 short, natural example sentences IN THE TARGET LANGUAGE, each one actually using the
word/phrase somewhere in it. Use the word EXACTLY as given — the same form, tense, and conjugation —
do not change it to the infinitive or to a different tense/person in any of the three sentences, even
if that reads a little unusual as a standalone example. Keep each sentence short (roughly 4-10 words)
and natural, suitable for a beginner/intermediate learner, and vary the context across the three so
they aren't just minor rewordings of each other. "translation" is a natural English translation of
that exact sentence. For Japanese, write the sentence normally (kanji where natural) in "text" — do
NOT include furigana in "text" itself — and separately give the WHOLE sentence's reading, entirely in
hiragana (convert any katakana too), as "furigana". For Spanish or French, set "furigana" to null.`;

function callClaudeForExampleSentences(word, language, meaning) {
  const userMessage = `Word/phrase: "${word}". Language: ${LANGUAGE_NAMES[language] || language}. English meaning: "${meaning || ""}".`;
  return callClaudeJSON(GENERATE_EXAMPLES_PROMPT, userMessage, 700);
}

// Used by the Grammar bubble's own "structure card" notes — a learner
// writes their OWN example sentence(s) for a grammar pattern they're
// naming and explaining themselves (e.g. a card titled "Intention" for
// 〜てほしい), and each example gets a light, fast correctness check as
// they type it. This is deliberately narrower than the Writing bubble's
// full-entry grammar check: it's one short sentence at a time, checked
// only against "is this grammatically valid," not against the rest of a
// paragraph — and it's told what pattern the learner is trying to
// demonstrate so it can flag an example that's grammatical but doesn't
// actually show the pattern, not just flag typos.
const CHECK_EXAMPLE_SENTENCE_PROMPT = `You are a careful, encouraging language tutor checking ONE
example sentence a learner wrote for their own grammar notes (Spanish or Japanese — you'll be told
which). They're building a note about a specific grammar pattern and wrote this sentence to
illustrate it. Respond with ONLY a JSON object (no markdown, no code fences, no explanation) with
exactly this shape:

{ "isCorrect": boolean, "corrected": string, "note": string }

Rules:
- "corrected" is the sentence with any real grammar errors fixed (wrong conjugation, agreement,
  wrong/missing particles, wrong tense/aspect, word order, misspellings). If the sentence is already
  correct, "corrected" must be identical to the input.
- Judge ONLY grammatical correctness of the sentence itself — do not rewrite for style, do not swap
  in different vocabulary, do not "improve" a sentence that's already valid just because you'd have
  phrased it differently.
- If the learner told you what pattern/structure the sentence is meant to demonstrate, and the
  sentence is grammatically fine but doesn't actually use or show that pattern, still set
  "isCorrect": true (it's not a grammar error) but use "note" to gently flag the mismatch instead —
  e.g. "This is correct, but doesn't use 〜てほしい — did you mean to include it?"
- "isCorrect" is false only for an actual grammar mistake (not a style choice, not a mismatch with
  the intended pattern — see above).
- "note" is ONE short sentence in plain teaching language (no linguistics jargon) explaining what was
  wrong, when isCorrect is false, or a brief pattern-mismatch note as described above. Leave it as an
  empty string "" if the sentence is correct and does illustrate the pattern with nothing worth
  flagging.
- Judge Spanish or Japanese as told by the language given — never mix the two.`;

function callClaudeForExampleCheck(text, language, patternContext) {
  const userMessage = patternContext && patternContext.trim()
    ? `Language: ${LANGUAGE_NAMES[language] || language}.\nPattern this sentence is meant to demonstrate: ${patternContext.trim()}\n\nExample sentence: ${text}`
    : `Language: ${LANGUAGE_NAMES[language] || language}.\n\nExample sentence: ${text}`;
  return callClaudeJSON(CHECK_EXAMPLE_SENTENCE_PROMPT, userMessage, 500);
}

// Used when saving a Grammar structure card — identifies what specific
// grammar point the card's header/explanation/examples actually
// describe, so the app can later generate fresh practice for exactly
// that point. Deliberately allowed to say "no clear point" rather than
// forcing a label onto examples that don't actually share one — a
// wrong/forced label would produce useless practice later.
const CLASSIFY_GRAMMAR_POINT_PROMPT = `You are a language tutor reviewing a learner's own grammar
note (Spanish or Japanese — you'll be told which). They've named a pattern, explained it in their own
words, and written their own example sentence(s). Respond with ONLY a JSON object (no markdown, no
code fences, no explanation) with exactly this shape:

{ "label": string or null, "note": string }

Rules:
- "label" is a short, precise name for the grammatical construction actually being demonstrated —
  formal enough to be useful (e.g. "〜てほしい (want someone else to do something)" or "estar + gerund
  (progressive aspect)"), but still readable to a learner, not raw linguistics jargon on its own.
- Base "label" on what the example sentences actually show, not just the learner's own header/
  explanation text — if their name/explanation is close but the examples reveal it's really a
  slightly different or more specific construction, label the construction the examples actually
  demonstrate.
- Set "label" to null if: there are no example sentences to judge from, the example(s) don't share a
  single clear grammatical construction (e.g. they're about entirely different, unrelated patterns),
  or the "pattern" described is really just vocabulary/a fixed phrase rather than a grammatical
  construction. Don't force a label onto something incoherent.
- "note" is ONE short, encouraging sentence. If "label" is set, briefly confirm what was recognized
  (e.g. "This is the てほしい construction for wanting someone else to do something."). If "label" is
  null, briefly and kindly explain why no single clear point was found and what would help (e.g. "These
  two examples show different constructions — try keeping one pattern per card, or add another example
  of the same one.").
- Judge Spanish or Japanese as told by the language given — never mix the two.`;

function grammarCardContextForPrompt(header, explanation, examples) {
  const exampleLines = (examples || [])
    .filter((ex) => ex && ex.target)
    .map((ex) => `- ${ex.target}${ex.translation ? ` (${ex.translation})` : ""}`)
    .join("\n");
  return `Pattern name: ${header}\nLearner's explanation: ${explanation || "(none given)"}\nExample sentences:\n${exampleLines || "(none given)"}`;
}

function callClaudeForClassifyGrammarPoint(header, explanation, examples, language) {
  const userMessage = `Language: ${LANGUAGE_NAMES[language] || language}.\n\n${grammarCardContextForPrompt(header, explanation, examples)}`;
  return callClaudeJSON(CLASSIFY_GRAMMAR_POINT_PROMPT, userMessage, 500);
}

// Powers a structure card's "Test me on this" practice — only offered
// once a card has a recognized label (see classify above). Generates
// FRESH situational prompts + model answers for the same construction,
// distinct from the learner's own saved examples, for self-graded
// (reveal-the-answer) practice rather than a strict auto-graded quiz —
// there are usually several valid phrasings for a given situation, so
// exact-match grading would punish correct answers unfairly.
const GENERATE_CARD_PRACTICE_PROMPT = `You are a language tutor generating short practice for a
learner's own grammar note (Spanish or Japanese — you'll be told which). Respond with ONLY a JSON
object (no markdown, no code fences, no explanation) with exactly this shape:

{ "items": [ { "promptEnglish": string, "exampleAnswer": string }, ... ] }

Rules:
- Generate exactly 3 items.
- "promptEnglish" is a short situation in English that calls for this exact construction, phrased so
  the learner has to produce it themselves (e.g. "Say you want your friend to call you back." or "Say
  it looks like it's about to rain.") — not a direct fill-in-the-blank of the construction's own
  wording, and not a translation of one of the learner's own example sentences.
- "exampleAnswer" is ONE natural, correct sentence in the target language that correctly answers
  "promptEnglish" using this construction — this is a model answer for the learner to compare their
  own attempt against, not the only acceptable phrasing, so keep it natural rather than contrived.
- Do not reuse or lightly reword any of the learner's own example sentences or any sentence listed to
  avoid repeating.
- Judge Spanish or Japanese as told by the language given — never mix the two.`;

function callClaudeForCardPractice(header, explanation, label, examples, language, excludeSentences) {
  const excludeLines = (excludeSentences || []).length
    ? `\n\nDo not reuse or lightly reword any of these:\n${excludeSentences.map((s) => `- ${s}`).join("\n")}`
    : "";
  const labelLine = label ? `Recognized grammar point: ${label}\n` : "";
  const userMessage = `Language: ${LANGUAGE_NAMES[language] || language}.\n\n${labelLine}${grammarCardContextForPrompt(header, explanation, examples)}${excludeLines}`;
  return callClaudeJSON(GENERATE_CARD_PRACTICE_PROMPT, userMessage, 800);
}

// Used by the Writing bubble's "Grammar check" button — a full-sentence
// pass over an entire journal entry, distinct from (and independent of)
// "Vocab check": Vocab check only resolves <bracketed> unknown words via
// a plain dictionary lookup; Grammar check reads the whole entry for
// real sentence-level correctness (conjugation, agreement, particles,
// word order, spelling/punctuation) — the two are separate buttons on
// purpose, so a teacher could eventually permit one without the other.
// Grammar concepts a correction can optionally be tagged with — kept in
// sync by hand with js/grammar-concepts.js on the frontend. Only tag a
// correction with one of these EXACT keys if it's a genuinely clean
// match; everything else gets concept: null, which just means "no
// practice generator exists for this one yet," not that it's wrong.
const GRAMMAR_CONCEPT_KEYS = {
  "verb-transitivity": {
    label: "Transitive vs Intransitive Verbs",
    languages: ["ja"],
    hint: "the learner used a transitive verb where an intransitive one was needed, or vice versa (e.g. 開く vs 開ける, 止まる vs 止める) — a mismatch in whether the verb takes a direct object, not a conjugation or tense error",
  },
};

function grammarConceptListForPrompt() {
  return Object.entries(GRAMMAR_CONCEPT_KEYS)
    .map(([key, def]) => `  - "${key}" (${def.label}, ${def.languages.join("/")} only): ${def.hint}`)
    .join("\n");
}

const WRITING_GRAMMAR_CHECK_PROMPT = `You are a careful, encouraging language tutor grammar-checking
a learner's own journal/diary entry (Spanish or Japanese — you'll be told which). Respond with ONLY
a JSON object (no markdown, no code fences, no explanation) with exactly this shape:

{
  "correctedText": string,
  "corrections": [ { "original": string, "corrected": string, "explanation": string, "concept": string or null }, ... ]
}

Rules:
- "correctedText" is the FULL entry, corrected — same paragraph breaks, same overall content and
  voice, with only actual errors fixed: wrong conjugations, subject/verb or gender/number agreement,
  wrong or missing particles (Japanese: は/が/を/に/で/へ/と/も etc.), wrong tense/aspect, incorrect
  word order, missing or wrong punctuation, misspellings, and similar real mistakes.
- Do NOT rewrite for style, do NOT swap in fancier or different vocabulary, do NOT shorten or
  restructure sentences that are already grammatically correct, even if you'd have phrased it
  differently. Preserve the learner's own word choices and voice wherever they're grammatically
  valid. This is a grammar check, not an editor's rewrite.
- If the text contains placeholder brackets like <word>, <a phrase>, or full-width ＜word＞ — leave
  those EXACTLY as they appear, untouched, character for character. They're pending vocabulary the
  learner hasn't resolved yet, not real target-language text, and are not part of this check.
- If the entry has no errors at all, set "correctedText" identical to the input text and
  "corrections" to an empty array — don't invent changes just to have something to report.
- "corrections" lists every distinct fix you made, each as one entry. Each "corrected" value MUST
  appear verbatim, character-for-character, as a substring somewhere in "correctedText" (this is
  used to highlight exactly what changed) — keep each "corrected"/"original" pair as short and
  localized as the fix allows (usually just the word or short phrase that actually changed), but
  include enough surrounding words to make sense if the fix is a reordering or involves more than
  one word. Don't list the same correction twice, and don't list a whole sentence when only one word
  in it changed.
- "explanation" is ONE short sentence, in plain teaching language (no linguistics jargon), naming
  what was wrong and why the correction is right (e.g. "Preterite needed here since it's a
  completed action, not imperfect for background description" or "は marks the topic here since
  it's already been introduced, not が").
- "concept" is EITHER null OR one of these exact keys, if (and only if) the correction is a clean
  match for it:
${grammarConceptListForPrompt()}
  Leave it null for anything else, including any correction that's merely "related" to one of these
  topics without actually being that specific mistake — false positives are worse than missing one.
  Never invent a new concept key of your own.
- Judge Spanish or Japanese as told by the language given — never mix the two.`;

// correctedText alone runs roughly as long as the entry itself, plus a
// corrections array with one explanation sentence per fix on top of
// that — AND, on top of that, this model's adaptive thinking (on by
// default, and not separately budgeted — see callClaudeJSON) can burn
// a large, unpredictable chunk of max_tokens on reasoning before it
// even starts the actual answer. A fixed budget can't promise enough
// headroom for every entry, so this retries once at a much larger
// budget specifically when the first attempt was cut off, rather than
// just picking one bigger static number and hoping.
async function callClaudeForWritingGrammarCheck(text, language) {
  const userMessage = `Language: ${LANGUAGE_NAMES[language] || language}.\n\nEntry:\n${text}`;
  try {
    return await callClaudeJSON(WRITING_GRAMMAR_CHECK_PROMPT, userMessage, 12000, GRAMMAR_CHECK_MODEL);
  } catch (err) {
    if (!(err instanceof Error) || !/cut off before it finished/.test(err.message)) throw err;
    return callClaudeJSON(WRITING_GRAMMAR_CHECK_PROMPT, userMessage, 24000, GRAMMAR_CHECK_MODEL);
  }
}

// Powers a Grammar folder's "Practice this grammar point" option — only
// exists for folders tagged with a recognized, practice-able concept
// (see GRAMMAR_CONCEPT_KEYS above). Each concept needs its own prompt
// builder since the shape of "practice" differs per concept; only
// verb-transitivity (pair-recall) is implemented so far. A concept with
// no builder here simply can't be practiced yet, even if it's a
// recognized tag — matches the frontend's own practiceType gate.
const GRAMMAR_PRACTICE_PROMPT_BUILDERS = {
  "verb-transitivity": (excludeWords) => `You are generating flashcard-style practice pairs for a
Japanese learner studying transitive/intransitive verb pairs (e.g. 開く／開ける, 止まる／止める).
Respond with ONLY a JSON object (no markdown, no code fences, no explanation) with exactly this
shape:

{ "pairs": [ { "transitive": { "word": string, "furigana": string }, "intransitive": { "word": string, "furigana": string }, "meaning": string }, ... ] }

Rules:
- Return 8 distinct, common, genuinely-paired transitive/intransitive verbs (both members of the
  pair share the same root meaning and are commonly taught together, e.g. 開く(intransitive)/開ける
  (transitive) "to open").
- "word" is the dictionary/plain form written with normal kanji+kana (not romaji). "furigana" is
  the reading in hiragana only.
- "meaning" is a short shared English gloss for the pair, e.g. "open".
- Favor everyday, frequently-used verbs a learner would actually encounter, not obscure ones.
- Do not reuse any of these words (already seen this session): ${excludeWords.length ? excludeWords.join("、") : "(none yet)"}.`,
};

function callClaudeForGrammarPractice(concept, language, excludeWords) {
  const builder = GRAMMAR_PRACTICE_PROMPT_BUILDERS[concept];
  const conceptDef = GRAMMAR_CONCEPT_KEYS[concept];
  if (!builder || !conceptDef || !conceptDef.languages.includes(language)) {
    return Promise.reject(new Error("No practice generator available for this grammar concept."));
  }
  const prompt = builder(Array.isArray(excludeWords) ? excludeWords : []);
  return callClaudeJSON(prompt, "Generate the practice set now.", 1500);
}

// Used by the Vocab Bank's "Import a vocab list" bulk-add option — a
// learner pastes a whole vocabulary list (their own notes, something
// copied from a textbook/worksheet/website) and this turns it into
// clean { targetLang, english } pairs for them to review before
// saving, rather than typing each word into the single-word form one
// at a time.
const VOCAB_LIST_EXTRACT_PROMPT = `You are helping a learner import a vocabulary list into their
flashcard app. You'll be given a block of pasted text -- a vocabulary list copied from somewhere
(a textbook, worksheet, website, or their own notes) -- plus which language it's for. Respond with
ONLY a JSON object (no markdown, no code fences, no explanation) with exactly this shape:

{ "words": [ { "targetLang": string, "english": string, "furigana": string or null }, ... ] }

Rules:
- Pull out every distinct vocabulary entry from the text, in the order they appear, and turn each
  into one { "targetLang", "english" } pair.
- Figure out which side of each entry is English and which is the target language yourself.
  Pasted lists are inconsistent about order -- some go "word - translation", some go
  "translation - word", some are two columns that got merged line by line -- don't assume one fixed
  order for the whole list; judge each entry on its own.
- If BOTH sides are already given for an entry, use them exactly as given rather than
  re-translating (preserve their wording).
- If only ONE side is given for an entry (just a target-language word with no visible English, or
  vice versa), translate the missing side yourself.
- Strip formatting noise: numbering ("1.", "2)"), bullets, dashes/colons used purely as separators,
  and stray punctuation that isn't part of the word itself.
- Skip lines that clearly aren't vocabulary entries at all -- blank lines, section titles
  ("Unit 3 Vocabulary", "Food & Drink"), page numbers, instructions to the reader.
- If the target language is Japanese, "furigana" is that entry's reading written entirely in
  hiragana (convert any katakana in the reading to hiragana too); for any other target language,
  "furigana" is always null.
- If you genuinely can't tell what an entry means, leave it out rather than guessing.
- If the text has nothing in it that looks like vocabulary, return { "words": [] }.`;

function callClaudeForVocabListExtract(text, language) {
  const userMessage = `Target language: ${LANGUAGE_NAMES[language] || language}.\n\nPasted list:\n${text}`;
  return callClaudeJSON(VOCAB_LIST_EXTRACT_PROMPT, userMessage, 4000);
}

// Anthropic's output content filter is a separate, somewhat
// probabilistic pass after generation — it can trip on a screenshot
// that's completely benign (nothing to do with our prompt) and often
// succeeds on a plain retry. Worth a couple of automatic retries before
// giving up and telling the user.
function isContentFilterError(err) {
  return /content filtering/i.test(err.message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Screenshot -> passage text, for the Reading bubble's "upload an image
// instead of copy/pasting" option. Plain-text response (not JSON) since
// the only output we want is the transcription itself.
function callClaudeVisionExtractOnce(base64Image, mediaType) {
  return new Promise((resolve, reject) => {
    if (!API_KEY) {
      reject(new Error("ANTHROPIC_API_KEY is not set — copy .env.example to .env and add your key."));
      return;
    }

    const payload = JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64Image } },
            {
              type: "text",
              text:
                "Transcribe all the readable body text in this image exactly as written (fix nothing, " +
                "don't translate). Preserve paragraph breaks as blank lines, but don't insert a line " +
                "break just because a line wrapped in the image. Ignore UI chrome, headers/footers, " +
                "page numbers, and watermarks unless they're clearly part of the passage itself. " +
                "Respond with ONLY the transcribed text — no commentary, no markdown, no quotes.",
            },
          ],
        },
      ],
    });

    const req = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01",
          "content-length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        // Collect raw Buffer chunks and decode ONCE at the end, rather
        // than `body += chunk` (implicitly stringifying each chunk on
        // its own) — a multi-byte UTF-8 character (any Japanese text,
        // for example) can land split across two chunks on the wire,
        // and decoding each chunk in isolation mangles that character
        // into a replacement glyph (�) instead of waiting for the full
        // byte sequence.
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode !== 200) {
            reject(new Error(`Claude API error ${res.statusCode}: ${body}`));
            return;
          }
          try {
            const data = JSON.parse(body);
            const textBlock = Array.isArray(data.content) ? data.content.find((b) => b && b.type === "text" && b.text) : null;
            if (!textBlock) {
              const snippet = body.length > 600 ? `${body.slice(0, 600)}…` : body;
              reject(new Error(`Unexpected response shape from Claude API. Raw response: ${snippet}`));
              return;
            }
            resolve({ text: textBlock.text.trim() });
          } catch (e) {
            reject(new Error("Could not parse Claude's response: " + e.message));
          }
        });
      }
    );

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function callClaudeVisionExtract(base64Image, mediaType) {
  const MAX_ATTEMPTS = 3;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await callClaudeVisionExtractOnce(base64Image, mediaType);
    } catch (err) {
      lastErr = err;
      if (!isContentFilterError(err) || attempt === MAX_ATTEMPTS) break;
      console.warn(`  content filter hit on attempt ${attempt}, retrying...`);
      await sleep(400 * attempt);
    }
  }
  if (isContentFilterError(lastErr)) {
    throw new Error(
      "Anthropic's content filter blocked this a few times in a row — try cropping the screenshot down " +
        "to just the passage text (no other tabs/windows/photos in frame), or paste the text instead."
    );
  }
  throw lastErr;
}

// Serves the app's own static files (the HTML/CSS/JS one level up from
// this file) so the whole thing can run as a single deployed service —
// one URL for both the pages and the API, no separate static host and
// no CORS setup needed for that half. Only used as a fallback, after
// every API route above has already had a chance to match.
const STATIC_ROOT = path.join(__dirname, "..");
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

/*
  ---- Accounts / cross-device sync helpers ----

  Everything below this comment and above serveStaticFile is the
  accounts + per-user data sync layer: cookie-based sessions backed by
  db.js's SQLite tables, replacing what used to be plain browser
  localStorage. Auth is invite-only — there's no public signup route;
  Mei's own account is bootstrapped from ADMIN_EMAIL/ADMIN_PASSWORD env
  vars on first boot (see bottom of file), and she creates any other
  account (e.g. a tester's) herself via the admin-only /api/admin/
  create-user route, from admin.html.
*/

const SESSION_COOKIE_NAME = "idikai_session";

function readJSONBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    req.on("data", (chunk) => {
      chunks.push(chunk);
      bytes += chunk.length;
      if (bytes > maxBytes) {
        req.destroy();
        reject(new Error("Request body too large."));
      }
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(";").forEach((part) => {
    const eq = part.indexOf("=");
    if (eq === -1) return;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function getSessionUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;
  return db.findUserBySessionToken(token);
}

// Render terminates TLS in front of the app, so req.socket.encrypted
// isn't a reliable signal — x-forwarded-proto is what Render actually
// sets. Locally (plain http://localhost) neither is set, so the
// cookie correctly comes back non-Secure for local dev.
function isHttpsRequest(req) {
  return req.headers["x-forwarded-proto"] === "https";
}

function setSessionCookie(res, req, token, expiresAt) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (isHttpsRequest(req)) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res, req) {
  const parts = [`${SESSION_COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Expires=Thu, 01 Jan 1970 00:00:00 GMT"];
  if (isHttpsRequest(req)) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function sendJSON(res, statusCode, body) {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

// Handles every /api/* route. Returns true if it handled the request
// (caller should stop), false if the path didn't match anything here.
function handleApiRoute(req, res, url) {
  // ---- POST /api/login { email, password } ----
  if (url.pathname === "/api/login" && req.method === "POST") {
    readJSONBody(req, 10 * 1024)
      .then(({ email, password }) => {
        if (!email || !password) return sendJSON(res, 400, { error: "Missing email or password." });
        const user = db.findUserByEmail(email);
        if (!user || !db.verifyPassword(password, user.password_salt, user.password_hash)) {
          return sendJSON(res, 401, { error: "Incorrect email or password." });
        }
        const session = db.createSession(user.id);
        setSessionCookie(res, req, session.token, session.expiresAt);
        sendJSON(res, 200, { ok: true, user: { email: user.email, isAdmin: !!user.is_admin } });
      })
      .catch((err) => sendJSON(res, 400, { error: err.message }));
    return true;
  }

  // ---- POST /api/logout ----
  if (url.pathname === "/api/logout" && req.method === "POST") {
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE_NAME];
    if (token) db.deleteSession(token);
    clearSessionCookie(res, req);
    sendJSON(res, 200, { ok: true });
    return true;
  }

  // ---- GET /api/me ----
  if (url.pathname === "/api/me" && req.method === "GET") {
    const user = getSessionUser(req);
    if (!user) return sendJSON(res, 401, { error: "Not logged in." }) || true;
    sendJSON(res, 200, { user: { email: user.email, isAdmin: !!user.is_admin } });
    return true;
  }

  // ---- GET /api/data (this account's full synced data blob) ----
  if (url.pathname === "/api/data" && req.method === "GET") {
    const user = getSessionUser(req);
    if (!user) return sendJSON(res, 401, { error: "Not logged in." }) || true;
    sendJSON(res, 200, db.getAllUserData(user.id));
    return true;
  }

  // ---- POST /api/data { key, value } (upsert one storage key) ----
  if (url.pathname === "/api/data" && req.method === "POST") {
    const user = getSessionUser(req);
    if (!user) return sendJSON(res, 401, { error: "Not logged in." }) || true;
    readJSONBody(req, 5 * 1024 * 1024)
      .then(({ key, value }) => {
        if (!key) return sendJSON(res, 400, { error: "Missing key." });
        db.setUserData(user.id, key, value);
        sendJSON(res, 200, { ok: true });
      })
      .catch((err) => sendJSON(res, 400, { error: err.message }));
    return true;
  }

  // ---- POST /api/import { data: {...} } ----
  // One-time (or safely re-runnable) bulk import for the "bring my old
  // browser's localStorage into my new account" migration page. Never
  // overwrites a key the account already has a value for.
  if (url.pathname === "/api/import" && req.method === "POST") {
    const user = getSessionUser(req);
    if (!user) return sendJSON(res, 401, { error: "Not logged in." }) || true;
    readJSONBody(req, 20 * 1024 * 1024)
      .then(({ data }) => {
        if (!data || typeof data !== "object") return sendJSON(res, 400, { error: "Missing data object." });
        const result = db.importUserData(user.id, data, false);
        sendJSON(res, 200, { ok: true, ...result });
      })
      .catch((err) => sendJSON(res, 400, { error: err.message }));
    return true;
  }

  // ---- GET /api/export (download this account's full data as JSON) ----
  // A one-click, always-available safety net for the account owner —
  // completely independent of the server's own automatic backups, so
  // there's always an off-server copy too if anything ever goes wrong.
  if (url.pathname === "/api/export" && req.method === "GET") {
    const user = getSessionUser(req);
    if (!user) return sendJSON(res, 401, { error: "Not logged in." }) || true;
    const data = db.getAllUserData(user.id);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `idikai-export-${stamp}.json`;
    res.writeHead(200, {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${filename}"`,
    });
    res.end(JSON.stringify(data, null, 2));
    return true;
  }

  // ---- GET /api/admin/backups (admin only) — list automatic full-DB backups ----
  if (url.pathname === "/api/admin/backups" && req.method === "GET") {
    const user = getSessionUser(req);
    if (!user) return sendJSON(res, 401, { error: "Not logged in." }) || true;
    if (!user.is_admin) return sendJSON(res, 403, { error: "Admin only." }) || true;
    sendJSON(res, 200, { backups: db.listBackups() });
    return true;
  }

  // ---- POST /api/admin/backups (admin only) — trigger a backup right now ----
  if (url.pathname === "/api/admin/backups" && req.method === "POST") {
    const user = getSessionUser(req);
    if (!user) return sendJSON(res, 401, { error: "Not logged in." }) || true;
    if (!user.is_admin) return sendJSON(res, 403, { error: "Admin only." }) || true;
    const dest = db.backupDatabase();
    if (!dest) return sendJSON(res, 500, { error: "Backup failed — check server logs." }) || true;
    sendJSON(res, 200, { ok: true });
    return true;
  }

  // ---- GET /api/admin/backups/:filename (admin only) — download one raw .db backup ----
  if (url.pathname.startsWith("/api/admin/backups/") && req.method === "GET") {
    const user = getSessionUser(req);
    if (!user) return sendJSON(res, 401, { error: "Not logged in." }) || true;
    if (!user.is_admin) return sendJSON(res, 403, { error: "Admin only." }) || true;
    const name = decodeURIComponent(url.pathname.slice("/api/admin/backups/".length));
    const full = db.getBackupPath(name);
    if (!full) return sendJSON(res, 404, { error: "Backup not found." }) || true;
    res.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${name}"`,
    });
    fs.createReadStream(full).pipe(res);
    return true;
  }

  // ---- GET /api/admin/users (admin only) ----
  if (url.pathname === "/api/admin/users" && req.method === "GET") {
    const user = getSessionUser(req);
    if (!user) return sendJSON(res, 401, { error: "Not logged in." }) || true;
    if (!user.is_admin) return sendJSON(res, 403, { error: "Admin only." }) || true;
    sendJSON(res, 200, { users: db.listUsers() });
    return true;
  }

  // ---- POST /api/admin/create-user { email, password } (admin only) ----
  // The whole "invite-only" story: there is no public signup route at
  // all, only this one, gated on an existing admin's session.
  if (url.pathname === "/api/admin/create-user" && req.method === "POST") {
    const user = getSessionUser(req);
    if (!user) return sendJSON(res, 401, { error: "Not logged in." }) || true;
    if (!user.is_admin) return sendJSON(res, 403, { error: "Admin only." }) || true;
    readJSONBody(req, 10 * 1024)
      .then(({ email, password }) => {
        if (!email || !password) return sendJSON(res, 400, { error: "Missing email or password." });
        if (password.length < 8) return sendJSON(res, 400, { error: "Password must be at least 8 characters." });
        if (db.findUserByEmail(email)) return sendJSON(res, 409, { error: "That email already has an account." });
        const created = db.createUser(email, password, false);
        sendJSON(res, 200, { ok: true, user: { email: created.email } });
      })
      .catch((err) => sendJSON(res, 400, { error: err.message }));
    return true;
  }

  return false;
}

function serveStaticFile(res, pathname) {
  const decoded = decodeURIComponent(pathname);
  const requestedPath = decoded === "/" ? "/welcome.html" : decoded;

  // Defense in depth, on top of the path-traversal check below: never
  // serve anything under server/ (where the real .env with the API key
  // lives) or any dotfile/dot-directory, whether or not ".." is involved.
  const segments = requestedPath.split("/").filter(Boolean);
  if (segments[0] === "server" || segments.some((s) => s.startsWith("."))) {
    return false;
  }

  const resolved = path.normalize(path.join(STATIC_ROOT, requestedPath));
  const relative = path.relative(STATIC_ROOT, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return false;
  }

  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    return false;
  }

  const ext = path.extname(resolved).toLowerCase();
  res.writeHead(200, { "content-type": MIME_TYPES[ext] || "application/octet-stream" });
  fs.createReadStream(resolved).pipe(res);
  return true;
}

const server = http.createServer((req, res) => {
  // vocab.html is opened as a plain file (origin "null"), so this needs
  // to allow any origin to call it. It only ever runs on localhost.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname.startsWith("/api/") && handleApiRoute(req, res, url)) {
    return;
  }

  if (url.pathname === "/lookup" && req.method === "GET") {
    const word = url.searchParams.get("word");
    const fromLang = url.searchParams.get("from");
    const toLang = url.searchParams.get("to");

    if (!word || !fromLang || !toLang) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Missing word, from, or to query param." }));
      return;
    }

    console.log(`Looking up "${word}" (${fromLang} -> ${toLang})...`);

    callClaude(word, fromLang, toLang)
      .then((result) => {
        console.log("  ->", JSON.stringify(result));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
      })
      .catch((err) => {
        console.error(err.message);
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  if (url.pathname === "/lookup-kanji" && req.method === "GET") {
    const kanji = url.searchParams.get("kanji");
    const context = url.searchParams.get("context") || "";

    if (!kanji) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Missing kanji query param." }));
      return;
    }

    console.log(`Looking up kanji "${kanji}"...`);

    callClaudeForKanjiLookup(kanji, context)
      .then((result) => {
        console.log("  ->", JSON.stringify(result));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
      })
      .catch((err) => {
        console.error(err.message);
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  if (url.pathname === "/explain-grammar" && req.method === "GET") {
    const phrase = url.searchParams.get("phrase");
    const context = url.searchParams.get("context") || "";

    if (!phrase) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Missing phrase query param." }));
      return;
    }

    console.log(`Explaining grammar for "${phrase}"...`);

    callClaudeForGrammarExplain(phrase, context)
      .then((result) => {
        console.log("  ->", JSON.stringify(result));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
      })
      .catch((err) => {
        console.error(err.message);
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  if (url.pathname === "/generate-examples" && req.method === "GET") {
    const word = url.searchParams.get("word");
    const language = url.searchParams.get("language") || "es";
    const meaning = url.searchParams.get("meaning") || "";

    if (!word) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Missing word query param." }));
      return;
    }

    console.log(`Generating example sentences for "${word}" (${language})...`);

    callClaudeForExampleSentences(word, language, meaning)
      .then((result) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
      })
      .catch((err) => {
        console.error(err.message);
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  if (url.pathname === "/check-example-sentence" && req.method === "POST") {
    const bodyChunks = [];
    let bodyBytes = 0;
    req.on("data", (chunk) => {
      bodyChunks.push(chunk);
      bodyBytes += chunk.length;
      // One example sentence — nowhere near this needs to be, generous
      // headroom same as the other small POST endpoints.
      if (bodyBytes > 512 * 1024) req.destroy();
    });
    req.on("end", () => {
      const rawBody = Buffer.concat(bodyChunks).toString("utf8");
      let parsed;
      try {
        parsed = JSON.parse(rawBody);
      } catch (e) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON body." }));
        return;
      }

      const { text, language, patternContext } = parsed;
      if (!text || !language) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Missing text or language." }));
        return;
      }

      console.log(`Checking example sentence (${language}): "${text}"...`);

      callClaudeForExampleCheck(text, language, patternContext)
        .then((result) => {
          console.log("  ->", JSON.stringify(result));
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(result));
        })
        .catch((err) => {
          console.error(err.message);
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        });
    });
    return;
  }

  if (url.pathname === "/classify-grammar-point" && req.method === "POST") {
    const bodyChunks = [];
    let bodyBytes = 0;
    req.on("data", (chunk) => {
      bodyChunks.push(chunk);
      bodyBytes += chunk.length;
      if (bodyBytes > 512 * 1024) req.destroy();
    });
    req.on("end", () => {
      const rawBody = Buffer.concat(bodyChunks).toString("utf8");
      let parsed;
      try {
        parsed = JSON.parse(rawBody);
      } catch (e) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON body." }));
        return;
      }

      const { header, explanation, examples, language } = parsed;
      if (!header || !language) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Missing header or language." }));
        return;
      }

      console.log(`Classifying grammar point "${header}" (${language})...`);

      callClaudeForClassifyGrammarPoint(header, explanation, examples, language)
        .then((result) => {
          console.log("  ->", JSON.stringify(result));
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(result));
        })
        .catch((err) => {
          console.error(err.message);
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        });
    });
    return;
  }

  if (url.pathname === "/generate-card-practice" && req.method === "POST") {
    const bodyChunks = [];
    let bodyBytes = 0;
    req.on("data", (chunk) => {
      bodyChunks.push(chunk);
      bodyBytes += chunk.length;
      if (bodyBytes > 512 * 1024) req.destroy();
    });
    req.on("end", () => {
      const rawBody = Buffer.concat(bodyChunks).toString("utf8");
      let parsed;
      try {
        parsed = JSON.parse(rawBody);
      } catch (e) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON body." }));
        return;
      }

      const { header, explanation, label, examples, language, excludeSentences } = parsed;
      if (!header || !language) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Missing header or language." }));
        return;
      }

      console.log(`Generating practice for "${header}" (${language})...`);

      callClaudeForCardPractice(header, explanation, label, examples, language, excludeSentences)
        .then((result) => {
          const count = (result && result.items && result.items.length) || 0;
          console.log(`  -> ${count} item(s)`);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(result));
        })
        .catch((err) => {
          console.error(err.message);
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        });
    });
    return;
  }

  if (url.pathname === "/check-conjugation" && req.method === "GET") {
    const infinitive = url.searchParams.get("infinitive");
    const tense = url.searchParams.get("tense");
    const person = url.searchParams.get("person");
    const expected = url.searchParams.get("expected");
    const userAnswer = url.searchParams.get("userAnswer");

    if (!infinitive || !tense || !person || !expected || userAnswer === null) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Missing infinitive, tense, person, expected, or userAnswer." }));
      return;
    }

    console.log(`Checking "${userAnswer}" against "${expected}" (${infinitive}, ${tense}, ${person})...`);

    callClaudeForConjugationCheck(infinitive, tense, person, expected, userAnswer)
      .then((result) => {
        console.log("  ->", JSON.stringify(result));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
      })
      .catch((err) => {
        console.error(err.message);
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  if (url.pathname === "/extract-text" && req.method === "POST") {
    // Buffer chunks, decode once at the end (not `rawBody += chunk`) —
    // see the matching comment on callClaudeJSON's response reader for
    // why: stringifying each chunk separately can split and corrupt a
    // multi-byte UTF-8 character.
    const bodyChunks = [];
    let bodyBytes = 0;
    req.on("data", (chunk) => {
      bodyChunks.push(chunk);
      bodyBytes += chunk.length;
      // Screenshots can be a few MB once base64-encoded — bail out well
      // before anything unreasonable rather than buffering forever.
      if (bodyBytes > 15 * 1024 * 1024) req.destroy();
    });
    req.on("end", () => {
      const rawBody = Buffer.concat(bodyChunks).toString("utf8");
      let parsed;
      try {
        parsed = JSON.parse(rawBody);
      } catch (e) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON body." }));
        return;
      }

      const { image, mediaType } = parsed;
      if (!image || !mediaType) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Missing image or mediaType." }));
        return;
      }

      console.log("Extracting text from an uploaded screenshot...");

      callClaudeVisionExtract(image, mediaType)
        .then((result) => {
          console.log(`  -> extracted ${result.text.length} characters`);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(result));
        })
        .catch((err) => {
          console.error(err.message);
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        });
    });
    return;
  }

  if (url.pathname === "/check-writing-grammar" && req.method === "POST") {
    // Buffer chunks, decode once — see the comment on /extract-text's
    // reader above (a Japanese entry makes this bug easy to hit).
    const bodyChunks = [];
    let bodyBytes = 0;
    req.on("data", (chunk) => {
      bodyChunks.push(chunk);
      bodyBytes += chunk.length;
      // A journal entry is plain text — generous headroom, nowhere near
      // an actually unreasonable entry length.
      if (bodyBytes > 2 * 1024 * 1024) req.destroy();
    });
    req.on("end", () => {
      const rawBody = Buffer.concat(bodyChunks).toString("utf8");
      let parsed;
      try {
        parsed = JSON.parse(rawBody);
      } catch (e) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON body." }));
        return;
      }

      const { text, language } = parsed;
      if (!text || !language) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Missing text or language." }));
        return;
      }

      console.log(`Grammar-checking a Writing entry (${language}, ${text.length} chars)...`);

      callClaudeForWritingGrammarCheck(text, language)
        .then((result) => {
          const count = (result && result.corrections && result.corrections.length) || 0;
          console.log(`  -> ${count} correction(s)`);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(result));
        })
        .catch((err) => {
          console.error(err.message);
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        });
    });
    return;
  }

  if (url.pathname === "/generate-grammar-practice" && req.method === "POST") {
    // Buffer chunks, decode once — see the comment on /extract-text's
    // reader above.
    const bodyChunks = [];
    let bodyBytes = 0;
    req.on("data", (chunk) => {
      bodyChunks.push(chunk);
      bodyBytes += chunk.length;
      if (bodyBytes > 200 * 1024) req.destroy(); // just a concept key + a short exclude list
    });
    req.on("end", () => {
      const rawBody = Buffer.concat(bodyChunks).toString("utf8");
      let parsed;
      try {
        parsed = JSON.parse(rawBody);
      } catch (e) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON body." }));
        return;
      }

      const { concept, language, excludeWords } = parsed;
      if (!concept || !language) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Missing concept or language." }));
        return;
      }

      console.log(`Generating grammar practice (${concept}, ${language})...`);

      callClaudeForGrammarPractice(concept, language, excludeWords)
        .then((result) => {
          const count = (result && result.pairs && result.pairs.length) || 0;
          console.log(`  -> ${count} practice pair(s)`);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(result));
        })
        .catch((err) => {
          console.error(err.message);
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        });
    });
    return;
  }

  if (url.pathname === "/extract-vocab-list" && req.method === "POST") {
    // Buffer chunks, decode once — see the comment on /extract-text's
    // reader above.
    const bodyChunks = [];
    let bodyBytes = 0;
    req.on("data", (chunk) => {
      bodyChunks.push(chunk);
      bodyBytes += chunk.length;
      // A pasted list is plain text, not an image — this is generous
      // headroom (a couple MB of text is an enormous list) well short
      // of anything unreasonable.
      if (bodyBytes > 2 * 1024 * 1024) req.destroy();
    });
    req.on("end", () => {
      const rawBody = Buffer.concat(bodyChunks).toString("utf8");
      let parsed;
      try {
        parsed = JSON.parse(rawBody);
      } catch (e) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON body." }));
        return;
      }

      const { text, language } = parsed;
      if (!text || !language) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Missing text or language." }));
        return;
      }

      console.log(`Extracting vocab list (${language}, ${text.length} chars)...`);

      callClaudeForVocabListExtract(text, language)
        .then((result) => {
          const count = (result && result.words && result.words.length) || 0;
          console.log(`  -> extracted ${count} pairs`);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(result));
        })
        .catch((err) => {
          console.error(err.message);
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        });
    });
    return;
  }

  if ((req.method === "GET" || req.method === "HEAD") && serveStaticFile(res, url.pathname)) {
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// First-boot bootstrap: creates Mei's own account automatically so
// there's a way in at all before any admin UI exists to use. Only
// fires when the users table is completely empty, so it's a one-time
// thing per database — safe to leave the env vars set permanently.
function bootstrapAdminAccount() {
  if (db.anyUsersExist()) return;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn(
      "⚠️  No accounts exist yet, and ADMIN_EMAIL/ADMIN_PASSWORD aren't set — nobody can log in. " +
        "Set both env vars and restart the server to create the first (admin) account."
    );
    return;
  }
  db.createUser(email, password, true);
  console.log(`Created admin account for ${email}.`);
}

// Full-database backups: one immediately on every boot (so a snapshot
// always exists right after a deploy, before anything can go wrong),
// then again on a fixed interval for as long as the process stays up.
// See db.js's backupDatabase() for how this stays safe to run while
// the live database is in active use.
const BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

function runScheduledBackup() {
  const dest = db.backupDatabase();
  if (dest) console.log(`Database backup saved: ${dest}`);
}

server.listen(PORT, () => {
  if (!API_KEY) {
    console.warn("⚠️  ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.");
  }
  bootstrapAdminAccount();
  runScheduledBackup();
  setInterval(runScheduledBackup, BACKUP_INTERVAL_MS);
  console.log(`Dictionary lookup server running at http://localhost:${PORT}`);
});
