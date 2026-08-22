/**
 * RadiAnt-Style High-Performance Local DICOM Storage & Cache Service
 * Provides instantaneous 0ms study loading from fast local storage (IndexedDB / SSD).
 */

const DB_NAME = 'radiant_dicom_cache_v3';
const STORE_STUDIES = 'studies';
const STORE_SLICES = 'slices';

function openDatabase(): Promise<IDBDatabase> {
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

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
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
   * Saves incoming slices to local fast cache in background
   */
  static async saveSlice(studyInstanceUid: string, fileName: string, buffer: ArrayBuffer): Promise<void> {
    try {
      const db = await openDatabase();
      const tx = db.transaction(STORE_SLICES, 'readwrite');
      const store = tx.objectStore(STORE_SLICES);
      const entry: CachedSliceEntry = {
        id: `${studyInstanceUid}_${fileName}`,
        studyInstanceUid,
        fileName,
        buffer,
        timestamp: Date.now()
      };
      store.put(entry);
    } catch (err) {
      console.warn('Cache save slice error:', err);
    }
  }

  /**
   * Saves study metadata and finalizes cache entry
   */
  static async finalizeStudy(metadata: CachedStudyMetadata): Promise<void> {
    try {
      const db = await openDatabase();
      const tx = db.transaction(STORE_STUDIES, 'readwrite');
      const store = tx.objectStore(STORE_STUDIES);
      store.put({ ...metadata, lastAccessed: Date.now() });
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
