"use client";

/**
 * Subida de media del perfil y del chat.
 *  - Con Supabase configurado y sesión iniciada → Storage (bucket público/privado).
 *  - Sin backend (Modo Demo) → IndexedDB local (`idb:` ref).
 * Siempre recibe archivos YA comprimidos (ver compress.ts).
 */
import { getSupabase, STORAGE_BUCKETS } from "@/lib/supabase/client";
import { uid } from "@/lib/utils";
import { deleteMedia, isIdbRef, putMedia } from "./mediaStore";

export type MediaKind = "photo" | "loop" | "chat";

const EXT: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "video/webm": "webm", "video/mp4": "mp4" };

export async function uploadMedia(blob: Blob, kind: MediaKind): Promise<string> {
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb.auth.getUser();
    if (data.user) {
      const bucket = kind === "chat" ? STORAGE_BUCKETS.chat : STORAGE_BUCKETS.avatars;
      const path = `${data.user.id}/${kind}-${uid()}.${EXT[blob.type] ?? "bin"}`;
      const { error } = await sb.storage.from(bucket).upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
      if (error) throw new Error("No se pudo subir el archivo. Probá de nuevo con mejor señal.");
      if (kind === "chat") {
        const { data: signed } = await sb.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 7);
        if (signed?.signedUrl) return signed.signedUrl;
      }
      return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    }
  }
  return putMedia(blob);
}

/** Borra media que ya no se usa (solo la local; en Storage la limpia un job). */
export async function discardMedia(url: string | null | undefined) {
  if (isIdbRef(url)) await deleteMedia(url);
}
