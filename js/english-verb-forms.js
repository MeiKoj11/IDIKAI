/*
  english-verb-forms.js
  ----------------------
  Shared, local (no AI, no network) English verb conjugation — used to
  build natural-ish English cue sentences for the Conjugation Test
  feature (Spanish/French/Japanese all reuse this one module). Given an
  English gloss straight from a verb-data entry (e.g. "to speak", "to
  wake up (oneself)", "to speak, to talk"), returns the base verb plus
  its past / past-participle / gerund / third-person-singular forms.

  Deliberately NOT AI-backed: the curated verb lists this draws its
  glosses from are a small, stable, finite vocabulary (a few hundred
  entries across all three languages at most), so a hand-maintained
  irregular table plus regular-verb rules covers the vast majority
  correctly, instantly, and for free — no per-question API call needed.
  Anything not in the table just falls through to the regular -ed/-ing
  rules; the result may occasionally read a little odd for an
  unanticipated irregular verb, but it's always self-consistent (the
  same function builds both the prompt and the reference answer, so
  grading never contradicts the question).
*/

(function (root) {
  // base -> [past, pastParticiple] for common irregular verbs. Only the
  // base (first) word of a phrasal gloss like "wake up" is looked up
  // here — the particle ("up") is carried separately and reattached
  // after conjugation, e.g. "wake" -> "woke" + "up" -> "woke up".
  const IRREGULAR = {
    be: ["was/were", "been"],
    have: ["had", "had"],
    do: ["did", "done"],
    go: ["went", "gone"],
    say: ["said", "said"],
    make: ["made", "made"],
    know: ["knew", "known"],
    take: ["took", "taken"],
    see: ["saw", "seen"],
    come: ["came", "come"],
    think: ["thought", "thought"],
    give: ["gave", "given"],
    find: ["found", "found"],
    tell: ["told", "told"],
    become: ["became", "become"],
    show: ["showed", "shown"],
    leave: ["left", "left"],
    feel: ["felt", "felt"],
    put: ["put", "put"],
    bring: ["brought", "brought"],
    begin: ["began", "begun"],
    keep: ["kept", "kept"],
    hold: ["held", "held"],
    write: ["wrote", "written"],
    stand: ["stood", "stood"],
    hear: ["heard", "heard"],
    let: ["let", "let"],
    mean: ["meant", "meant"],
    set: ["set", "set"],
    meet: ["met", "met"],
    run: ["ran", "run"],
    pay: ["paid", "paid"],
    sit: ["sat", "sat"],
    speak: ["spoke", "spoken"],
    lie: ["lay", "lain"],
    lead: ["led", "led"],
    read: ["read", "read"],
    grow: ["grew", "grown"],
    lose: ["lost", "lost"],
    fall: ["fell", "fallen"],
    send: ["sent", "sent"],
    build: ["built", "built"],
    understand: ["understood", "understood"],
    draw: ["drew", "drawn"],
    break: ["broke", "broken"],
    spend: ["spent", "spent"],
    cut: ["cut", "cut"],
    rise: ["rose", "risen"],
    drive: ["drove", "driven"],
    buy: ["bought", "bought"],
    wear: ["wore", "worn"],
    choose: ["chose", "chosen"],
    eat: ["ate", "eaten"],
    drink: ["drank", "drunk"],
    sleep: ["slept", "slept"],
    forget: ["forgot", "forgotten"],
    fly: ["flew", "flown"],
    catch: ["caught", "caught"],
    teach: ["taught", "taught"],
    sell: ["sold", "sold"],
    win: ["won", "won"],
    swim: ["swam", "swum"],
    throw: ["threw", "thrown"],
    ride: ["rode", "ridden"],
    sing: ["sang", "sung"],
    hide: ["hid", "hidden"],
    stick: ["stuck", "stuck"],
    hit: ["hit", "hit"],
    steal: ["stole", "stolen"],
    shut: ["shut", "shut"],
    shoot: ["shot", "shot"],
    ring: ["rang", "rung"],
    dig: ["dug", "dug"],
    strike: ["struck", "struck"],
    swear: ["swore", "sworn"],
    sweep: ["swept", "swept"],
    tear: ["tore", "torn"],
    wake: ["woke", "woken"],
    freeze: ["froze", "frozen"],
    forgive: ["forgave", "forgiven"],
    fight: ["fought", "fought"],
    lend: ["lent", "lent"],
    shake: ["shook", "shaken"],
    light: ["lit", "lit"],
    dream: ["dreamt", "dreamt"],
    burn: ["burnt", "burnt"],
    learn: ["learnt", "learnt"],
    smell: ["smelt", "smelt"],
    spell: ["spelt", "spelt"],
    spill: ["spilt", "spilt"],
    lay: ["laid", "laid"],
  };

  // Verbs whose 3rd-person-singular is irregular beyond the usual +s
  // rule (only "be"/"have" among common course verbs).
  const IRREGULAR_THIRD_PERSON = { be: "is", have: "has" };

  // "be" is the one common verb where the regular e-drop gerund rule
  // gives the wrong result ("bing" instead of "being").
  const IRREGULAR_GERUND = { be: "being" };

  // Ends in a consonant that needs "es" instead of a plain "s"/"ed".
  function endsInSibilant(word) {
    return /(?:s|x|z|ch|sh|o)$/.test(word);
  }

  function endsInConsonantY(word) {
    return /[^aeiou]y$/.test(word);
  }

  // Rough CVC (consonant-vowel-consonant) doubling check for short,
  // one-syllable-looking bases (stop -> stopped, plan -> planned) —
  // deliberately conservative (only fires for short words), skips
  // w/x/y as the final consonant (those never double).
  function needsConsonantDoubling(word) {
    if (word.length > 6) return false;
    return /[^aeiou][aeiou][^aeiouwxy]$/.test(word);
  }

  function regularPast(base) {
    if (/e$/.test(base)) return base + "d";
    if (endsInConsonantY(base)) return base.slice(0, -1) + "ied";
    if (needsConsonantDoubling(base)) return base + base.slice(-1) + "ed";
    return base + "ed";
  }

  function regularGerund(base) {
    if (/ie$/.test(base)) return base.slice(0, -2) + "ying";
    if (/[^aeiou]e$/.test(base) && !/(ee|oe|ye)$/.test(base)) return base.slice(0, -1) + "ing";
    if (needsConsonantDoubling(base)) return base + base.slice(-1) + "ing";
    return base + "ing";
  }

  function regularThirdPerson(base) {
    if (endsInSibilant(base)) return base + "es";
    if (endsInConsonantY(base)) return base.slice(0, -1) + "ies";
    return base + "s";
  }

  // Splits a gloss like "to wake up (oneself)" or "to speak, to talk"
  // into a single base verb + optional particle. Only the FIRST
  // comma-separated alternative is used; parentheticals are dropped
  // entirely (they're usually a disambiguating note, not part of the
  // verb itself).
  function parseGloss(gloss) {
    if (!gloss) return { base: "", particle: "" };
    const firstAlt = gloss.split(",")[0];
    const noParens = firstAlt.replace(/\([^)]*\)/g, "").trim();
    const withoutTo = noParens.replace(/^to\s+/i, "").trim();
    const words = withoutTo.split(/\s+/).filter(Boolean);
    if (!words.length) return { base: "", particle: "" };
    return { base: words[0].toLowerCase(), particle: words.slice(1).join(" ") };
  }

  // Public entry point. `gloss` is an English infinitive gloss straight
  // from a verb-data entry's `.english` field. Returns null only if the
  // gloss is empty/unparseable.
  function getEnglishForms(gloss) {
    const { base, particle } = parseGloss(gloss);
    if (!base) return null;

    const irregular = IRREGULAR[base];
    const past = irregular ? irregular[0] : regularPast(base);
    const pastParticiple = irregular ? irregular[1] : regularPast(base);
    const gerund = IRREGULAR_GERUND[base] || regularGerund(base);
    const thirdPerson = IRREGULAR_THIRD_PERSON[base] || regularThirdPerson(base);

    const attach = (form) => (particle ? `${form} ${particle}` : form);

    return {
      base,
      particle,
      infinitive: attach(base),
      past: attach(past),
      pastParticiple: attach(pastParticiple),
      gerund: attach(gerund),
      thirdPerson: attach(thirdPerson),
    };
  }

  const EnglishVerbForms = { getEnglishForms };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = EnglishVerbForms;
  } else {
    root.EnglishVerbForms = EnglishVerbForms;
  }
})(typeof window !== "undefined" ? window : globalThis);
