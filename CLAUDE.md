# Idikai — project reference

Personal language-learning web app (Spanish / Japanese / French) built for Mei.
Read this file first in any new session before touching code — it replaces
needing to re-read past chat history.

## Stack & deployment

- Static HTML/CSS/vanilla JS frontend + a small Node server (`server/`) with
  SQLite for accounts/sync and Cloudflare R2 for file storage (Storage Locker).
- Deployed on Render from GitHub repo `MeiKoj11/IDIKAI`, single instance,
  owner's Claude API key used server-side for all AI calls.
- No build step — pages are plain `.html` files at the repo root, shared JS in
  `js/`, shared CSS in `css/style.css` (legacy dark theme, still loaded first
  on every page) + `css/idikai-refresh.css` (newer visual-refresh layer,
  loaded second, overrides style.css page by page — see below).

## Sandbox quirks (every session)

- Stale `.git/index.lock` / `.git/HEAD.lock` files routinely block git
  commands. Before every `git add`/`git commit`, `mv` them aside with a
  timestamp suffix:
  ```
  ts=$(date +%s)
  [ -f .git/index.lock ] && mv .git/index.lock ".git/index.lock.bak.$ts"
  [ -f .git/HEAD.lock ] && mv .git/HEAD.lock ".git/HEAD.lock.bak.$ts"
  ```
- `git push` cannot run from this sandbox (no network credentials). Mei must
  run it herself from her own Mac Terminal — remind her whenever there are
  unpushed local commits.
- Bash tool paths differ from Read/Write/Edit tool paths — see the session's
  own path-mapping note (`/sessions/<name>/mnt/...` in bash vs the real
  `/Users/meikoj/...` path for file tools). Read/Write/Edit are usually
  preferable; use bash for `node --check`, python verification scripts, and
  git.

## Design system: idikai-refresh.css

A single shared stylesheet applying a redesigned visual language (paper/ink/
red palette, Fahkwang+Nunito type, card/pill-based components) on top of the
legacy `style.css`, loaded on every page via:
```html
<link rel="stylesheet" href="css/style.css" />
<link rel="stylesheet" href="css/idikai-refresh.css" />
```
Built by porting class primitives out of a series of **Claude-Design mockup
exports** Mei produces externally and re-imports as zip files (look for a
`*redesign discussion*.zip` in the repo root or Downloads — unzip and check
for a `mockups/` + `css/mockup.css` (+ possibly `css/test-mockup.css`)
folder). Established primitives already ported: `.pagehead`, `.card`/
`.card-red`/`.card-ruled`/`.card-lift`/`.card-dashed`, `.chip`/`.chip-strong`,
`.pill-tag`, `.pill-row`/`.pill-add`, `.cols`/`.col-main`/`.col-side`,
`.dot`/`.dot-sm`, `.btn`/`.btn-ghost`/`.link-btn`, `.card-mistakes`,
`.grid-tiles`/`.grid-folders`, and (most recently) a full **test-mode**
section — `.wrap-focus`, `.focus-card`, `.select-pill`, `.source-row`,
`.progress-row`, `.dot-row`/`.q-dot`, `.score-panel`, `.mark-card`,
`.judge`, `.lookup-strip`, `.theme-chip`, `.loading-main`/`.spinner` — ported
from a `test-mockup.css` covering conjugation-test/sentence-test screens.

### The recurring CSS bug — READ THIS BEFORE ADDING A NEW BUTTON-BASED CLASS

`style.css` has a **global `button { background: #221712; color: #ECE6D3; }`
rule**. CSS cascades property-by-property, not rule-by-rule: if a new class
used on a real `<button>` doesn't explicitly set its own `background` (even
if it sets `color`), the dark global background survives underneath —
producing dark-text-on-dark-background, i.e. **invisible button text**. This
has bitten three separate times already (`.chip`, `.back-link`, `.btn-ghost`
when used standalone on a `<button>` instead of an `<a>`/paired with `.btn`).//
**Rule going forward: any class applied to a `<button>` must explicitly
declare `background` (and ideally `border`, `padding`, `border-radius`,
`font-family`, `font-size`, `cursor`) rather than relying on a parent/sibling
class to supply the rest — don't assume a mockup's own CSS is safe to port
verbatim, since the mockup pages don't have this competing global button
rule.** Also watch for the same pattern with `position`/`top`/`left`/
`transform` — a similar bug hit the topbar (`e57eaba`) where a newer flexbox
`.app-topbar` rule never reset the old `.topbar-hamburger` etc.'s leftover
`position: absolute` corner-pinning.

## Mockup-integration workflow (established pattern)

When Mei says a new Claude-Design export is ready:
1. Find and unzip the `*.zip` (check repo root and `Downloads/` — she
   sometimes drops it directly in `Lang_Learning_Web/`). Read any
   `README*.txt` inside — recent exports have included one explaining what
   each mockup file corresponds to.
2. Port any genuinely new CSS classes from the mockup's own `css/*.css` into
   `idikai-refresh.css` (check for name collisions with existing classes
   first — grep before adding). Apply the button-background fix proactively
   for anything used on a `<button>`.
3. Rebuild the **real, JS-driven page** to match the mockup's markup/classes
   — but preserve every existing element `id` the page's own JS references
   (cross-check with a script — see Verification below) and preserve all
   real functionality. Where the mockup shows something the real app can't
   literally reproduce (e.g. a fictitious page/link, or a data shape that
   was never persisted), find the *real* equivalent rather than silently
   dropping the element — dropping/simplifying mockup elements unilaterally
   has caused rework before (see grammar-theme.html history in git log:
   `1e20f0a` was an intentionally-reduced first pass that Mei explicitly
   rejected; `19ace60` rebuilt it to match the mockup fully, including a
   pill-row note list, a real Mistakes-folder side card, and a tag-filter
   row). **Default to matching the mockup exactly and asking only if something
   is genuinely impossible, not scoping down pre-emptively.**
4. If a mockup shows a different *interaction flow* (not just visual style —
   e.g. "one question at a time with Back/Skip/Next and a dot-row" replacing
   an old "all N questions on one scrolling page" layout), that's a real
   flow change to implement, not just CSS. See
   `js/japanese-conjugation-test-app.js` (commit `3aaefc9`) for a worked
   example: setup/answering/marked as three distinct screens, `currentIndex`
   navigation, grading still deferred to the end (matches the setup screen's
   own "answer everything first" copy).
5. When a page has rich, already-hardened interactive behavior that a
   *static* mockup can't fully depict (the mockups' own READMEs say as much:
   "interactive states are shown in place rather than wired up") — e.g.
   japanese-sentence-test.html's character-level click-to-lookup, drag-select
   phrase lookup, mistake-flagging panel with furigana auto-prefill, and
   conjugation-error retest quiz — keep the deeper real functionality
   intact and just restyle its visual chrome to match the mockup's language,
   rather than replacing it with the mockup's simplified static version.
   That's different from unilaterally *dropping* something the mockup shows
   (not allowed, see point 3) — it's *keeping something the mockup doesn't
   show at all*, which is fine as long as the visible parts match.

## Verification checklist (run before every commit)

```bash
node --check js/<file>.js                       # every touched JS file
python3 -c "<brace-balance script>"              # css files
python3 -c "<tag-balance + id-uniqueness script>" # html files
python3 -c "<cross-check getElementById ids exist in the HTML>"
```
(Exact scripts have been used throughout this project's history — regex-scan
`<tag>`/`</tag>` pairs for balance, regex-scan `id="..."` for duplicates,
regex-scan `getElementById("...")` in JS vs `id="..."` in HTML for orphaned
references.) Then commit with a message explaining *why*, not just *what* —
this file and `git log` are the project's shared memory across sessions.

## File-naming conventions worth knowing

- Per-language triplets: `spanish-*`/`japanese-*`/`french-*` (e.g.
  `*-tenses.html`, `*-sentence-test.html`, `*-conjugation-test.html`) — when
  changing one, check whether the other two languages need the same change
  (ask, don't assume — Japanese conjugation works structurally differently
  from Spanish/French, see `js/japanese-conjugation-test-app.js`'s own header
  comment).
- `js/storage.js` is the single localStorage-shaped (but actually
  server-synced) data layer — all reads/writes go through `Storage.*`.
- `js/immersion.js` holds the UI-chrome translation dictionary
  (`data-immersion-key` attributes + `IMMERSION_STRINGS`), es/ja/fr per key.
  Not every existing key has translations for every page yet — this is a
  known, pre-existing gap, not something to silently "fix" as a side effect
  of an unrelated task unless asked.
- Shared chrome markup (topbar, app-tab-strip, hub-todo panel) is duplicated
  literally into every page's `<body>` rather than templated — when adding a
  new page, copy it from an existing similar page rather than writing fresh.

## Current state / in-progress work

As of the most recent session: mid-rebuild of `japanese-sentence-test.html` +
`js/japanese-sentence-test-app.js` to match the new test-mockup screens
(sentence-test-setup/-loading/-answering/-marking.html). The **conjugation
test** (`japanese-conjugation-test.html`) rebuild is done and committed
(`3aaefc9`). The **sentence test** is larger (~1450 lines of JS) and was
paused mid-implementation — plan on record: restyle setup/loading fully;
convert the pre-submit answering phase from "all N cards on one page" to
one-at-a-time (reuse the conjugation-test's screen-navigation pattern, but
keep the *same* per-card DOM built once via `renderQuestionCards`/
`buildQuestionCard`, just toggling `hidden` per card, rather than
re-rendering from scratch — the sentence cards carry stateful DOM
(flagged-word datasets, drag-select handlers) that's safer left alone);
restyle the post-submit marked screen into `.score-panel`/`.mark-card`
layout reusing the *same* element refs (`userAnswerEl`/`correctAnswerEl`/
`tickBtn`/`crossBtn`) rather than a parallel renderer; leave the floating
`#lookup-panel`/`#mistake-panel`/`#vocab-drawer` as floating panels
(restyled to the mockup's dark `.lookup-strip`/`.theme-chip` look) rather
than moving them inline per-card, since that's a much higher-risk rework of
a hardened feature for a visual-only mockup detail the mockup's own README
says isn't fully specified. Not yet extended to Spanish/French — Mei asked
specifically for "the japanese grammar tests."

Backlog: a growing stack of local commits not yet pushed (`git log
--oneline` vs `git log origin/main..HEAD` if a remote is configured) — always
remind Mei to `git push` from her own Terminal, then check the Render deploy.
