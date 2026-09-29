// Personal data stays in browser storage. This boundary can also hold binary documents later.
export function createJourneyStore(indexedDB = globalThis.indexedDB) {
  function database() {
    return new Promise((resolve, reject) => {
      if (!indexedDB) { reject(new Error('Lokal lagring er ikke tilgængelig.')); return; }
      const request = indexedDB.open('rejseflex-local', 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('journeys')) db.createObjectStore('journeys', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'id' });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
  async function operation(storeName, mode, action) {
    const db = await database();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const request = action(tx.objectStore(storeName));
        let result;
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }
  return {
    getHandicapProvider: async () => (await operation('settings', 'readonly', (store) => store.get('handicapProvider')))?.value ?? null,
    setHandicapProvider: (value) => operation('settings', 'readwrite', (store) => store.put({ id: 'handicapProvider', value })),
    list: () => operation('journeys', 'readonly', (store) => store.getAll()),
    save: (plan) => operation('journeys', 'readwrite', (store) => store.put(plan)),
    // Document references belong in a journey; file bytes remain in this local store.
    putDocument: (document) => operation('documents', 'readwrite', (store) => store.put(document)),
    getDocument: (id) => operation('documents', 'readonly', (store) => store.get(id)),
  };
}
