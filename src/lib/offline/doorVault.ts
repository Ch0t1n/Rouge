/**
 * Bóveda CIFRADA de la puerta (solo navegador): padrón del evento y cola de ingresos sin conexión.
 *
 * - IndexedDB `rouge-door`, store `vault`.
 * - Cifrado AES-GCM 256 con una CryptoKey NO exportable generada en el dispositivo y guardada en la misma base
 *   (IndexedDB guarda objetos CryptoKey sin exponer su material): quien copie los archivos del navegador no obtiene el
 *   padrón en claro, y la clave no se puede leer desde JavaScript.
 * - Nada de esto pasa por localStorage (sincrónico y en texto plano).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UUID } from "@/lib/types";
import type { DoorRoster, OfflineCheckIn } from "@/lib/engine/doorOffline";

const DB = "rouge-door";
const STORE = "vault";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

async function deviceKey(): Promise<CryptoKey> {
  const existing = await idb<CryptoKey | undefined>("readonly", (s) => s.get("key"));
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await idb("readwrite", (s) => s.put(key, "key"));
  return key;
}

async function seal(value: unknown): Promise<{ iv: Uint8Array; data: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await deviceKey(), new TextEncoder().encode(JSON.stringify(value)));
  return { iv, data };
}

async function unseal<T>(box: { iv: Uint8Array; data: ArrayBuffer } | undefined): Promise<T | null> {
  if (!box) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: box.iv as BufferSource }, await deviceKey(), box.data);
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    return null; // clave rotada o datos dañados: se vuelve a bajar el padrón
  }
}

export const vaultAvailable = () => typeof indexedDB !== "undefined" && typeof crypto !== "undefined" && !!crypto.subtle;

export async function saveRoster(roster: DoorRoster) {
  // Se cifra ANTES de abrir la transacción (una transacción de IndexedDB se cierra si se espera otra promesa).
  const box = await seal(roster);
  await idb("readwrite", (s) => s.put(box, `roster:${roster.event_id}`));
}

export async function loadRoster(eventId: UUID): Promise<DoorRoster | null> {
  return unseal<DoorRoster>(await idb("readonly", (s) => s.get(`roster:${eventId}`)));
}

export async function saveQueue(eventId: UUID, queue: OfflineCheckIn[]) {
  const box = await seal(queue);
  await idb("readwrite", (s) => s.put(box, `queue:${eventId}`));
}

export async function loadQueue(eventId: UUID): Promise<OfflineCheckIn[]> {
  return (await unseal<OfflineCheckIn[]>(await idb("readonly", (s) => s.get(`queue:${eventId}`)))) ?? [];
}

const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Padrón desde el servidor (Supabase: RPC door_roster, solo dueño/a, producción y seguridad). */
export async function fetchRoster(sb: SupabaseClient, eventId: UUID): Promise<DoorRoster> {
  const { data, error } = await sb.rpc("door_roster", { p_event: eventId });
  if (error) throw error;
  const r = data as DoorRoster;
  return { ...r, codes: r.codes.map((c) => ({ ...c, search: fold(c.search ?? "") })) };
}
