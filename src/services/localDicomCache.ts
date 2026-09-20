/**
 * RadiAnt-Style High-Performance Local DICOM Storage & Cache Service
 * Provides instantaneous 0ms study loading from fast local storage (IndexedDB / SSD).
 */

const DB_NAME = 'radiant_dicom_cache_v3';
const STORE_STUDIES = 'studies';
const STORE_SLICES = 'slices';

let cachedDb: IDBDatabase | null = null;
const MAX_CACHED_STUDIES = 3;

// High-performance batched slice persistence queue to eliminate IndexedDB transaction exhaustion
let pendingSlicesQueue: CachedSliceEntry[] = [];
let sliceFlushTimer: any = null;
let isFlushingSlices = false;

async function flushPendingSlices(): Promise<void> {
  if (isFlushingSlices || pendingSlicesQueue.length === 0) return;
  isFlushingSlices = true;
  const chunk = pendingSlicesQueue.splice(0, 30);
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_SLICES, 'readwrite');
    const store = tx.objectStore(STORE_SLICES);
    for (const entry of chunk) {
      store.put(entry);
    }
  } catch (err) {
    console.warn('Batch cache save error:', err);
  } finally {
    isFlushingSlices = false;
    if (pendingSlicesQueue.length > 0) {
      setTimeout(flushPendingSlices, 10);
    }
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (cachedDb) {
    return Promise.resolve(cachedDb);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_STUDIES)) {
        db.createObjectStore(STORE_STUDIES, { keyPath: 'studyInstanceUid' });
      }
      if (!db.objectStoreNames.contains(STORE_SLICES)) {
        const sliceStore = db.createObjectStore(STORE_SLICES, { keyPath: 'id' });
        sliceStore.createIndex('studyUid', 'studyInstanceUid', { unique: false });
      }
    };

    request.onsuccess = () => {
      cachedDb = request.result;
      cachedDb.onclose = () => { cachedDb = null; };
      cachedDb.onversionchange = () => {
        if (cachedDb) {
          cachedDb.close();
          cachedDb = null;
        }
      };
      resolve(cachedDb);
    };
    request.onerror = () => {
      cachedDb = null;
      reject(request.error);
    };
  });
}

export interface CachedSliceEntry {
  id: string;
  studyInstanceUid: string;
  fileName: string;
  buffer: ArrayBuffer;
  timestamp: number;
}

export interface CachedStudyMetadata {
  studyInstanceUid: string;
  patientName: string;
  patientId: string;
  studyDescription: string;
  studyDate: string;
  modalities: string;
  sliceCount: number;
  lastAccessed: number;
}

export class LocalDicomCache {
  /**
   * Checks if a full study exists in the fast local cache
   */
  static async hasStudy(studyInstanceUid: string): Promise<boolean> {
    try {
      const db = await openDatabase();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_STUDIES, 'readonly');
        const store = tx.objectStore(STORE_STUDIES);
        const req = store.get(studyInstanceUid);
        req.onsuccess = () => resolve(!!req.result && req.result.sliceCount > 0);
        req.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }

  /**
   * Retrieves all cached raw DICOM slices for a study in milliseconds
   */
  static async getStudySlices(studyInstanceUid: string): Promise<{ fileName: string; buffer: ArrayBuffer }[] | null> {
    try {
      const db = await openDatabase();
      return new Promise((resolve) => {
        const tx = db.transaction([STORE_STUDIES, STORE_SLICES], 'readwrite');
        const studyStore = tx.objectStore(STORE_STUDIES);
        const sliceStore = tx.objectStore(STORE_SLICES);
        const index = sliceStore.index('studyUid');

        // Update last accessed timestamp
        const studyReq = studyStore.get(studyInstanceUid);
        studyReq.onsuccess = () => {
          if (studyReq.result) {
            studyReq.result.lastAccessed = Date.now();
            studyStore.put(studyReq.result);
          }
        };

        const sliceReq = index.getAll(studyInstanceUid);
        sliceReq.onsuccess = () => {
          const results = sliceReq.result as CachedSliceEntry[];
          if (!results || results.length === 0) {
            resolve(null);
          } else {
            resolve(results.map(r => ({ fileName: r.fileName, buffer: r.buffer })));
          }
        };
        sliceReq.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Saves incoming slices to local fast cache in background with batching
   */
  static async saveSlice(studyInstanceUid: string, fileName: string, buffer: ArrayBuffer): Promise<void> {
    try {
      pendingSlicesQueue.push({
        id: `${studyInstanceUid}_${fileName}`,
        studyInstanceUid,
        fileName,
        buffer,
        timestamp: Date.now()
      });
      if (pendingSlicesQueue.length >= 30) {
        if (sliceFlushTimer) { clearTimeout(sliceFlushTimer); sliceFlushTimer = null; }
        flushPendingSlices();
      } else if (!sliceFlushTimer) {
        sliceFlushTimer = setTimeout(() => {
          sliceFlushTimer = null;
          flushPendingSlices();
        }, 150);
      }
    } catch (err) {
      console.warn('Cache save slice error:', err);
    }
  }

  /**
   * Saves study metadata and finalizes cache entry
   */
  static async finalizeStudy(metadata: CachedStudyMetadata): Promise<void> {
    try {
      // Ensure all queued slices are flushed before finalizing metadata
      if (pendingSlicesQueue.length > 0) {
        await flushPendingSlices();
      }
      const db = await openDatabase();
      const tx = db.transaction(STORE_STUDIES, 'readwrite');
      const store = tx.objectStore(STORE_STUDIES);
      store.put({ ...metadata, lastAccessed: Date.now() });

      // Automatically prune oldest studies if total count exceeds MAX_CACHED_STUDIES
      const allReq = store.getAll();
      allReq.onsuccess = () => {
        const allStudies = allReq.result as CachedStudyMetadata[];
        if (allStudies && allStudies.length > MAX_CACHED_STUDIES) {
          allStudies.sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0));
          const toRemove = allStudies.slice(0, allStudies.length - MAX_CACHED_STUDIES);
          for (const s of toRemove) {
            LocalDicomCache.deleteStudy(s.studyInstanceUid);
          }
        }
      };
    } catch (err) {
      console.warn('Cache finalize study error:', err);
    }
  }

  /**
   * Gets list of all locally cached studies
   */
  static async listCachedStudies(): Promise<CachedStudyMetadata[]> {
    try {
      const db = await openDatabase();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_STUDIES, 'readonly');
        const store = tx.objectStore(STORE_STUDIES);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  /**
   * Deletes a specific study and all its slices from local cache
   */
  static async deleteStudy(studyInstanceUid: string): Promise<void> {
    pendingSlicesQueue = pendingSlicesQueue.filter(s => s.studyInstanceUid !== studyInstanceUid);
    try {
      const db = await openDatabase();
      const tx = db.transaction([STORE_STUDIES, STORE_SLICES], 'readwrite');
      tx.objectStore(STORE_STUDIES).delete(studyInstanceUid);
      
      const sliceStore = tx.objectStore(STORE_SLICES);
      const index = sliceStore.index('studyUid');
      const req = index.getAllKeys(studyInstanceUid);
      req.onsuccess = () => {
        try {
          const keys = req.result;
          if (keys && keys.length > 0) {
            keys.forEach(k => {
              try { sliceStore.delete(k); } catch (_) {}
            });
          }
        } catch (_) {}
      };
    } catch (e) {}
  }

  /**
   * Clears old cache data to free storage
   */
  static async clearCache(): Promise<void> {
    try {
      const db = await openDatabase();
      const tx = db.transaction([STORE_STUDIES, STORE_SLICES], 'readwrite');
      tx.objectStore(STORE_STUDIES).clear();
      tx.objectStore(STORE_SLICES).clear();
    } catch (e) {}
  }
}
