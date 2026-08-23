# Dictionary lookup server — setup

This is the small backend that replaces the old MyMemory lookup with
real Claude-powered dictionary lookups (clean translations, plus
gender/article for Spanish nouns). It runs on your own computer.

## One-time setup

1. Get an API key: go to https://platform.claude.com, sign in, add a
   payment method (pay-as-you-go — see cost notes in chat), then
   create an API key.
2. In the `server` folder, copy `.env.example` to a new file named
   `.env` (same folder).
3. Open `.env` and replace the placeholder with your real key.

## Every time you want to use auto-fill in the Vocab Bank

1. Open Terminal.
2. `cd` into the `server` folder (drag the folder into the Terminal
   window after typing `cd ` to fill in the path automatically).
3. Run:
   ```
   node server.js
   ```
4. You should see: `Dictionary lookup server running at http://localhost:3001`
5. Leave that Terminal window open, then use the Vocab Bank as normal
   (open `vocab.html`, leave one side of a word blank).
6. When you're done, close the Terminal window (or press Ctrl+C) to
   stop the server.

## If auto-fill doesn't work

- Check the Terminal window for an error message — it'll usually say
  exactly what's wrong (e.g. missing API key, or a network problem).
- If the server isn't running at all, the app falls back to the old
  MyMemory lookup automatically rather than breaking, so auto-fill
  will still do *something*, just with the old lower accuracy.
- Nothing about this affects any other part of the app — themes,
  saved words, and conjugation tables all still work with the server
  off, since they never leave your browser.
