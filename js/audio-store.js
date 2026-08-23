/*
  audio-store.js
  --------------
  Stores each Speaking entry's recorded audio as a Blob in IndexedDB,
  keyed by the entry's id (from storage.js's speakingEntries). Entries
  themselves live in localStorage like everything else in this app, but
  localStorage can only hold small strings — even a short recording can
  be a few hundred KB, so the actual audio lives here instead, in its
  own local database.

  Every method returns a Promise (IndexedDB's native API is
  callback-based, so this just wraps it).
*/

const AUDIO_DB_NAME = "vocabBankAudio";
const AUDIO_DB_VERSION = 1;
const AUDIO_STORE_NAME = "recordings";

function openAudioDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("This browser doesn't support saving recordings locally."));
      return;
    }
    const request = indexedDB.open(AUDIO_DB_NAME, AUDIO_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        db.createObjectStore(AUDIO_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Couldn't open the recordings database."));
  });
}

// Saving the same entryId again just overwrites the previous take —
// re-recording an entry replaces its audio rather than piling up old
// clips.
async function saveRecording(entryId, blob) {
  const db = await openAudioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE_NAME, "readwrite");
    tx.objectStore(AUDIO_STORE_NAME).put(blob, entryId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Couldn't save the recording."));
  });
}

// Resolves to the stored Blob, or null if this entry has no recording.
async function getRecording(entryId) {
  const db = await openAudioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE_NAME, "readonly");
    const req = tx.objectStore(AUDIO_STORE_NAME).get(entryId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error("Couldn't load the recording."));
  });
}

async function deleteRecording(entryId) {
  const db = await openAudioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE_NAME, "readwrite");
    tx.objectStore(AUDIO_STORE_NAME).delete(entryId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Couldn't delete the recording."));
  });
}

async function hasRecording(entryId) {
  try {
    const blob = await getRecording(entryId);
    return !!blob;
  } catch (e) {
    return false;
  }
}

const AudioStore = { saveRecording, getRecording, deleteRecording, hasRecording };

if (typeof module !== "undefined" && module.exports) {
  module.exports = AudioStore;
} else {
  window.AudioStore = AudioStore;
}
