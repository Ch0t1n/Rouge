"use client";

import * as C from "@/lib/store/commands";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, CameraOff, CheckCircle2, Clock, CloudOff, DoorOpen, Keyboard, MapPinned, MonitorSmartphone, RefreshCw, Search, ShieldAlert, Wallet, Wifi, XCircle } from "lucide-react";
import type { LatePaymentMethod, UUID } from "@/lib/types";
import { DOOR_MESSAGES, doorCounts, LATE_METHODS, recentZoneCheckIns, requiredTiersLabel, scannerZones, type DoorResult, type ScannerZone } from "@/lib/engine/door";
import { faceOf, tierLabel, verticalOf } from "@/lib/engine/verticals";
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
import { ZonesPanel } from "./ZonesPanel";

// [v1.10] Zona de control activa, recordada por dispositivo y evento (cada puerta suele quedar fija en un celular).
const MAIN = "main";
const zoneKey = (z: Pick<ScannerZone, "id">) => z.id ?? MAIN;
const zoneStorageKey = (eventId: UUID) => `rouge:door-zone:${eventId}`;
const readZone = (eventId: UUID) => {
  try {
    return localStorage.getItem(zoneStorageKey(eventId));
  } catch {
    return null;
  }
};

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
 * Zonas (v1.10): con zonas cargadas, el personal elige primero la ZONA DE CONTROL ACTIVA (puerta, Sala VIP, Auditorio A)
 * y ve verde (con nombre, empresa y categoría) o rojo con el motivo ("Requiere VIP / SPEAKER"); cada lectura queda en el
 * registro (zone_check_ins). Sin zonas hay una sola opción —la puerta principal— y funciona como siempre. Las áreas
 * necesitan conexión (el padrón sin conexión es solo para la puerta).
 */
export function DoorScanner({ variant = "admin" }: { variant?: "admin" | "ops" }) {
  const { state, exec, mode, demoVisible, notify, can } = useRouge();
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
  const corporate = verticalOf(state, event.id).kind === "corporate";
  const zones = scannerZones(state, event.id);
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => {
    setChosen(readZone(event.id));
    setResult(null);
  }, [event.id]);
  // Con una sola opción (sin zonas cargadas) queda elegida sola.
  const zone = zones.length === 1 ? zones[0] : zones.find((z) => zoneKey(z) === chosen);
  const pickZone = (z: ScannerZone) => {
    setChosen(zoneKey(z));
    setResult(null);
    try {
      localStorage.setItem(zoneStorageKey(event.id), zoneKey(z));
    } catch {
      /* sin almacenamiento: se vuelve a elegir */
    }
  };

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
    if (busy || !value.trim() || !zone) return;
    kiosk.touch();
    setRecon(null);
    if (!online && zone.id) return notify({ tone: "rouge", title: "Sin conexión", description: "Las zonas de control necesitan conexión. La puerta principal sigue funcionando con el padrón." });
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
    // Con zonas: zone_check_in (valida la categoría y registra la lectura); sin zonas, la puerta de siempre.
    const r = await exec(zones.length > 1 || zone.id ? C.zoneCheckIn(event.id, zone.id, value, terminal) : C.doorCheckIn(event.id, value, terminal));
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
      {/* Zona de control activa (obligatoria con zonas cargadas). */}
      {zones.length > 1 && (
        <section className={cn("space-y-2", ops && "lg:col-span-2")} aria-labelledby="zone-title">
          <h2 id="zone-title" className={cn("flex items-center gap-2 font-display text-sm font-semibold", ops ? "text-white" : "text-primary")}>
            <MapPinned className="size-4 text-vip" /> Zona de control activa
          </h2>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3" role="radiogroup" aria-label="Zona de control activa">
            {zones.map((z) => {
              const on = zone ? zoneKey(zone) === zoneKey(z) : false;
              return (
                <button
                  key={zoneKey(z)}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pickZone(z)}
                  className={cn("min-h-touch rounded-2xl border px-3 py-2 text-left transition", on ? "border-vip bg-vip/15 shadow-glow-vip" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]")}
                  data-testid="zone-option"
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {z.kind === "entrance" ? <DoorOpen className="size-4 shrink-0 text-muted" /> : null}
                    <span className="truncate">{z.name}</span>
                  </span>
                  <span className="block text-[11px] leading-snug text-muted">{z.kind === "entrance" ? "Acredita el ingreso" : requiredTiersLabel(z.allowed_tiers)}</span>
                </button>
              );
            })}
          </div>
          {!zone && <p className="rounded-2xl border border-vip/40 bg-vip/10 px-4 py-3 text-sm">Elegí en qué zona estás controlando para empezar a escanear.</p>}
        </section>
      )}
      <div className={cn("space-y-5", !zone && "pointer-events-none opacity-40")} aria-disabled={!zone}>
        {camera && zone && <QrScanner onResult={check} />}

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
        {result ? <DoorCard result={result} big={ops} corporate={corporate} onSettle={settleLate} /> : ops ? <p className="hidden rounded-3xl border-2 border-dashed border-white/25 p-10 text-center font-display text-2xl text-white/60 lg:block">Esperando escaneo…</p> : null}
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
        Sirve el QR de la entrada (código de 1 uso, el del mail o el impreso) y el pase EN VIVO de la app (cambia cada 20 s: una captura no sirve). El link general del evento y la tarjeta personal (vCard) no son entradas.
      </p>

      {zones.length > 1 && <ZoneLog eventId={event.id} className={cn(ops && "lg:col-span-2")} />}
      {!ops && can("admin.events") && <ZonesPanel eventId={event.id} />}
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

/** Últimas lecturas por zona (registro zone_check_ins). */
function ZoneLog({ eventId, className }: { eventId: UUID; className?: string }) {
  const { state } = useRouge();
  const log = recentZoneCheckIns(state, eventId, 12);
  if (!log.length) return null;
  const zoneName = (id: UUID | null) => (id ? (state.event_zones.find((z) => z.id === id)?.name ?? "Zona eliminada") : "Puerta principal");
  return (
    <section className={cn("glass rounded-3xl p-4", className)} aria-label="Últimas lecturas">
      <h2 className="mb-2 text-base">Últimas lecturas</h2>
      <ul className="divide-y divide-white/5 text-sm" data-testid="zone-log">
        {log.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-2">
            <span className="w-12 shrink-0 font-display text-xs tabular-nums text-muted">{formatTime(c.created_at)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{c.user_id ? (faceOf(state, c.user_id, eventId)?.full_name ?? "—") : "Entrada sin app"}</span>
              <span className="block truncate text-[11px] text-muted">
                {zoneName(c.zone_id)}
                {c.tier ? ` · ${tierLabel(c.tier)}` : ""}
              </span>
            </span>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", c.status === "granted" ? "bg-squad/15 text-squad" : "bg-sos/15 text-sos")}>
              {c.status === "granted" ? "Pasó" : (DOOR_MESSAGES[c.reason as DoorResult["status"]] ?? "Rechazado")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DoorCard({ result: r, big = false, corporate = false, onSettle }: { result: DoorResult; big?: boolean; corporate?: boolean; onSettle: (m: LatePaymentMethod) => void }) {
  // Rojo: rechazos y doble uso ("Ya entró"). Dorado: hay que cobrar. Cian (corporativo: esmeralda): adelante.
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
        tone === "squad" && (corporate ? "border-pro-emerald bg-pro-emerald/15" : "border-squad bg-squad/10 shadow-glow-squad"),
        tone === "vip" && "border-vip bg-vip/10 shadow-glow-vip",
        tone === "sos" && "border-sos bg-sos/15 shadow-glow-sos",
        r.status === "already" && "animate-pulse",
      )}
    >
      <div className="flex items-center gap-3">
        <Icon className={cn("size-10 shrink-0", tone === "squad" ? (corporate ? "text-pro-emerald" : "text-squad") : tone === "vip" ? "text-vip" : "text-sos")} />
        <div className="min-w-0">
          <p className={cn("font-display font-bold", big ? "text-4xl" : "text-2xl")}>{r.status === "ok" && r.zone_kind === "area" ? "Acceso permitido" : DOOR_MESSAGES[r.status]}</p>
          <p className={cn("text-muted", big ? "text-lg" : "text-sm")}>
            {r.status === "zone_denied"
              ? `${r.zone_name ?? "Esta zona"} · ${requiredTiersLabel(r.allowed_tiers ?? [])}`
              : r.kind === "vcard"
                ? (r.label ?? "")
                : r.zone_kind === "area" && r.zone_name
                  ? `${r.zone_name}${r.kind === "pass" ? " · Pase de la app" : ""}`
                  : r.status === "already" && r.checked_in_at
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
            {r.company || r.job_title ? (
              <p className="truncate text-sm text-primary/85">{[r.job_title, r.company].filter(Boolean).join(" · ")}</p>
            ) : r.username ? (
              <p className="text-sm text-muted">@{r.username}</p>
            ) : null}
            {r.tier && (corporate || r.tier !== "attendee") && (
              <span className={cn("mt-1.5 inline-block rounded-full border px-2.5 py-0.5 font-display text-xs font-bold tracking-wider", r.tier === "attendee" ? "border-white/20 text-muted" : "border-vip/60 bg-vip/15 text-vip")} data-testid="door-tier">
                {tierLabel(r.tier)}
              </span>
            )}
            {r.age != null && <p className={cn("mt-1 font-display text-lg font-bold", minor ? "text-sos" : "text-primary")}>{r.age} años{minor ? " · MENOR" : ""}</p>}
            <p className="mt-1 text-xs text-muted">Compará la foto con quien está entrando.</p>
          </div>
        </div>
      )}
    </section>
  );
}
