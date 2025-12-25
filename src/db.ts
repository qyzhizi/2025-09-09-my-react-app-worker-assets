import { openDB } from 'idb';
import type { DBSchema } from 'idb';

interface OfflineDB extends DBSchema {
  submissions: {
    key: number;
    value: {
      id?: number;
      text: string;
      time: number;
    };
  };
}

const DB_NAME = 'offline-form-db';
const STORE_NAME = 'submissions';

export const dbPromise = openDB<OfflineDB>(DB_NAME, 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME, {
        keyPath: 'id',
        autoIncrement: true
      });
    }
  }
});

export async function saveSubmission(text: string) {
  const db = await dbPromise;
  await db.add(STORE_NAME, {
    text,
    time: Date.now()
  });
}

export async function getAllSubmissions() {
  const db = await dbPromise;
  return db.getAll(STORE_NAME);
}

export async function clearSubmissions() {
  const db = await dbPromise;
  await db.clear(STORE_NAME);
}
