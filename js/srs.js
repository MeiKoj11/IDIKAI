/*
  srs.js
  ------
  A small SM-2-style spaced repetition scheduler — the well-known,
  publicly documented algorithm behind most spaced-repetition apps
  (published by Piotr Woźniak in the 1980s/90s; this is an original
  implementation of the public algorithm, not copied code from any
  particular app). No AI, no network — just arithmetic.

  For each flashcard it tracks: how many times in a row you've gotten
  it right ("repetitions"), how easy it seems to be for you
  ("easeFactor"), how many days until it's due again ("interval"), and
  the actual due date/time.

  Our quiz only has two outcomes (the existing "Got it" / "Review
  again" buttons), so those map onto SM-2's 0-5 "quality of recall"
  scale as GOOD (5) and AGAIN (2) — a common simplification.
*/

(function (root) {
  const QUALITY = { GOOD: 5, AGAIN: 2 };

  function defaultStats() {
    return { repetitions: 0, easeFactor: 2.5, interval: 0, dueDate: 0 };
  }

  // Standard SM-2 update. `quality` is 0-5; we only ever pass GOOD or
  // AGAIN, but the formula works for any of the five values.
  function nextReviewState(stats, quality) {
    const s = stats || defaultStats();
    let repetitions = s.repetitions;
    let easeFactor = s.easeFactor;
    let interval = s.interval;

    easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (easeFactor < 1.3) easeFactor = 1.3;

    if (quality < 3) {
      // Failed / "review again" — reset the streak, due again right away.
      repetitions = 0;
      interval = 0;
    } else {
      if (repetitions === 0) interval = 1;
      else if (repetitions === 1) interval = 6;
      else interval = Math.round(interval * easeFactor);
      repetitions += 1;
    }

    const dueDate = Date.now() + interval * 24 * 60 * 60 * 1000;
    return { repetitions, easeFactor, interval, dueDate };
  }

  // A card with no stats yet (dueDate 0) counts as due — brand new
  // cards should show up in the next quiz, not get skipped forever.
  function isDue(stats) {
    return !stats || !stats.dueDate || stats.dueDate <= Date.now();
  }

  const Srs = { QUALITY, defaultStats, nextReviewState, isDue };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Srs;
  } else {
    root.Srs = Srs;
  }
})(typeof window !== "undefined" ? window : globalThis);
