"use client";

/**
 * RougeContext — estado global de la app.
 *
 * Modo Demo (sin credenciales de Supabase en .env.local):
 *   - Estado completo en memoria, persistido en localStorage.
 *   - Sincronización entre pestañas vía evento `storage` → abrí dos pestañas,
 *     cambiá de persona en una y probá matches/chat/rescate "en vivo".
 *
 * Modo Supabase: el mismo contrato de acciones se implementa sobre RPC + Realtime
 * (se conecta progresivamente en las fases siguientes; ver CLAUDE.md).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { RougeState, UUID } from "@/lib/types";
import type { Result } from "@/lib/engine/actions";
import * as A from "@/lib/engine/actions";
import { lobbyPhase } from "@/lib/engine/selectors";
import { createSeedState, STATE_VERSION } from "@/lib/mock/seed";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { uid } from "@/lib/utils";

const STORAGE_KEY = "rouge:state";
/** Persona activa POR PESTAÑA (Modo Demo): cada pestaña simula un teléfono distinto. */
const PERSONA_KEY = "rouge:persona";

function tabPersona(): UUID | null {
  try {
    return sessionStorage.getItem(PERSONA_KEY);
  } catch {
    return null;
  }
}

function rememberPersona(id: UUID) {
  try {
    sessionStorage.setItem(PERSONA_KEY, id);
  } catch {
    /* ignore */
  }
}

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
  /** Ejecuta una transición pura del motor. Si falla, muestra un toast de error. */
  run: <T>(fn: (s: RougeState) => Result<T>, opts?: { silent?: boolean }) => Result<T>;
  setCurrentUser: (id: UUID) => void;
  setActiveEvent: (id: UUID) => void;
  /** Modo Demo: arranca una persona sin perfil para probar el onboarding desde cero. */
  startNewPersona: () => UUID;
  resetDemo: () => void;
  toasts: Toast[];
  notify: (t: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

const Ctx = createContext<RougeContextValue | null>(null);

function loadState(now: number): RougeState {
  const s = loadStoredState(now);
  const persona = tabPersona();
  return persona ? { ...s, current_user_id: persona } : s;
}

function loadStoredState(now: number): RougeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RougeState;
      const ev = parsed.events?.find((e) => e.id === parsed.active_event_id);
      // Re-siembra si cambió el formato o si el evento demo ya expiró (Efecto Cenicienta).
      if (parsed.version === STATE_VERSION && ev && lobbyPhase(ev, now) !== "expired") {
        return A.purgeExpiredPins(parsed, now);
      }
    }
  } catch {
    /* localStorage bloqueado o JSON corrupto → semilla nueva */
  }
  return createSeedState(now);
}

function saveState(state: RougeState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* cuota excedida o modo privado: seguimos en memoria */
  }
}

export function RougeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RougeState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const stateRef = useRef<RougeState | null>(null);
  const skipNextSave = useRef(false);

  // Hidratación SOLO en cliente (la semilla depende de Date.now()).
  useEffect(() => {
    const s = loadState(Date.now());
    rememberPersona(s.current_user_id); // fija la persona de ESTA pestaña
    stateRef.current = s;
    setState(s);
  }, []);

  // Persistencia
  useEffect(() => {
    if (!state) return;
    stateRef.current = state;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const t = setTimeout(() => saveState(state), 120);
    return () => clearTimeout(t);
  }, [state]);

  // Flush al ocultar/cerrar la app (iOS/Android matan la PWA en background sin aviso)
  useEffect(() => {
    const flush = () => stateRef.current && saveState(stateRef.current);
    const onVisibility = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // "Realtime" entre pestañas en Modo Demo
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const incoming = JSON.parse(e.newValue) as RougeState;
        // Cada pestaña conserva su propia persona y evento activos.
        const local = stateRef.current;
        skipNextSave.current = true;
        setState(local ? { ...incoming, current_user_id: local.current_user_id, active_event_id: local.active_event_id } : incoming);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Barrido de pines expirados cada 30 s
  useEffect(() => {
    const t = setInterval(() => {
      setState((s) => (s ? A.purgeExpiredPins(s, Date.now()) : s));
    }, 30_000);
    return () => clearInterval(t);
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

  const run = useCallback(
    <T,>(fn: (s: RougeState) => Result<T>, opts?: { silent?: boolean }): Result<T> => {
      const current = stateRef.current;
      if (!current) return { ok: false, error: "La app todavía está cargando." };
      const result = fn(current);
      if (result.ok) {
        stateRef.current = result.state;
        // Guardado sincrónico: una acción del usuario nunca se pierde por navegar o cerrar al instante.
        saveState(result.state);
        setState(result.state);
      } else if (!opts?.silent) {
        notify({ tone: "error", title: result.error });
      }
      return result;
    },
    [notify],
  );

  const setCurrentUser = useCallback((id: UUID) => {
    rememberPersona(id);
    setState((s) => (s ? { ...s, current_user_id: id } : s));
  }, []);
  const setActiveEvent = useCallback((id: UUID) => setState((s) => (s ? { ...s, active_event_id: id } : s)), []);
  const startNewPersona = useCallback(() => {
    const id = uid();
    rememberPersona(id);
    setState((s) => (s ? { ...s, current_user_id: id } : s));
    return id;
  }, []);
  const resetDemo = useCallback(() => {
    const fresh = createSeedState(Date.now());
    rememberPersona(fresh.current_user_id);
    stateRef.current = fresh;
    setState(fresh);
    saveState(fresh);
  }, []);

  const value = useMemo<RougeContextValue | null>(
    () =>
      state
        ? {
            ready: true,
            mode: isSupabaseConfigured ? "supabase" : "demo",
            state,
            run,
            setCurrentUser,
            setActiveEvent,
            startNewPersona,
            resetDemo,
            toasts,
            notify,
            dismiss,
          }
        : null,
    [state, run, setCurrentUser, setActiveEvent, startNewPersona, resetDemo, toasts, notify, dismiss],
  );

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
