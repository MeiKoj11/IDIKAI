/*
  db.js
  -----
  Tiny persistence layer for accounts + cross-device sync, built on
  Node's own built-in `node:sqlite` module (Node 22.5+) — no npm
  dependency, no native compile step, nothing extra to install locally
  or on Render.

  Three tables:
    users      - one row per account (email + password hash/salt)
    sessions   - one row per logged-in session token (cookie value)
    user_data  - one row per (user, storage key) pair — this is the
                 server-side mirror of what used to be a browser's
                 localStorage. Each row's `value` is a JSON string,
                 exactly the same shape storage.js used to hand to
                 localStorage.setItem, just persisted server-side and
                 scoped to whichever account is logged in instead of
                 whichever browser happens to be open.

  DB_PATH picks where the .sqlite file lives:
    - Locally, defaults to server/data.db (gitignored).
    - On Render, set DB_PATH to a path on the attached persistent disk
      (e.g. /var/data/app.db) so the data survives redeploys — without
      that, Render's filesystem resets on every deploy and every
      account/entry would vanish.
*/

const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data.db");
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_data (
    user_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
  );
`);

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ---- Passwords ----
// scrypt (Node built-in, no bcrypt dependency) with a random per-user
// salt. 64-byte derived key, constant-time compare on verification.

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function verifyPassword(password, salt, expectedHash) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(expectedHash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ---- Users ----

function createUser(email, password, isAdmin) {
  const normalizedEmail = email.trim().toLowerCase();
  const { hash, salt } = hashPassword(password);
  const stmt = db.prepare(
    "INSERT INTO users (email, password_hash, password_salt, is_admin, created_at) VALUES (?, ?, ?, ?, ?)"
  );
  const info = stmt.run(normalizedEmail, hash, salt, isAdmin ? 1 : 0, new Date().toISOString());
  return findUserById(Number(info.lastInsertRowid));
}

function findUserByEmail(email) {
  const normalizedEmail = email.trim().toLowerCase();
  return db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail) || null;
}

function findUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) || null;
}

function anyUsersExist() {
  const row = db.prepare("SELECT COUNT(*) AS count FROM users").get();
  return row.count > 0;
}

function listUsers() {
  return db.prepare("SELECT id, email, is_admin, created_at FROM users ORDER BY created_at ASC").all();
}

// ---- Sessions ----

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_LIFETIME_MS);
  db.prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    token,
    userId,
    now.toISOString(),
    expires.toISOString()
  );
  return { token, expiresAt: expires };
}

// Returns the logged-in user (or null), and quietly deletes the
// session row if it's expired rather than leaving it to rot.
function findUserBySessionToken(token) {
  if (!token) return null;
  const session = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }
  return findUserById(session.user_id);
}

function deleteSession(token) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

// ---- Per-user data (the localStorage mirror) ----

function getAllUserData(userId) {
  const rows = db.prepare("SELECT key, value FROM user_data WHERE user_id = ?").all(userId);
  const result = {};
  rows.forEach((row) => {
    try {
      result[row.key] = JSON.parse(row.value);
    } catch (e) {
      // Corrupt row shouldn't take down the whole sync payload.
      console.warn(`Could not parse stored value for user ${userId}, key "${row.key}" — skipping.`);
    }
  });
  return result;
}

function setUserData(userId, key, value) {
  const json = JSON.stringify(value);
  db.prepare(
    `INSERT INTO user_data (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(userId, key, json, new Date().toISOString());
}

// Bulk import used by the one-time "bring my old browser data into my
// new account" migration flow. overwrite=false (the default) only
// fills in keys the account doesn't already have a value for, so
// re-running the migration page by accident can't clobber anything
// written since.
function importUserData(userId, blob, overwrite) {
  const existingKeys = new Set(Object.keys(getAllUserData(userId)));
  let imported = 0;
  let skipped = 0;
  Object.keys(blob || {}).forEach((key) => {
    if (!overwrite && existingKeys.has(key)) {
      skipped++;
      return;
    }
    setUserData(userId, key, blob[key]);
    imported++;
  });
  return { imported, skipped };
}

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  anyUsersExist,
  listUsers,
  createSession,
  findUserBySessionToken,
  deleteSession,
  getAllUserData,
  setUserData,
  importUserData,
  verifyPassword,
};
