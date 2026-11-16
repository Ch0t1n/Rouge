"use client";

/**
 * RougeContext — estado global de la app, con dos modos y UN solo contrato.
 *
 * Modo Demo (sin NEXT_PUBLIC_SUPABASE_URL/ANON_KEY):
 *   - Estado completo en memoria, persistido en localStorage y sembrado con mock data.
 *   - Sincronización entre pestañas vía evento `storage` (simula Realtime).
 *   - Persona activa por pestaña (sessionStorage) + PersonaSwitcher.
 *
 * Modo Supabase:
 *   - Sesión de Supabase Auth (magic link). current_user_id = auth.uid().
 *   - Estado cargado con `fetchRemoteState` (RLS en el servidor) + Realtime + sondeo de respaldo.
 *   - `exec(cmd)`: aplica la regla del motor al instante (optimista), llama a la RPC/tabla
 *     y, si el servidor rechaza, vuelve al estado real y muestra el error traducido.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { RougeState, UUID } from "@/lib/types";
import type { Result } from "@/lib/engine/actions";
import * as A from "@/lib/engine/actions";
import { lobbyPhase } from "@/lib/engine/selectors";
import { BAR_MENU, createSeedState, STATE_VERSION } from "@/lib/mock/seed";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { can as canDo, isStaffRole, roleOf, type Permission, type Role } from "@/lib/engine/roles";
import { fetchRemoteState, subscribeRealtime } from "@/lib/supabase/sync";
import { uid } from "@/lib/utils";
import type { Command } from "./commands";

const STORAGE_KEY = "rouge:state";
/** Persona activa POR PESTAÑA (Modo Demo): cada pestaña simula un teléfono distinto. */
const PERSONA_KEY = "rouge:persona";
/** Evento elegido (Modo Supabase). */
const EVENT_KEY = "rouge:active-event";
const POLL_MS = 45_000;

const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};
/**
 * Persona por marco (demo): `window.name` es propio de cada pestaña E iframe y sobrevive a navegaciones.
 * La usa el modo presentador (/demo/presentador): el teléfono y el panel lado a lado son personas distintas.
 * Si no está fijada, manda la de la pestaña (sessionStorage), como siempre.
 */
export const FRAME_PERSONA_PREFIX = "rouge-persona:";
const framePersona = () => safe(() => (window.name.startsWith(FRAME_PERSONA_PREFIX) ? window.name.slice(FRAME_PERSONA_PREFIX.length) : null), null);
const tabPersona = () => framePersona() ?? safe(() => sessionStorage.getItem(PERSONA_KEY), null);
const rememberPersona = (id: UUID) => {
  if (framePersona() !== null) safe(() => (window.name = FRAME_PERSONA_PREFIX + id), undefined);
  safe(() => sessionStorage.setItem(PERSONA_KEY, id), undefined);
};

export type DataMode = "demo" | "supabase";

export interface Toast {
  id: string;
  tone: "info" | "success" | "error" | "rouge" | "squad" | "vip";
  title: string;
  description?: string;
  /** ms; 0 = persistente hasta cerrar */
  duration?: number;
  cta?: { label: string; href: string };
}

interface RougeContextValue {
  ready: boolean;
  mode: DataMode;
  state: RougeState;
  /** Modo Supabase: hay sesión iniciada (en demo siempre true). */
  signedIn: boolean;
  /** Tipo de usuario en el evento activo (asistente, dueño/a, producción, barra, mozo/a, seguridad). */
  role: Role;
  /** El usuario es parte del equipo del evento activo. */
  isStaff: boolean;
  /** ¿Su rol tiene este permiso en el evento activo? (misma regla que has_staff_role en SQL) */
  can: (perm: Permission) => boolean;
  /**
   * Ejecuta un comando (regla del motor + contraparte remota). Si falla, muestra
   * un toast de error (salvo `silent`). En demo resuelve en el acto.
   */
  exec: <T>(cmd: Command<T>, opts?: { silent?: boolean }) => Promise<Result<T>>;
  /** Fuerza una re-sincronización con el servidor (no-op en demo). */
  refresh: () => Promise<void>;
  setCurrentUser: (id: UUID) => void;
  setActiveEvent: (id: UUID) => void;
  /** Modo Demo: arranca una persona sin perfil para probar el onboarding desde cero. */
  startNewPersona: () => UUID;
  resetDemo: () => void;
  signOut: () => Promise<void>;
  toasts: Toast[];
  notify: (t: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

const Ctx = createContext<RougeContextValue | null>(null);

// ── Modo Demo: persistencia local ────────────────────────────────────

function loadDemoState(now: number): RougeState {
  let s: RougeState | null = null;
  const raw = safe(() => localStorage.getItem(STORAGE_KEY), null);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as RougeState;
      const ev = parsed.events?.find((e) => e.id === parsed.active_event_id);
      // Re-siembra si cambió el formato o si el evento demo ya expiró (Efecto Cenicienta).
      if (parsed.version === STATE_VERSION && ev && lobbyPhase(ev, now) !== "expired") s = A.purgeExpiredPins(parsed, now);
    } catch {
      /* JSON corrupto → semilla nueva */
    }
  }
  s ??= createSeedState(now);
  const persona = tabPersona();
  return persona ? { ...s, current_user_id: persona } : s;
}

/**
 * Guarda el estado demo. Nunca pisa una fiesta más nueva: si otra pestaña/marco reinició la demo
 * (otro `seeded_at`), una vista vieja que se cierra no la revive con su guardado de salida.
 * `force` solo para el reinicio mismo.
 */
const saveDemoState = (state: RougeState, force = false) =>
  safe(() => {
    if (!force) {
      const stored = localStorage.getItem(STORAGE_KEY);
      const seededAt = stored ? (JSON.parse(stored) as { seeded_at?: string }).seeded_at : undefined;
      if (seededAt && seededAt !== state.seeded_at) return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, undefined);

/** Estado vacío (Supabase sin sesión o sin datos todavía). */
function emptyState(userId: UUID = ""): RougeState {
  return {
    version: STATE_VERSION,
    seeded_at: new Date().toISOString(),
    current_user_id: userId,
    active_event_id: "",
    profiles: [],
    instagram_links: [],
    user_blocks: [],
    events: [],
    brands: [],
    brand_payment_accounts: [],
    event_staff: [],
    event_invite_codes: [],
    promoter_links: [],
    api_keys: [],
    event_attendees: [],
    event_bans: [],
    connections: [],
    squads: [],
    squad_members: [],
    map_pins: [],
    messages: [],
    event_blasts: [],
    user_perks_qrs: [],
    perk_rules: [],
    raffles: [],
    song_requests: [],
    bar_menu: BAR_MENU,
    bar_orders: [],
    squad_expenses: [],
    squad_settlements: [],
    payout_aliases: [],
  };
}

export function RougeProvider({ children }: { children: ReactNode }) {
  const mode: DataMode = isSupabaseConfigured ? "supabase" : "demo";
  const [state, setState] = useState<RougeState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [signedIn, setSignedIn] = useState(mode === "demo");
  const stateRef = useRef<RougeState | null>(null);
  const skipNextSave = useRef(false);
  const userRef = useRef<UUID | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = useCallback((s: RougeState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const dismiss = useCallback((id: string) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const notify = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = Math.random().toString(36).slice(2);
      // Máximo 2 banners a la vista: nunca tapar acciones críticas (rescate, chat).
      setToasts((ts) => [...ts.slice(-1), { ...t, id }]);
      const duration = t.duration ?? 4200;
      if (duration > 0) setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  // ── Carga remota ──────────────────────────────────────────────────
  const loadRemote = useCallback(async () => {
    const sb = getSupabase();
    const userId = userRef.current;
    if (!sb) return;
    if (!userId) {
      // Sin sesión: solo eventos públicos (para la landing de /join).
      const { data } = await sb.from("events").select("id,slug,name,description,venue_name,cover_url,starts_at,ends_at,lobby_opens_at,lobby_expires_at,max_capacity");
      const events = ((data ?? []) as RougeState["events"]).map((e) => ({ ...e, venue_layout_json: { aspect: 0.75, sectors: [] }, lineup_json: [], master_invite_code: "", venue_map_url: null, created_by: null }));
      commit({ ...emptyState(), events, active_event_id: events[0]?.id ?? "" });
      setSignedIn(false);
      return;
    }
    try {
      const preferred = safe(() => localStorage.getItem(EVENT_KEY), null);
      const snap = await fetchRemoteState(sb, userId, preferred);
      if (userRef.current !== userId) return; // cambió la sesión mientras cargaba
      // Sesión y estado se publican JUNTOS: nadie ve "signedIn" con el estado de otro usuario
      // (ej. volver de Instagram/Google y decidir "sin perfil → onboarding" antes de cargar).
      commit(snap.state);
      setSignedIn(true);
    } catch (e) {
      notify({ tone: "error", title: friendlyError(e) });
      if (!stateRef.current || stateRef.current.current_user_id !== userId) commit(emptyState(userId));
      setSignedIn(true);
    }
  }, [commit, notify]);

  const refresh = useCallback(async () => {
    if (mode === "supabase") await loadRemote();
  }, [mode, loadRemote]);

  /** Re-sincronización agrupada (ráfagas de Realtime → 1 sola carga). */
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => void loadRemote(), 350);
  }, [loadRemote]);

  // ── Arranque ──────────────────────────────────────────────────────
  useEffect(() => {
    if (mode === "demo") {
      const s = loadDemoState(Date.now());
      rememberPersona(s.current_user_id); // fija la persona de ESTA pestaña
      saveDemoState(s, true); // si se re-sembró (versión nueva o fiesta vencida), esta pasa a ser la vigente
      commit(s);
      return;
    }
    const sb = getSupabase()!;
    let alive = true;
    sb.auth.getSession().then(({ data }) => {
      if (!alive) return;
      userRef.current = data.session?.user.id ?? null;
      void loadRemote();
    });
    const { data: sub } = sb.auth.onAuthStateChange((_evt, session) => {
      const next = session?.user.id ?? null;
      if (next === userRef.current) return;
      userRef.current = next;
      if (!session) setSignedIn(false);
      void loadRemote();
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [mode, commit, loadRemote]);

  // ── Realtime + sondeo de respaldo (Supabase) ──────────────────────
  const activeEventId = state?.active_event_id ?? "";
  useEffect(() => {
    if (mode !== "supabase" || !signedIn) return;
    const sb = getSupabase()!;
    const channel: RealtimeChannel = subscribeRealtime(sb, activeEventId, scheduleRefresh);
    const poll = setInterval(() => document.visibilityState === "visible" && scheduleRefresh(), POLL_MS);
    const onFocus = () => scheduleRefresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      void sb.removeChannel(channel);
    };
  }, [mode, signedIn, activeEventId, scheduleRefresh]);

  // ── Demo: persistencia + sync entre pestañas ──────────────────────
  useEffect(() => {
    if (mode !== "demo" || !state) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const t = setTimeout(() => saveDemoState(state), 120);
    return () => clearTimeout(t);
  }, [mode, state]);

  useEffect(() => {
    if (mode !== "demo") return;
    // Flush al ocultar/cerrar la app (iOS/Android matan la PWA en background sin aviso)
    const flush = () => stateRef.current && saveDemoState(stateRef.current);
    const onVisibility = () => document.visibilityState === "hidden" && flush();
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const incoming = JSON.parse(e.newValue) as RougeState;
        const local = stateRef.current; // cada pestaña conserva su persona y evento
        skipNextSave.current = true;
        commit(local ? { ...incoming, current_user_id: local.current_user_id, active_event_id: local.active_event_id } : incoming);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
    };
  }, [mode, commit]);

  // Barrido de pines expirados cada 30 s (ambos modos: la UI nunca muestra pines vencidos)
  useEffect(() => {
    const t = setInterval(() => {
      const s = stateRef.current;
      if (s) {
        const next = A.purgeExpiredPins(s, Date.now());
        if (next !== s) commit(next);
      }
    }, 30_000);
    return () => clearInterval(t);
  }, [commit]);

  // ── exec: comando optimista + servidor ────────────────────────────
  const exec = useCallback(
    async <T,>(cmd: Command<T>, opts?: { silent?: boolean }): Promise<Result<T>> => {
      const before = stateRef.current;
      if (!before) return { ok: false, error: "La app todavía está cargando." };
      const local = cmd.local(before);
      if (!local.ok) {
        if (!opts?.silent) notify({ tone: "error", title: local.error });
        return local;
      }
      const sb = mode === "supabase" ? getSupabase() : null;
      const waitForServer = !!sb && !!cmd.remote && cmd.optimistic === false;
      if (!waitForServer) commit(local.state);

      if (mode === "demo") {
        // Guardado sincrónico: una acción nunca se pierde por navegar o cerrar al instante.
        saveDemoState(local.state);
        return local;
      }

      if (!sb || !cmd.remote) return local;
      try {
        const data = await cmd.remote(sb, local.data, before);
        // Reconciliación inmediata: ids, códigos (Squad, retiro) y totales pasan a ser los del servidor
        // ANTES de devolver el control (nunca se comparte un código optimista que no existe).
        await loadRemote();
        return { ok: true, state: stateRef.current ?? local.state, data: (data ?? local.data) as T };
      } catch (e) {
        await loadRemote(); // vuelve a la verdad del servidor
        const error = friendlyError(e);
        if (!opts?.silent) notify({ tone: "error", title: error });
        return { ok: false, error };
      }
    },
    [mode, commit, notify, loadRemote],
  );

  // ── Persona / evento ──────────────────────────────────────────────
  const setCurrentUser = useCallback(
    (id: UUID) => {
      if (mode !== "demo") return;
      rememberPersona(id);
      const s = stateRef.current;
      if (s) commit({ ...s, current_user_id: id });
    },
    [mode, commit],
  );

  const setActiveEvent = useCallback(
    (id: UUID) => {
      safe(() => localStorage.setItem(EVENT_KEY, id), undefined);
      const s = stateRef.current;
      if (s) commit({ ...s, active_event_id: id });
      if (mode === "supabase") void loadRemote();
    },
    [mode, commit, loadRemote],
  );

  const startNewPersona = useCallback(() => {
    const id = uid();
    rememberPersona(id);
    const s = stateRef.current;
    if (s) commit({ ...s, current_user_id: id });
    return id;
  }, [commit]);

  const resetDemo = useCallback(() => {
    const fresh = createSeedState(Date.now());
    rememberPersona(fresh.current_user_id);
    commit(fresh);
    saveDemoState(fresh, true);
  }, [commit]);

  const signOut = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    await sb.auth.signOut();
    userRef.current = null;
    setSignedIn(false);
    await loadRemote();
  }, [loadRemote]);

  const value = useMemo<RougeContextValue | null>(() => {
    if (!state) return null;
    const role = signedIn ? roleOf(state, state.active_event_id, state.current_user_id) : "guest";
    const can = (perm: Permission) => signedIn && canDo(state, state.active_event_id, state.current_user_id, perm);
    return { ready: true, mode, state, signedIn, role, isStaff: isStaffRole(role), can, exec, refresh, setCurrentUser, setActiveEvent, startNewPersona, resetDemo, signOut, toasts, notify, dismiss };
  }, [state, mode, signedIn, exec, refresh, setCurrentUser, setActiveEvent, startNewPersona, resetDemo, signOut, toasts, notify, dismiss]);

  if (!value) return <BootScreen />;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRouge() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRouge debe usarse dentro de <RougeProvider>");
  return ctx;
}

/** Reloj compartido para countdowns (pines de 15 min, line-up, flash promos). */
export function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function BootScreen() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background" aria-busy="true" aria-live="polite">
      <span className="font-display text-4xl font-bold tracking-tight text-rouge text-glow-rouge animate-neon-flicker">ROUGE</span>
      <span className="sr-only">Cargando</span>
      <div className="flex h-6 items-end gap-1" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="h-full w-1 origin-bottom rounded-full bg-rouge/80 animate-eq-bar" style={{ animationDelay: `${i * 0.12}s` }} />
        ))}
      </div>
    </div>
  );
}
