"use client";

/**
 * Almacén local de media para el Modo Demo.
 *
 * Fotos y videos NO van al localStorage (5 MB de cuota): se guardan como Blob
 * en IndexedDB y el perfil solo persiste una referencia `idb:<uuid>`.
 * `resolveMediaUrl()` la convierte en un object URL al renderizar.
 * IndexedDB es compartido entre pestañas del mismo origen → el demo multi-pestaña
 * ve las fotos que sube la otra "persona".
 */
import { uid } from "@/lib/utils";

const DB_NAME = "rouge-media";
const STORE = "blobs";
export const IDB_PREFIX = "idb:";

let dbPromise: Promise<IDBDatabase> | null = null;
const urlCache = new Map<string, string>();

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const isIdbRef = (url: string | null | undefined): url is string => !!url && url.startsWith(IDB_PREFIX);

export async function putMedia(blob: Blob): Promise<string> {
  const key = uid();
  await tx("readwrite", (s) => s.put(blob, key));
  const ref = IDB_PREFIX + key;
  urlCache.set(ref, URL.createObjectURL(blob));
  return ref;
}

export async function deleteMedia(ref: string): Promise<void> {
  if (!isIdbRef(ref)) return;
  const cached = urlCache.get(ref);
  if (cached) URL.revokeObjectURL(cached);
  urlCache.delete(ref);
  await tx("readwrite", (s) => s.delete(ref.slice(IDB_PREFIX.length))).catch(() => undefined);
}

/** Devuelve una URL renderizable. Las URLs normales pasan tal cual. */
export async function resolveMediaUrl(url: string): Promise<string | null> {
  if (!isIdbRef(url)) return url;
  const cached = urlCache.get(url);
  if (cached) return cached;
  const blob = await tx<Blob | undefined>("readonly", (s) => s.get(url.slice(IDB_PREFIX.length))).catch(() => undefined);
  if (!blob) return null;
  const objectUrl = URL.createObjectURL(blob);
  urlCache.set(url, objectUrl);
  return objectUrl;
}

/** Versión sincrónica: solo si ya está en caché (evita parpadeos). */
export const peekMediaUrl = (url: string) => (isIdbRef(url) ? urlCache.get(url) ?? null : url);
