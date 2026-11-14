/**
 * Cliente de Supabase (browser). Devuelve null cuando no hay credenciales:
 * en ese caso la app corre en Modo Demo con el RougeContext local.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return client;
}

/** Buckets de Storage (ver supabase/schema.sql → sección STORAGE). */
export const STORAGE_BUCKETS = {
  avatars: "profile-media",
  venueMaps: "venue-maps",
  chat: "chat-media",
} as const;
