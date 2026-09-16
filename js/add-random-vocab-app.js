/*
  add-random-vocab-app.js
  ------------------------
  "Add Random Vocab" — reached from Vocab Bank's "+ Add random vocab"
  button. Paste a vocab list that doesn't belong to one theme (mixed
  sources), extract it the same way the per-theme bulk import on
  add-vocab.html does (Translate.extractVocabList), then sort each
  extracted item into an existing theme or a brand-new one before
  saving. One language at a time via ?lang= — a word's targetLang/
  furigana only make sense for the language it was written in, same
  rule the existing move/copy-to-theme feature in vocab-app.js follows.
*/

const RANDOM_VOCAB_NEW_THEME_VALUE = "__new_random_vocab_theme__";
const RANDOM_VOCAB_LANGUAGE_NAMES = { es: "Spanish", ja: "Japanese", fr: "French" };

let randomVocabLang = "es";
let randomVocabExtracted = []; // [{ targetLang, english, furigana, themeId }]

document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("random-vocab-root");
  if (!root) return; // not this page

  const params = new URLSearchParams(window.location.search);
  const langParam = params.get("lang");
  randomVocabLang = SUPPORTED_LANGUAGES.includes(langParam) ? langParam : "es";

  const backLink = document.getElementById("random-vocab-back-link");
  if (backLink) backLink.href = `vocab.html?lang=${randomVocabLang}`;

  const heading = document.getElementById("random-vocab-heading");
  if (heading) heading.textContent = `Add Random Vocab — ${RANDOM_VOCAB_LANGUAGE_NAMES[randomVocabLang]}`;

  initTopbar(randomVocabLang);
  if (typeof initHubTasks === "function") initHubTasks(randomVocabLang);
  initAppTabs({
    section: "vocab",
    language: randomVocabLang,
    label: "Add Random Vocab",
    href: `add-random-vocab.html?lang=${randomVocabLang}`,
  });

  document.getElementById("random-vocab-extract-btn").addEventListener("click", handleRandomVocabExtract);
  document.getElementById("random-vocab-select-all").addEventListener("click", () => setAllRandomVocabChecked(true));
  document.getElementById("random-vocab-select-none").addEventListener("click", () => setAllRandomVocabChecked(false));
  document.getElementById("random-vocab-save-btn").addEventListener("click", handleRandomVocabSave);
  document.getElementById("random-vocab-discard-btn").addEventListener("click", handleRandomVocabDiscard);
});

async function handleRandomVocabExtract() {
  const textarea = document.getElementById("random-vocab-text");
  const btn = document.getElementById("random-vocab-extract-btn");
  const statusEl = document.getElementById("random-vocab-status");
  const text = textarea ? textarea.value.trim() : "";

  if (!text) {
    alert("Paste a vocab list first.");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Extracting...";
  btn.dataset.immersionKey = "extractingStatus";
  if (statusEl) statusEl.hidden = true;

  const result = await Translate.extractVocabList(text, randomVocabLang);

  btn.disabled = false;
  btn.textContent = "Extract flashcards";
  btn.dataset.immersionKey = "extractFlashcardsButton";

  if (result.error || !result.words) {
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.textContent = result.error || "Couldn't extract anything from that text.";
    }
    return;
  }

  if (result.words.length === 0) {
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.textContent = "Didn't find anything that looked like vocabulary in that text.";
    }
    return;
  }

  randomVocabExtracted = result.words.map((w) => ({
    targetLang: (w.targetLang || "").trim(),
    english: (w.english || "").trim(),
    furigana: (w.furigana || "").trim(),
    themeId: null,
  }));

  renderRandomVocabReview();
}

// Builds one row's theme <select>: every existing theme in the current
// language, plus "+ Create new theme…" (same prompt()-based cold-start
// pattern as vocab-app.js's move/copy panel). Creating a theme from one
// row immediately adds it to every other row's dropdown too, since the
// whole point of this page is sorting one mixed batch across themes.
function buildRandomVocabThemeSelect(preselectedId) {
  const select = document.createElement("select");
  select.className = "bulk-import-theme-select";
  select.setAttribute("aria-label", "Theme");

  const themes = Storage.getThemes().filter((t) => t.language === randomVocabLang);
  themes.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    select.appendChild(opt);
  });

  const newOpt = document.createElement("option");
  newOpt.value = RANDOM_VOCAB_NEW_THEME_VALUE;
  newOpt.textContent = "+ Create new theme…";
  newOpt.dataset.immersionKey = "createNewThemeOption";
  select.appendChild(newOpt);

  if (preselectedId) {
    select.value = preselectedId;
  } else if (themes.length === 0) {
    select.value = RANDOM_VOCAB_NEW_THEME_VALUE;
  } else {
    select.value = themes[0].id;
  }

  select.addEventListener("change", () => {
    if (select.value !== RANDOM_VOCAB_NEW_THEME_VALUE) return;
    const name = prompt("Name for the new theme:");
    if (!name || !name.trim()) {
      const fallback = Storage.getThemes().filter((t) => t.language === randomVocabLang)[0];
      select.value = fallback ? fallback.id : RANDOM_VOCAB_NEW_THEME_VALUE;
      return;
    }
    const theme = Storage.addTheme(name.trim(), randomVocabLang);
    document.querySelectorAll(".bulk-import-theme-select").forEach((otherSelect) => {
      if (otherSelect === select) return;
      const opt = document.createElement("option");
      opt.value = theme.id;
      opt.textContent = theme.name;
      otherSelect.insertBefore(opt, otherSelect.lastElementChild);
    });
    const opt = document.createElement("option");
    opt.value = theme.id;
    opt.textContent = theme.name;
    select.insertBefore(opt, select.lastElementChild);
    select.value = theme.id;
  });

  return select;
}

function renderRandomVocabReview() {
  const review = document.getElementById("random-vocab-review");
  const list = document.getElementById("random-vocab-list");
  const countEl = document.getElementById("random-vocab-review-count");
  if (!review || !list) return;

  list.innerHTML = "";
  if (countEl) countEl.textContent = `${randomVocabExtracted.length} found`;

  randomVocabExtracted.forEach((word) => {
    const li = document.createElement("li");
    li.className = "bulk-import-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "bulk-import-checkbox";
    checkbox.checked = true;
    li.appendChild(checkbox);

    const tlInput = document.createElement("input");
    tlInput.type = "text";
    tlInput.className = "bulk-import-tl-input";
    tlInput.value = word.targetLang;
    tlInput.setAttribute("aria-label", "Target language");
    li.appendChild(tlInput);

    const englishInput = document.createElement("input");
    englishInput.type = "text";
    englishInput.className = "bulk-import-english-input";
    englishInput.value = word.english;
    englishInput.setAttribute("aria-label", "English");
    li.appendChild(englishInput);

    if (randomVocabLang === "ja") {
      const furiganaInput = document.createElement("input");
      furiganaInput.type = "text";
      furiganaInput.className = "bulk-import-furigana-input";
      furiganaInput.value = word.furigana;
      furiganaInput.placeholder = "furigana";
      furiganaInput.setAttribute("aria-label", "Furigana");
      li.appendChild(furiganaInput);
    }

    li.appendChild(buildRandomVocabThemeSelect(word.themeId));

    list.appendChild(li);
  });

  review.hidden = false;
  const saveStatus = document.getElementById("random-vocab-save-status");
  if (saveStatus) saveStatus.hidden = true;
}

function setAllRandomVocabChecked(checked) {
  document.querySelectorAll("#random-vocab-list .bulk-import-checkbox").forEach((cb) => {
    cb.checked = checked;
  });
}

// Saves every checked row into whichever theme its own dropdown has
// selected. Rows that weren't checked, came out empty, turned out to be
// duplicates in their chosen theme, or never got a real theme picked
// stay in the review list (so nothing gets lost without you seeing why)
// — mirrors add-vocab.html's bulk-import save behavior.
function handleRandomVocabSave() {
  const rows = Array.from(document.querySelectorAll("#random-vocab-list .bulk-import-row"));
  let saved = 0;
  let skippedDuplicate = 0;
  let skippedEmpty = 0;
  const remaining = [];

  rows.forEach((row) => {
    const checkbox = row.querySelector(".bulk-import-checkbox");
    const isChecked = !!(checkbox && checkbox.checked);
    const english = row.querySelector(".bulk-import-english-input").value.trim();
    const targetLang = row.querySelector(".bulk-import-tl-input").value.trim();
    const furiganaInput = row.querySelector(".bulk-import-furigana-input");
    const furigana = furiganaInput ? furiganaInput.value.trim() : "";
    const themeSelect = row.querySelector(".bulk-import-theme-select");
    const themeId = themeSelect ? themeSelect.value : null;

    if (!isChecked) {
      remaining.push({ targetLang, english, furigana, themeId });
      return;
    }

    if (!english || !targetLang || !themeId || themeId === RANDOM_VOCAB_NEW_THEME_VALUE) {
      skippedEmpty++;
      remaining.push({ targetLang, english, furigana, themeId });
      return;
    }

    const result = Storage.addWordIfNotDuplicate(themeId, { english, targetLang, furigana });
    if (result) {
      saved++;
    } else {
      skippedDuplicate++;
      remaining.push({ targetLang, english, furigana, themeId });
    }
  });

  randomVocabExtracted = remaining;

  const statusParts = [`Saved ${saved} word${saved === 1 ? "" : "s"}.`];
  if (skippedDuplicate) statusParts.push(`${skippedDuplicate} skipped as duplicate.`);
  if (skippedEmpty) statusParts.push(`${skippedEmpty} left unchecked (missing a side or theme).`);
  const saveStatusText = statusParts.join(" ");

  if (remaining.length > 0) {
    renderRandomVocabReview();
  } else {
    const review = document.getElementById("random-vocab-review");
    if (review) review.hidden = true;
    const textarea = document.getElementById("random-vocab-text");
    if (textarea) textarea.value = "";
  }

  const saveStatus = document.getElementById("random-vocab-save-status");
  if (saveStatus) {
    saveStatus.hidden = false;
    saveStatus.textContent = saveStatusText;
  }
}

function handleRandomVocabDiscard() {
  randomVocabExtracted = [];
  const review = document.getElementById("random-vocab-review");
  if (review) review.hidden = true;
  const textarea = document.getElementById("random-vocab-text");
  if (textarea) textarea.value = "";
  const statusEl = document.getElementById("random-vocab-status");
  if (statusEl) statusEl.hidden = true;
}
