/*
  ja-conjugator.js
  ----------------
  Local, rule-based conjugation for the four Japanese verb forms taught
  in the Grammar "Tenses and verb conjugations" folder: potential
  (可能形), passive (受身形), causative (使役形), and causative-passive
  (使役受身形). Deliberately NOT an AI call — these four forms are fully
  regular for godan/ichidan verbs (with する and 来る as the only real
  irregulars), so computing them locally is instant, free, and works
  offline. AI stays reserved for the one thing local code genuinely
  can't do well: classifying a NEW verb's conjugation class the first
  time it's looked up (see server.js's "verbClass" field) — this file
  just applies that classification.

  A verb is { kanji, reading, meaning, class }, where class is one of
  "godan" | "ichidan" | "irregular-suru" | "irregular-kuru" — matching
  the classification the dictionary lookup backend already returns
  (see storage.js's saved-word "verbClass" field, set once at save
  time — vocab-app.js's pendingVerbInfo).
*/

(function (root) {
  // Godan ("u-verb") row-shift table, keyed by the verb's final kana.
  // Index order is the standard a/i/u/e/o row order.
  const ROW = {
    "う": ["わ", "い", "う", "え", "お"],
    "く": ["か", "き", "く", "け", "こ"],
    "ぐ": ["が", "ぎ", "ぐ", "げ", "ご"],
    "す": ["さ", "し", "す", "せ", "そ"],
    "つ": ["た", "ち", "つ", "て", "と"],
    "ぬ": ["な", "に", "ぬ", "ね", "の"],
    "ぶ": ["ば", "び", "ぶ", "べ", "ぼ"],
    "む": ["ま", "み", "む", "め", "も"],
    "る": ["ら", "り", "る", "れ", "ろ"],
  };
  const A = 0;
  const E = 3;

  // Shifts the final kana of `s` to a given row index (both kanji- and
  // kana-written verb forms always end in a plain kana okurigana
  // character for godan/ichidan verbs, so this is safe to apply to
  // either the kanji form or the reading).
  function shiftStem(s, rowIndex) {
    const last = s.slice(-1);
    const row = ROW[last];
    if (!row) return null; // not a recognizable godan ending
    return s.slice(0, -1) + row[rowIndex];
  }

  const FORMS = ["potential", "passive", "causative", "causativePassive"];
  const FORM_LABELS = {
    potential: "Potential (可能形) — “can do”",
    // Deliberately NOT "is done (to me)" — that's only the "suffering/
    // indirect passive" (迷惑の受身) reading, e.g. 友達に日記を読まれた
    // ("my friend read my diary, and I'm annoyed"). Plain "direct"
    // passive doesn't involve the speaker at all, e.g. この本は昔書か
    // れた ("this book was written long ago") — the subject just
    // receives the action, no implied victim.
    passive: "Passive (受身形) — “something happens to the subject” (sometimes also implies it affected the speaker)",
    causative: "Causative (使役形) — “make/let someone do”",
    causativePassive: "Causative-passive (使役受身形) — “made to do”",
  };

  // Loose, template-based expected English phrasing per form — used
  // only as a hint/local sanity hint, never a hard pass/fail (see
  // gradeEnglishAnswer below; free-form English is graded generously).
  function englishGloss(meaning, form) {
    // meaning is the plain infinitive gloss, e.g. "to drink".
    const bare = meaning.replace(/^to\s+/i, "").trim();
    switch (form) {
      case "potential":
        return `can ${bare}`;
      case "passive":
        // Deliberately not an auto-built past participle (e.g. bare +
        // "(e)d") — that breaks on irregular verbs ("write" -> "writed"
        // instead of "written") and doesn't read naturally for
        // intransitive verbs at all ("was swum" isn't real English).
        // Naming the base verb plus the form is honest about what it
        // is rather than guessing wrong: you judge for yourself whether
        // your own phrasing captures it, same as the other three forms.
        return `passive of “${bare}” — something happens to the subject (may also imply it affected the speaker)`;
      case "causative":
        return `make/let (someone) ${bare}`;
      case "causativePassive":
        return `is/was made to ${bare}`;
      default:
        return bare;
    }
  }

  // Conjugates one { kanji, reading } pair for one form, per verb
  // class. Returns { kanji, reading, altKanji, altReading } — the
  // "alt" fields are only set for the causative-passive's common
  // contraction (せられる -> される), and only for godan verbs that
  // don't already end in す (a contraction there would be genuinely
  // ambiguous, so it's left out rather than offered as a false
  // "correct" answer).
  function conjugateForm(kanji, reading, verbClass, form) {
    if (verbClass === "irregular-kuru") {
      // 来る is the one common verb where even the KANJI stem's
      // reading changes across forms (来る/来られる/来させる...) while
      // the kanji character itself never does — hardcoded rather than
      // rule-derived, since there's exactly one verb like this.
      const table = {
        potential: { kanji: "来られる", reading: "こられる" },
        passive: { kanji: "来られる", reading: "こられる" },
        causative: { kanji: "来させる", reading: "こさせる" },
        causativePassive: { kanji: "来させられる", reading: "こさせられる" },
      };
      return table[form];
    }

    if (verbClass === "irregular-suru") {
      // Handles bare する as well as compounds like 勉強する — the
      // stem is everything before する, so this covers a bare する verb
      // (empty stem) with the exact same formula as a compound.
      const kStem = kanji.endsWith("する") ? kanji.slice(0, -2) : kanji;
      const rStem = reading.endsWith("する") ? reading.slice(0, -2) : reading;
      const suffix = { potential: "できる", passive: "される", causative: "させる", causativePassive: "させられる" }[form];
      return { kanji: kStem + suffix, reading: rStem + suffix };
    }

    if (verbClass === "ichidan") {
      const kStem = kanji.slice(0, -1); // drop る
      const rStem = reading.slice(0, -1);
      const suffix = {
        // Genuinely identical in real Japanese — ichidan potential and
        // passive share one form (context/particles disambiguate,
        // e.g. "食べられる" alone is ambiguous without more sentence).
        potential: "られる",
        passive: "られる",
        causative: "させる",
        causativePassive: "させられる",
      }[form];
      return { kanji: kStem + suffix, reading: rStem + suffix };
    }

    // godan
    if (form === "potential") {
      return { kanji: shiftStem(kanji, E) + "る", reading: shiftStem(reading, E) + "る" };
    }
    if (form === "passive") {
      return { kanji: shiftStem(kanji, A) + "れる", reading: shiftStem(reading, A) + "れる" };
    }
    if (form === "causative") {
      return { kanji: shiftStem(kanji, A) + "せる", reading: shiftStem(reading, A) + "せる" };
    }
    // causativePassive
    const full = { kanji: shiftStem(kanji, A) + "せられる", reading: shiftStem(reading, A) + "せられる" };
    const endsInSu = kanji.slice(-1) === "す";
    if (endsInSu) return full;
    return {
      ...full,
      altKanji: shiftStem(kanji, A) + "される",
      altReading: shiftStem(reading, A) + "される",
    };
  }

  // Public entry point: conjugate one verb object for one form.
  function conjugate(verb, form) {
    if (!verb || !verb.kanji || !verb.reading || !verb.class) return null;
    if (!FORMS.includes(form)) return null;
    const result = conjugateForm(verb.kanji, verb.reading, verb.class, form);
    if (!result || !result.kanji) return null;
    return result;
  }

  // Every string that should count as a correct typed answer for this
  // verb+form — used for local (no-AI) exact-match grading of the
  // English -> Japanese quiz direction. Includes the kanji form, the
  // all-kana reading (so typing in hiragana instead of kanji still
  // counts), and the causative-passive's contracted variant when it
  // exists. Whitespace-insensitive; comparison itself is done by the
  // caller after normalizing case/whitespace.
  function acceptableAnswers(verb, form) {
    const c = conjugate(verb, form);
    if (!c) return [];
    const answers = [c.kanji, c.reading];
    if (c.altKanji) answers.push(c.altKanji);
    if (c.altReading) answers.push(c.altReading);
    return [...new Set(answers)];
  }

  function normalizeJapaneseAnswer(s) {
    return (s || "")
      .trim()
      .replace(/\s+/g, "")
      // Full-width space, just in case.
      .replace(/　/g, "");
  }

  // Local (no AI call) check for the EN -> JA direction: does the
  // typed Japanese form match one of the acceptable variants exactly?
  function checkJapaneseAnswer(verb, form, typed) {
    const normalizedTyped = normalizeJapaneseAnswer(typed);
    if (!normalizedTyped) return { correct: false, answers: acceptableAnswers(verb, form) };
    const answers = acceptableAnswers(verb, form);
    const correct = answers.some((a) => normalizeJapaneseAnswer(a) === normalizedTyped);
    return { correct, answers };
  }

  // A curated, verified starter list of common everyday verbs so
  // conjugation practice works from day one, even with an empty Vocab
  // Bank — separate from (and combined with, at quiz time) whatever
  // verbs get tagged from Vocab Bank saves. Deliberately kept to a
  // moderate, individually-checked size rather than an enormous
  // auto-generated one — every entry here has had its godan/ichidan
  // classification checked by hand, including the classic
  // godan-that-looks-like-ichidan traps (帰る, 走る, 入る, 知る, 要る,
  // 切る, 座る). More can be added the same way at any time.
  const COMMON_VERBS = [
    { kanji: "飲む", reading: "のむ", meaning: "to drink", class: "godan" },
    { kanji: "話す", reading: "はなす", meaning: "to speak, to talk", class: "godan" },
    { kanji: "書く", reading: "かく", meaning: "to write", class: "godan" },
    { kanji: "聞く", reading: "きく", meaning: "to listen, to hear, to ask", class: "godan" },
    { kanji: "読む", reading: "よむ", meaning: "to read", class: "godan" },
    { kanji: "泳ぐ", reading: "およぐ", meaning: "to swim", class: "godan" },
    { kanji: "脱ぐ", reading: "ぬぐ", meaning: "to take off (clothes)", class: "godan" },
    { kanji: "待つ", reading: "まつ", meaning: "to wait", class: "godan" },
    { kanji: "死ぬ", reading: "しぬ", meaning: "to die", class: "godan" },
    { kanji: "遊ぶ", reading: "あそぶ", meaning: "to play", class: "godan" },
    { kanji: "呼ぶ", reading: "よぶ", meaning: "to call", class: "godan" },
    { kanji: "飛ぶ", reading: "とぶ", meaning: "to fly", class: "godan" },
    { kanji: "立つ", reading: "たつ", meaning: "to stand", class: "godan" },
    { kanji: "買う", reading: "かう", meaning: "to buy", class: "godan" },
    { kanji: "言う", reading: "いう", meaning: "to say", class: "godan" },
    { kanji: "会う", reading: "あう", meaning: "to meet", class: "godan" },
    { kanji: "使う", reading: "つかう", meaning: "to use", class: "godan" },
    { kanji: "歌う", reading: "うたう", meaning: "to sing", class: "godan" },
    { kanji: "思う", reading: "おもう", meaning: "to think", class: "godan" },
    { kanji: "洗う", reading: "あらう", meaning: "to wash", class: "godan" },
    { kanji: "笑う", reading: "わらう", meaning: "to laugh", class: "godan" },
    // godan verbs ending in る that look like ichidan (the classic trap).
    { kanji: "座る", reading: "すわる", meaning: "to sit", class: "godan" },
    { kanji: "走る", reading: "はしる", meaning: "to run", class: "godan" },
    { kanji: "帰る", reading: "かえる", meaning: "to go home, to return", class: "godan" },
    { kanji: "入る", reading: "はいる", meaning: "to enter", class: "godan" },
    { kanji: "知る", reading: "しる", meaning: "to know", class: "godan" },
    { kanji: "要る", reading: "いる", meaning: "to need", class: "godan" },
    { kanji: "切る", reading: "きる", meaning: "to cut", class: "godan" },
    { kanji: "作る", reading: "つくる", meaning: "to make", class: "godan" },
    { kanji: "分かる", reading: "わかる", meaning: "to understand", class: "godan" },
    { kanji: "持つ", reading: "もつ", meaning: "to hold, to have", class: "godan" },
    { kanji: "働く", reading: "はたらく", meaning: "to work", class: "godan" },
    { kanji: "休む", reading: "やすむ", meaning: "to rest", class: "godan" },
    { kanji: "住む", reading: "すむ", meaning: "to live, to reside", class: "godan" },
    { kanji: "送る", reading: "おくる", meaning: "to send", class: "godan" },
    { kanji: "泣く", reading: "なく", meaning: "to cry", class: "godan" },
    { kanji: "売る", reading: "うる", meaning: "to sell", class: "godan" },
    { kanji: "押す", reading: "おす", meaning: "to push", class: "godan" },
    { kanji: "取る", reading: "とる", meaning: "to take", class: "godan" },
    { kanji: "撮る", reading: "とる", meaning: "to take (a photo)", class: "godan" },
    { kanji: "頼む", reading: "たのむ", meaning: "to ask (a favor), to request", class: "godan" },
    { kanji: "貸す", reading: "かす", meaning: "to lend", class: "godan" },
    { kanji: "出す", reading: "だす", meaning: "to take out, to submit", class: "godan" },
    // ichidan
    { kanji: "食べる", reading: "たべる", meaning: "to eat", class: "ichidan" },
    { kanji: "見る", reading: "みる", meaning: "to see, to watch", class: "ichidan" },
    { kanji: "起きる", reading: "おきる", meaning: "to get up, to wake up", class: "ichidan" },
    { kanji: "寝る", reading: "ねる", meaning: "to sleep", class: "ichidan" },
    { kanji: "出る", reading: "でる", meaning: "to go out, to leave", class: "ichidan" },
    { kanji: "忘れる", reading: "わすれる", meaning: "to forget", class: "ichidan" },
    { kanji: "覚える", reading: "おぼえる", meaning: "to remember, to memorize", class: "ichidan" },
    { kanji: "教える", reading: "おしえる", meaning: "to teach", class: "ichidan" },
    { kanji: "考える", reading: "かんがえる", meaning: "to think, to consider", class: "ichidan" },
    { kanji: "答える", reading: "こたえる", meaning: "to answer", class: "ichidan" },
    { kanji: "決める", reading: "きめる", meaning: "to decide", class: "ichidan" },
    { kanji: "開ける", reading: "あける", meaning: "to open", class: "ichidan" },
    { kanji: "閉める", reading: "しめる", meaning: "to close", class: "ichidan" },
    { kanji: "集める", reading: "あつめる", meaning: "to gather, to collect", class: "ichidan" },
    { kanji: "始める", reading: "はじめる", meaning: "to start", class: "ichidan" },
    { kanji: "続ける", reading: "つづける", meaning: "to continue", class: "ichidan" },
    { kanji: "変える", reading: "かえる", meaning: "to change (something)", class: "ichidan" },
    { kanji: "借りる", reading: "かりる", meaning: "to borrow", class: "ichidan" },
    { kanji: "できる", reading: "できる", meaning: "to be able to, to be possible", class: "ichidan" },
    // irregular
    { kanji: "する", reading: "する", meaning: "to do", class: "irregular-suru" },
    { kanji: "来る", reading: "くる", meaning: "to come", class: "irregular-kuru" },
    { kanji: "勉強する", reading: "べんきょうする", meaning: "to study", class: "irregular-suru" },
    { kanji: "練習する", reading: "れんしゅうする", meaning: "to practice", class: "irregular-suru" },
    { kanji: "運動する", reading: "うんどうする", meaning: "to exercise", class: "irregular-suru" },
    { kanji: "料理する", reading: "りょうりする", meaning: "to cook", class: "irregular-suru" },
    { kanji: "掃除する", reading: "そうじする", meaning: "to clean", class: "irregular-suru" },
    { kanji: "電話する", reading: "でんわする", meaning: "to telephone, to call", class: "irregular-suru" },
  ];

  const JaConjugator = {
    FORMS,
    FORM_LABELS,
    COMMON_VERBS,
    conjugate,
    acceptableAnswers,
    checkJapaneseAnswer,
    normalizeJapaneseAnswer,
    englishGloss,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = JaConjugator;
  } else {
    root.JaConjugator = JaConjugator;
  }
})(typeof window !== "undefined" ? window : globalThis);
