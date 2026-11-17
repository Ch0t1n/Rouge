"use client";

import * as C from "@/lib/store/commands";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, CameraOff, CheckCircle2, Clock, CloudOff, Keyboard, MonitorSmartphone, RefreshCw, Search, ShieldAlert, Wallet, Wifi, XCircle } from "lucide-react";
import type { LatePaymentMethod } from "@/lib/types";
import { DOOR_MESSAGES, doorCounts, LATE_METHODS, type DoorResult } from "@/lib/engine/door";
import { buildRoster, checkTarget, offlineDoorCheck, offlineSettleLate, queueItem, searchRoster, type DoorRoster, type DoorTarget, type OfflineCheckIn, type ReconcileResult } from "@/lib/engine/doorOffline";
import { activeEvent } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { getSupabase } from "@/lib/supabase/client";
import { fetchRoster, loadQueue, loadRoster, saveQueue, saveRoster, vaultAvailable } from "@/lib/offline/doorVault";
import { cn, formatMoney, formatTime } from "@/lib/utils";
import { AdminHeader } from "@/components/admin/AdminChrome";
import { QrScanner } from "@/components/scan/QrScanner";
import { MediaImage } from "@/components/media/MediaImage";
import { Button } from "@/components/ui/button";
import { useKiosk } from "@/components/ops/Kiosk";

const TERMINAL_KEY = "rouge:terminal";

/** Nombre de esta terminal (se ve en "Ya entró · Puerta 2"). Se guarda en el dispositivo. */
function useTerminalName() {
  const [name, setName] = useState("");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TERMINAL_KEY);
      const n = saved || `Puerta ${Math.floor(Math.random() * 90 + 10)}`;
      if (!saved) localStorage.setItem(TERMINAL_KEY, n);
      setName(n);
    } catch {
      setName("Puerta");
    }
  }, []);
  const update = (n: string) => {
    setName(n);
    try {
      localStorage.setItem(TERMINAL_KEY, n);
    } catch {
      /* noop */
    }
  };
  return [name, update] as const;
}

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const up = () => setOnline(navigator.onLine);
    up();
    window.addEventListener("online", up);
    window.addEventListener("offline", up);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", up);
    };
  }, []);
  return online;
}

/**
 * Puerta: escanea la entrada (QR del código de 1 uso), el pase dinámico de la app (TOTP) o busca a mano por nombre,
 * DNI o email. Responde al instante con foto, nombre y edad. Atómico: si otra terminal ya lo hizo entrar, alerta roja
 * con la hora y la terminal. Listas free fuera de horario: muestra el diferencial y cobra en el acto. Sin conexión:
 * valida contra el padrón cifrado del dispositivo y reconcilia al volver la red.
 */
export function DoorScanner({ variant = "admin" }: { variant?: "admin" | "ops" }) {
  const { state, exec, mode, demoVisible, notify } = useRouge();
  const kiosk = useKiosk();
  const ops = variant === "ops";
  const event = activeEvent(state)!;
  const [camera, setCamera] = useState(true);
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<DoorResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [terminal, setTerminal] = useTerminalName();
  const netOnline = useOnline();
  const [simOffline, setSimOffline] = useState(false);
  const online = netOnline && !simOffline;
  const [roster, setRoster] = useState<DoorRoster | null>(null);
  const [queue, setQueue] = useState<OfflineCheckIn[]>([]);
  const [recon, setRecon] = useState<ReconcileResult | null>(null);
  const [query, setQuery] = useState("");
  const counts = doorCounts(state, event.id);

  // ── Padrón cifrado: se baja con conexión (cada 2 min) y se usa sin conexión ──
  const refreshRoster = useCallback(async () => {
    try {
      const sb = getSupabase();
      const r = mode === "supabase" && sb ? await fetchRoster(sb, event.id) : buildRoster(state, event.id);
      setRoster(r);
      if (vaultAvailable()) await saveRoster(r);
    } catch {
      /* sin red: queda el último padrón guardado */
    }
  }, [mode, state, event.id]);
  useEffect(() => {
    if (!vaultAvailable()) return;
    void loadRoster(event.id).then((r) => r && setRoster((cur) => cur ?? r));
    void loadQueue(event.id).then(setQueue);
  }, [event.id]);
  useEffect(() => {
    if (!online) return;
    void refreshRoster();
    const t = setInterval(() => void refreshRoster(), 120_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, event.id]);

  const persistQueue = (q: OfflineCheckIn[]) => {
    setQueue(q);
    if (vaultAvailable()) void saveQueue(event.id, q);
  };
  const persistRoster = (r: DoorRoster) => {
    setRoster(r);
    if (vaultAvailable()) void saveRoster(r);
  };

  // ── Reconciliación al volver la conexión ──
  const syncing = useRef(false);
  useEffect(() => {
    if (!online || !queue.length || syncing.current) return;
    syncing.current = true;
    void exec(C.doorReconcile(event.id, queue), { silent: true }).then((r) => {
      syncing.current = false;
      if (!r.ok) return;
      setRecon(r.data);
      persistQueue([]);
      void refreshRoster();
      notify({ tone: r.data.conflicts.length ? "rouge" : "squad", title: `Sincronizado: ${r.data.applied} ingresos sin conexión`, description: r.data.conflicts.length ? `${r.data.conflicts.length} entrada(s) ya habían sido usadas en otra terminal.` : "Todo coincide con el servidor." });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, queue.length]);

  const feedback = (r: DoorResult) => {
    setResult(r);
    navigator.vibrate?.(r.status === "ok" ? 80 : [60, 60, 60, 60, 60]);
    kiosk.audit(r.status === "ok" ? "door.check_in" : "door.rejected", `${r.kind ?? "code"}:${r.status}`);
  };

  const check = async (value: string) => {
    if (busy || !value.trim()) return;
    kiosk.touch();
    setRecon(null);
    if (!online) {
      if (!roster) return notify({ tone: "rouge", title: "Sin padrón en este dispositivo", description: "Conectate una vez para bajar el padrón cifrado." });
      const r = offlineDoorCheck(roster, value, Date.now(), terminal);
      if (r.result.status === "ok" && r.target) {
        persistRoster(r.roster);
        persistQueue([...queue, queueItem(roster, r.target, r.result.checked_in_at!, terminal)]);
      }
      return feedback(r.result);
    }
    setBusy(true);
    const r = await exec(C.doorCheckIn(event.id, value, terminal));
    setBusy(false);
    if (r.ok) {
      feedback(r.data);
    }
  };

  /** Ingreso manual desde la búsqueda (sin batería / sin QR). */
  const manualEntry = async (target: DoorTarget) => {
    if (!roster) return;
    kiosk.touch();
    const r = checkTarget(roster, target, Date.now(), terminal);
    if (r.result.status !== "ok" || !r.target) return feedback(r.result);
    const item = queueItem(roster, r.target, r.result.checked_in_at!, terminal);
    persistRoster(r.roster);
    if (!online) {
      persistQueue([...queue, item]);
      return feedback(r.result);
    }
    const rec = await exec(C.doorReconcile(event.id, [item]));
    if (!rec.ok) return;
    const conflict = rec.data.conflicts[0];
    feedback(conflict ? { ...r.result, status: "already", checked_in_at: conflict.checked_in_at, terminal: conflict.terminal } : r.result);
    setQuery("");
  };

  const settleLate = async (method: LatePaymentMethod) => {
    const late = result?.late;
    if (!late) return;
    kiosk.touch();
    if (!online) {
      if (!roster) return;
      const r = offlineSettleLate(roster, late.code_id, Date.now(), terminal);
      if (!r || !r.target) return;
      persistRoster(r.roster);
      persistQueue([...queue, queueItem(roster, r.target, r.result.checked_in_at ?? new Date().toISOString(), terminal, method)]);
      return feedback(r.result);
    }
    const r = await exec(C.doorSettleLate(event.id, late.code_id, method, terminal));
    if (r.ok) {
      feedback(r.data);
      notify({ tone: "vip", title: `Cobrado ${formatMoney(late.price)}`, description: `${LATE_METHODS.find((m) => m.id === method)?.label} · ${late.list}` });
    }
  };

  const results = useMemo(() => (roster && query.trim().length >= 2 ? searchRoster(roster, query) : []), [roster, query]);

  return (
    <main className={cn("mx-auto space-y-5 px-5", ops ? "max-w-5xl py-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0" : "max-w-xl py-6 lg:py-10")}>
      {ops ? (
        <div className="flex flex-wrap items-end justify-between gap-3 lg:col-span-2">
          <div>
            <h1 className="text-4xl text-white">Puerta</h1>
            <p className="font-display text-xl text-white/80">
              <span className="text-squad">{counts.inside}</span> adentro · cupo {counts.capacity}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <NetBadge online={online} queued={queue.length} rosterAt={roster?.built_at ?? null} />
            <button type="button" onClick={() => setCamera((c) => !c)} className="inline-flex min-h-[56px] items-center gap-2 rounded-2xl bg-white px-5 font-display text-lg font-bold text-black">
              {camera ? <CameraOff className="size-6" /> : <Camera className="size-6" />} {camera ? "Apagar cámara" : "Cámara"}
            </button>
          </div>
        </div>
      ) : (
        <AdminHeader
          title="Puerta"
          subtitle={`${counts.inside} adentro · cupo ${counts.capacity}`}
          actions={
            <>
              <NetBadge online={online} queued={queue.length} rosterAt={roster?.built_at ?? null} />
              <Button variant="glass" onClick={() => setCamera((c) => !c)}>
                {camera ? <CameraOff /> : <Camera />} {camera ? "Apagar cámara" : "Usar cámara"}
              </Button>
            </>
          }
        />
      )}
      <div className="space-y-5">
        {camera && <QrScanner onResult={check} />}

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void check(manual).then(() => setManual(""));
          }}
        >
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Código de la entrada</span>
            <Keyboard className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input value={manual} onChange={(e) => setManual(e.target.value.toUpperCase())} placeholder="Código de la entrada" className={cn("w-full rounded-2xl border pl-9 pr-3 font-display tracking-wider focus:outline-none", ops ? "min-h-[60px] border-white/40 bg-black text-xl text-white focus:border-white" : "min-h-touch border-white/10 bg-white/[0.04] focus:border-squad/50")} />
          </label>
          <Button type="submit" variant="squad" size={ops ? "lg" : undefined} disabled={!manual.trim() || busy}>
            Validar
          </Button>
        </form>

        {/* Búsqueda manual (sin batería): nombre, DNI, email, @usuario o código */}
        <section aria-label="Búsqueda manual" className={cn("rounded-3xl border p-3", ops ? "border-white/25" : "border-white/10 bg-white/[0.02]")}>
          <label className="relative block">
            <span className="sr-only">Buscar por nombre, DNI o email</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="¿Sin batería? Buscá por nombre, DNI o email" className={cn("w-full rounded-2xl border pl-9 pr-3 focus:outline-none", ops ? "min-h-[56px] border-white/30 bg-black text-lg text-white" : "min-h-touch border-white/10 bg-white/[0.04]")} />
          </label>
          {results.length > 0 && (
            <ul className="mt-2 space-y-1">
              {results.map((r, i) => (
                <li key={i} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-white/5">
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate font-semibold", ops && "text-lg text-white")}>{r.title}</p>
                    <p className="truncate text-xs text-muted">{r.detail}{r.checked_in_at ? ` · entró ${formatTime(r.checked_in_at)}` : ""}</p>
                  </div>
                  <Button size="sm" variant={r.checked_in_at ? "ghost" : "squad"} disabled={!!r.checked_in_at} onClick={() => void manualEntry(r.target)}>
                    {r.checked_in_at ? "Ya entró" : "Dar ingreso"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {!roster && <p className="mt-2 text-xs text-muted">Bajando el padrón cifrado…</p>}
        </section>

        <div className={cn("flex flex-wrap items-center gap-3 text-xs", ops ? "text-white/60" : "text-muted")}>
          <label className="flex items-center gap-2">
            <MonitorSmartphone className="size-4" /> Terminal
            <input value={terminal} onChange={(e) => setTerminal(e.target.value.slice(0, 40))} aria-label="Nombre de esta terminal" className={cn("w-32 rounded-lg border px-2 py-1", ops ? "border-white/30 bg-black text-white" : "border-white/10 bg-white/[0.04]")} />
          </label>
          {mode === "demo" && demoVisible && (
            <button type="button" onClick={() => setSimOffline((v) => !v)} className={cn("inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 font-semibold", simOffline ? "bg-sos text-white" : "bg-white/10")}>
              <CloudOff className="size-3.5" /> {simOffline ? "Volver a conectar" : "Simular sin conexión"}
            </button>
          )}
          {online && (
            <button type="button" onClick={() => void refreshRoster()} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-white/10 px-3 font-semibold">
              <RefreshCw className="size-3.5" /> Actualizar padrón
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {result ? <DoorCard result={result} big={ops} onSettle={settleLate} /> : ops ? <p className="hidden rounded-3xl border-2 border-dashed border-white/25 p-10 text-center font-display text-2xl text-white/60 lg:block">Esperando escaneo…</p> : null}
        {recon && recon.conflicts.length > 0 && (
          <section role="alert" className="rounded-3xl border-2 border-sos bg-sos/10 p-4">
            <p className="flex items-center gap-2 font-display text-lg font-bold text-sos"><AlertTriangle className="size-5" /> Doble uso detectado al sincronizar</p>
            <ul className="mt-2 space-y-1 text-sm">
              {recon.conflicts.map((c, i) => (
                <li key={i}>
                  {c.name ?? (c.kind === "pass" ? "Pase de la app" : "Entrada")} — ya había entrado {c.checked_in_at ? `a las ${formatTime(c.checked_in_at)}` : ""}{c.terminal ? ` por ${c.terminal}` : ""}.
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <p className={cn("text-xs text-muted", ops && "text-sm text-white/60 lg:col-span-2")}>
        Sirve el QR de la entrada (código de 1 uso, el del mail o el impreso) y el pase EN VIVO de la app (cambia cada 20 s: una captura no sirve). El link general del evento no es una entrada.
      </p>
    </main>
  );
}

function NetBadge({ online, queued, rosterAt }: { online: boolean; queued: number; rosterAt: string | null }) {
  return (
    <span className={cn("inline-flex min-h-[40px] items-center gap-2 rounded-full px-3 font-display text-xs font-bold", online ? "bg-squad/15 text-squad" : "bg-sos text-white")} title={rosterAt ? `Padrón cifrado del ${formatTime(rosterAt)}` : "Sin padrón"} role="status">
      {online ? <Wifi className="size-4" /> : <CloudOff className="size-4" />}
      {online ? "En línea" : `SIN CONEXIÓN · padrón ${rosterAt ? formatTime(rosterAt) : "—"}`}
      {queued > 0 && <span className="rounded-full bg-white px-2 text-black">{queued} por sincronizar</span>}
    </span>
  );
}

function DoorCard({ result: r, big = false, onSettle }: { result: DoorResult; big?: boolean; onSettle: (m: LatePaymentMethod) => void }) {
  // Rojo: rechazos y doble uso ("Ya entró"). Dorado: hay que cobrar. Cian: adelante.
  const tone = r.status === "ok" ? "squad" : r.status === "late_free" ? "vip" : "sos";
  const Icon = r.status === "ok" ? CheckCircle2 : r.status === "already" ? Clock : r.status === "late_free" ? Wallet : r.status === "banned" ? ShieldAlert : XCircle;
  const minor = r.age != null && r.age < 18;
  return (
    <section
      role="status"
      aria-live="assertive"
      data-testid="door-result"
      data-status={r.status}
      className={cn(
        "rounded-3xl border-2 p-5",
        tone === "squad" && "border-squad bg-squad/10 shadow-glow-squad",
        tone === "vip" && "border-vip bg-vip/10 shadow-glow-vip",
        tone === "sos" && "border-sos bg-sos/15 shadow-glow-sos",
        r.status === "already" && "animate-pulse",
      )}
    >
      <div className="flex items-center gap-3">
        <Icon className={cn("size-10 shrink-0", tone === "squad" ? "text-squad" : tone === "vip" ? "text-vip" : "text-sos")} />
        <div className="min-w-0">
          <p className={cn("font-display font-bold", big ? "text-4xl" : "text-2xl")}>{DOOR_MESSAGES[r.status]}</p>
          <p className={cn("text-muted", big ? "text-lg" : "text-sm")}>
            {r.status === "already" && r.checked_in_at
              ? `Entró a las ${formatTime(r.checked_in_at)}${r.terminal ? ` · ${r.terminal}` : ""}`
              : r.status === "ok" && r.terminal
                ? `Registrado en ${r.terminal}`
                : r.kind === "pass"
                  ? "Pase de la app"
                  : r.kind === "code"
                    ? `Entrada${r.label ? ` ${r.label}` : ""}`
                    : ""}
          </p>
        </div>
      </div>
      {r.status === "late_free" && r.late && (
        <div className="mt-4 rounded-2xl bg-black/30 p-4">
          <p className={cn("font-display font-bold text-vip", big ? "text-3xl" : "text-2xl")}>Diferencial {formatMoney(r.late.price)}</p>
          <p className="text-sm text-muted">{r.late.list} · free hasta las {formatTime(r.late.free_until)}. Cobrá y dejá pasar:</p>
          <div className="mt-3 grid gap-2 xl:grid-cols-3">
            {LATE_METHODS.map((m) => (
              <Button key={m.id} variant="vip" size={big ? "lg" : undefined} onClick={() => onSettle(m.id)}>
                {m.emoji} {m.label}
              </Button>
            ))}
          </div>
        </div>
      )}
      {r.name && (
        <div className="mt-4 flex items-center gap-4 rounded-2xl bg-black/30 p-3">
          <div className="size-24 shrink-0 overflow-hidden rounded-2xl bg-surface-raised">{r.photo ? <MediaImage photo={{ url: r.photo }} alt={r.name} className="size-full" /> : null}</div>
          <div className="min-w-0">
            <p className="truncate font-display text-xl font-bold">{r.name}</p>
            {r.username && <p className="text-sm text-muted">@{r.username}</p>}
            {r.age != null && <p className={cn("mt-1 font-display text-lg font-bold", minor ? "text-sos" : "text-primary")}>{r.age} años{minor ? " · MENOR" : ""}</p>}
            <p className="mt-1 text-xs text-muted">Compará la foto con quien está entrando.</p>
          </div>
        </div>
      )}
    </section>
  );
}
