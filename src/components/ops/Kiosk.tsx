"use client";

import * as C from "@/lib/store/commands";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Delete, Lock, MonitorSmartphone } from "lucide-react";
import { KIOSK_IDLE_MS } from "@/lib/engine/security";
import { ROLE_META } from "@/lib/engine/roles";
import { getProfile } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import type { StaffRole, UUID } from "@/lib/types";
import { cn } from "@/lib/utils";

type KioskAction = "door.check_in" | "door.rejected" | "bar.delivered" | "perk.redeemed";

interface KioskCtx {
  /** La terminal está en Modo Kiosco (cuenta de dueño/a o producción fija en la barra o la puerta). */
  enabled: boolean;
  operator: { id: UUID; role: StaffRole; name: string } | null;
  setEnabled: (v: boolean) => void;
  lock: () => void;
  /** Registra quién operó (si hay kiosco). Llamar después de cada acción exitosa. */
  audit: (action: KioskAction, target: string) => void;
  /** Marca actividad (posterga el auto-bloqueo). */
  touch: () => void;
}

const Ctx = createContext<KioskCtx | null>(null);
const KEY = "rouge:kiosk";

/**
 * Modo Kiosco: la tablet/PC fija queda logueada con la cuenta del dueño/a o producción, pero para OPERAR cada
 * bartender o guardia ingresa su PIN personal. Se bloquea solo tras 90 s sin uso. Cada entrega o escaneo queda en
 * la auditoría con la persona que operó (no solo con la cuenta de la terminal).
 */
export function KioskProvider({ eventId, children }: { eventId: UUID; children: ReactNode }) {
  const { state, exec, role } = useRouge();
  const [enabled, setEnabledState] = useState(false);
  const [operator, setOperator] = useState<KioskCtx["operator"]>(null);
  const last = useRef(Date.now());
  const canHost = role === "owner" || role === "manager";

  useEffect(() => {
    try {
      setEnabledState(sessionStorage.getItem(KEY) === eventId);
    } catch {
      /* sin storage */
    }
  }, [eventId]);
  const setEnabled = useCallback(
    (v: boolean) => {
      setEnabledState(v);
      setOperator(null);
      try {
        if (v) sessionStorage.setItem(KEY, eventId);
        else sessionStorage.removeItem(KEY);
      } catch {
        /* noop */
      }
    },
    [eventId],
  );
  const lock = useCallback(() => setOperator(null), []);
  const touch = useCallback(() => {
    last.current = Date.now();
  }, []);

  useEffect(() => {
    if (!operator) return;
    const t = setInterval(() => Date.now() - last.current > KIOSK_IDLE_MS && setOperator(null), 5_000);
    const onAny = () => (last.current = Date.now());
    window.addEventListener("pointerdown", onAny);
    window.addEventListener("keydown", onAny);
    return () => {
      clearInterval(t);
      window.removeEventListener("pointerdown", onAny);
      window.removeEventListener("keydown", onAny);
    };
  }, [operator]);

  const audit = useCallback(
    (action: KioskAction, target: string) => {
      if (enabled && operator) void exec(C.kioskAudit(eventId, operator.id, action, target), { silent: true });
    },
    [enabled, operator, exec, eventId],
  );

  const unlock = async (pin: string): Promise<string | null> => {
    const r = await exec(C.kioskUnlock(eventId, pin));
    if (!r.ok) return r.error;
    if ("error" in r.data) return r.data.error;
    last.current = Date.now();
    setOperator({ id: r.data.operatorId, role: r.data.role, name: getProfile(state, r.data.operatorId)?.full_name ?? "Operador/a" });
    return null;
  };

  const value = useMemo<KioskCtx>(() => ({ enabled: enabled && canHost, operator, setEnabled, lock, audit, touch }), [enabled, canHost, operator, setEnabled, lock, audit, touch]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {value.enabled && !operator && <PinPad onSubmit={unlock} onExit={() => setEnabled(false)} />}
    </Ctx.Provider>
  );
}

export function useKiosk(): KioskCtx {
  return useContext(Ctx) ?? { enabled: false, operator: null, setEnabled: () => {}, lock: () => {}, audit: () => {}, touch: () => {} };
}

/** Teclado numérico grande, alto contraste, para desbloquear con el PIN personal. */
function PinPad({ onSubmit, onExit }: { onSubmit: (pin: string) => Promise<string | null>; onExit: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (value = pin) => {
    if (value.length < 4 || busy) return;
    setBusy(true);
    const err = await onSubmit(value);
    setBusy(false);
    setError(err);
    setPin("");
    if (err) navigator.vibrate?.([80, 40, 80]);
  };
  const press = (d: string) => {
    setError(null);
    setPin((p) => (p.length < 6 ? p + d : p));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
      else if (e.key === "Enter") void submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <div role="dialog" aria-modal="true" aria-label="Desbloquear terminal" className="fixed inset-0 z-[80] grid place-items-center bg-black p-6">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-white text-black">
          <Lock className="size-8" />
        </span>
        <h1 className="mt-5 text-3xl text-white">Terminal bloqueada</h1>
        <p className="mt-1 text-base text-white/70">Ingresá tu PIN personal para operar. Cada acción queda a tu nombre.</p>
        <div className="mt-6 flex justify-center gap-3" aria-label={`${pin.length} dígitos`}>
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={cn("size-4 rounded-full border-2", i < pin.length ? "border-white bg-white" : i < 4 ? "border-white/60" : "border-white/20")} />
          ))}
        </div>
        <p role="alert" className={cn("mt-3 min-h-6 font-display text-lg font-bold text-sos", !error && "invisible")}>
          {error ?? "—"}
        </p>
        <div className="mt-2 grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} type="button" onClick={() => press(d)} className="min-h-[72px] rounded-2xl bg-white/10 font-display text-3xl font-bold text-white active:bg-white/25">
              {d}
            </button>
          ))}
          <button type="button" aria-label="Borrar" onClick={() => setPin((p) => p.slice(0, -1))} className="grid min-h-[72px] place-items-center rounded-2xl bg-white/5 text-white active:bg-white/20">
            <Delete className="size-7" />
          </button>
          <button type="button" onClick={() => press("0")} className="min-h-[72px] rounded-2xl bg-white/10 font-display text-3xl font-bold text-white active:bg-white/25">
            0
          </button>
          <button type="button" disabled={pin.length < 4 || busy} onClick={() => void submit()} className="min-h-[72px] rounded-2xl bg-white font-display text-xl font-bold text-black disabled:opacity-40">
            Entrar
          </button>
        </div>
        <button type="button" onClick={onExit} className="mt-6 inline-flex min-h-touch items-center gap-2 text-sm text-white/60 hover:text-white">
          <MonitorSmartphone className="size-4" /> Salir del Modo Kiosco
        </button>
      </div>
    </div>
  );
}

/** Indicador de quién opera la terminal + bloquear. */
export function KioskBadge() {
  const k = useKiosk();
  if (!k.enabled || !k.operator) return null;
  return (
    <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-black">
      <span className="font-display text-sm font-bold">{ROLE_META[k.operator.role].emoji} {k.operator.name.split(" ")[0]}</span>
      <button type="button" onClick={k.lock} aria-label="Bloquear terminal" className="grid size-8 place-items-center rounded-full bg-black text-white">
        <Lock className="size-4" />
      </button>
    </div>
  );
}
