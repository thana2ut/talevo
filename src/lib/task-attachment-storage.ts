import {
  LEGACY_KERNOVA_ATTACHMENTS_DATABASE_NAME,
  TALEVO_ATTACHMENTS_DATABASE_NAME,
} from "@/lib/talevo-storage-keys";

const storeName = "task-attachments";
const databaseVersion = 1;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("ไม่สามารถจัดการไฟล์แนบได้"));
  });
}

async function getDatabase(name: string): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !window.indexedDB) throw new Error("เบราว์เซอร์นี้ไม่รองรับการเก็บไฟล์ในเครื่อง");
  const request = window.indexedDB.open(name, databaseVersion);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName);
  };
  const database = await requestResult(request);
  database.onversionchange = () => database.close();
  return database;
}

async function databaseExists(name: string) {
  if (typeof window === "undefined" || !window.indexedDB) return false;
  if (typeof window.indexedDB.databases !== "function") return true;
  try {
    return (await window.indexedDB.databases()).some((database) => database.name === name);
  } catch {
    // Older/privacy-restricted browsers can still attempt the compatibility read.
    return true;
  }
}

async function withStore<T>(databaseName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await getDatabase(databaseName);
  try {
    return await requestResult(action(database.transaction(storeName, mode).objectStore(storeName)));
  } finally {
    database.close();
  }
}

export function saveAttachmentBlob(id: string, blob: Blob): Promise<IDBValidKey> {
  return withStore(TALEVO_ATTACHMENTS_DATABASE_NAME, "readwrite", (store) => store.put(blob, id));
}

export async function getAttachmentBlob(id: string): Promise<Blob | undefined> {
  const current = await withStore(TALEVO_ATTACHMENTS_DATABASE_NAME, "readonly", (store) => store.get(id));
  if (current !== undefined) return current;
  if (!await databaseExists(LEGACY_KERNOVA_ATTACHMENTS_DATABASE_NAME)) return undefined;

  const legacy = await withStore(LEGACY_KERNOVA_ATTACHMENTS_DATABASE_NAME, "readonly", (store) => store.get(id));
  if (legacy === undefined) return undefined;
  try {
    await withStore(TALEVO_ATTACHMENTS_DATABASE_NAME, "readwrite", (store) => store.put(legacy, id));
    return await withStore(TALEVO_ATTACHMENTS_DATABASE_NAME, "readonly", (store) => store.get(id)) ?? legacy;
  } catch {
    // Keep the attachment usable from the legacy database and retry migration later.
    return legacy;
  }
}

export async function deleteAttachmentBlob(id: string): Promise<undefined> {
  const operations: Promise<unknown>[] = [
    withStore(TALEVO_ATTACHMENTS_DATABASE_NAME, "readwrite", (store) => store.delete(id)),
  ];
  if (await databaseExists(LEGACY_KERNOVA_ATTACHMENTS_DATABASE_NAME)) {
    operations.push(withStore(LEGACY_KERNOVA_ATTACHMENTS_DATABASE_NAME, "readwrite", (store) => store.delete(id)));
  }
  await Promise.all(operations);
  return undefined;
}

export async function clearAttachmentBlobs(): Promise<undefined> {
  const operations: Promise<unknown>[] = [
    withStore(TALEVO_ATTACHMENTS_DATABASE_NAME, "readwrite", (store) => store.clear()),
  ];
  if (await databaseExists(LEGACY_KERNOVA_ATTACHMENTS_DATABASE_NAME)) {
    operations.push(withStore(LEGACY_KERNOVA_ATTACHMENTS_DATABASE_NAME, "readwrite", (store) => store.clear()));
  }
  await Promise.all(operations);
  return undefined;
}
