"use client";

import * as C from "@/lib/store/commands";
import { useEffect, useState } from "react";
import { Camera, CameraOff, CheckCircle2, Clock, DoorOpen, Keyboard, MapPinned, ShieldAlert, XCircle } from "lucide-react";
import type { UUID } from "@/lib/types";
import { DOOR_MESSAGES, doorCounts, recentZoneCheckIns, requiredTiersLabel, scannerZones, type DoorResult, type ScannerZone } from "@/lib/engine/door";
import { activeEvent } from "@/lib/engine/selectors";
import { faceOf, tierLabel, verticalOf } from "@/lib/engine/verticals";
import { useRouge } from "@/lib/store/RougeContext";
import { cn, formatTime } from "@/lib/utils";
import { AdminHeader } from "@/components/admin/AdminChrome";
import { QrScanner } from "@/components/scan/QrScanner";
import { MediaImage } from "@/components/media/MediaImage";
import { Button } from "@/components/ui/button";
import { ZonesPanel } from "./ZonesPanel";

const MAIN = "main";
const zoneKey = (z: Pick<ScannerZone, "id">) => z.id ?? MAIN;
const storageKey = (eventId: UUID) => `rouge:door-zone:${eventId}`;
const readZone = (eventId: UUID) => {
  try {
    return localStorage.getItem(storageKey(eventId));
  } catch {
    return null;
  }
};

/**
 * Puerta y zonas de control: el personal elige primero la ZONA DE CONTROL ACTIVA (puerta principal, Sala VIP,
 * Auditorio A…), escanea la entrada o el pase y ve al instante si pasa: verde con nombre, empresa y categoría, o rojo
 * con el motivo ("Requiere VIP / SPEAKER"). Toda lectura queda en el registro (zone_check_ins).
 * Sin zonas cargadas hay una sola opción —la puerta principal— y funciona como siempre.
 */
export function DoorScanner() {
  const { state, exec, can } = useRouge();
  const event = activeEvent(state)!;
  const v = verticalOf(state, event.id);
  const zones = scannerZones(state, event.id);
  const [chosen, setChosen] = useState<string | null>(null);
  const [camera, setCamera] = useState(true);
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<DoorResult | null>(null);
  const [busy, setBusy] = useState(false);
  const counts = doorCounts(state, event.id);

  // Zona recordada por dispositivo (cada puerta suele quedar fija en un celular). Con una sola opción, va sola.
  useEffect(() => {
    setChosen(readZone(event.id));
    setResult(null);
  }, [event.id]);
  const zone = zones.length === 1 ? zones[0] : zones.find((z) => zoneKey(z) === chosen);
  const pick = (z: ScannerZone) => {
    setChosen(zoneKey(z));
    setResult(null);
    try {
      localStorage.setItem(storageKey(event.id), zoneKey(z));
    } catch {
      /* sin almacenamiento: se vuelve a elegir */
    }
  };

  const check = async (value: string) => {
    if (busy || !value.trim() || !zone) return;
    setBusy(true);
    const r = await exec(zone.id ? C.zoneCheckIn(event.id, zone.id, value) : C.doorCheckIn(event.id, value));
    setBusy(false);
    if (r.ok) {
      setResult(r.data);
      navigator.vibrate?.(r.data.status === "ok" ? 80 : [60, 60, 60]);
    }
  };

  const log = recentZoneCheckIns(state, event.id, 12);
  const zoneName = (id: UUID | null) => (id ? (state.event_zones.find((z) => z.id === id)?.name ?? "Zona eliminada") : "Puerta principal");

  return (
    <main className="mx-auto max-w-xl space-y-5 px-5 py-6 lg:py-10">
      <AdminHeader
        title={zones.length > 1 ? "Puerta y zonas" : "Puerta"}
        subtitle={`${counts.inside} adentro · cupo ${counts.capacity}`}
        actions={
          zone && (
            <Button variant="glass" onClick={() => setCamera((c) => !c)}>
              {camera ? <CameraOff /> : <Camera />} {camera ? "Apagar cámara" : "Usar cámara"}
            </Button>
          )
        }
      />

      {/* Zona de control activa (obligatoria). Con una sola opción (sin zonas cargadas) queda elegida y discreta. */}
      {zones.length > 1 && (
        <section className="space-y-2" aria-labelledby="zone-title">
          <h2 id="zone-title" className="flex items-center gap-2 font-display text-sm font-semibold text-primary">
            <MapPinned className="size-4 text-vip" /> Zona de control activa
          </h2>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Zona de control activa">
            {zones.map((z) => {
              const on = zone ? zoneKey(zone) === zoneKey(z) : false;
              return (
                <button
                  key={zoneKey(z)}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pick(z)}
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

      {zone && (
        <>
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
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value.toUpperCase())}
                placeholder="Código de la entrada"
                className="min-h-touch w-full rounded-2xl border border-white/10 bg-white/[0.04] pl-9 pr-3 font-display tracking-wider focus:border-squad/50 focus:outline-none"
              />
            </label>
            <Button type="submit" variant="squad" disabled={!manual.trim() || busy}>
              Validar
            </Button>
          </form>

          {result && <DoorCard result={result} corporate={v.kind === "corporate"} />}

          <p className="text-xs text-muted">
            Sirve el QR de la entrada (código de 1 uso, el del mail o el impreso) y el pase de la app (Inicio → Mi entrada). El link general del evento y la tarjeta personal (vCard) no son entradas.
          </p>
        </>
      )}

      {log.length > 0 && (
        <section className="glass rounded-3xl p-4" aria-label="Últimas lecturas">
          <h2 className="mb-2 text-base">Últimas lecturas</h2>
          <ul className="divide-y divide-white/5 text-sm" data-testid="zone-log">
            {log.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <span className="w-12 shrink-0 font-display text-xs tabular-nums text-muted">{formatTime(c.created_at)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{c.user_id ? (faceOf(state, c.user_id, event.id)?.full_name ?? "—") : "Entrada sin app"}</span>
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
      )}

      {can("admin.events") && <ZonesPanel eventId={event.id} />}
    </main>
  );
}

function DoorCard({ result: r, corporate }: { result: DoorResult; corporate: boolean }) {
  const tone = r.status === "ok" ? "ok" : r.status === "already" ? "vip" : "sos";
  const Icon = r.status === "ok" ? CheckCircle2 : r.status === "already" ? Clock : r.status === "banned" ? ShieldAlert : XCircle;
  const minor = r.age != null && r.age < 18;
  const title = r.status === "ok" && r.zone_kind === "area" ? "Acceso permitido" : DOOR_MESSAGES[r.status];
  const detail =
    r.status === "zone_denied"
      ? `${r.zone_name ?? "Esta zona"} · ${requiredTiersLabel(r.allowed_tiers ?? [])}`
      : r.status === "already" && r.checked_in_at
        ? `Entró a las ${formatTime(r.checked_in_at)}`
        : r.kind === "vcard"
          ? (r.label ?? "")
          : [r.zone_name, r.kind === "pass" ? "Pase de la app" : r.kind === "code" ? `Entrada${r.label ? ` ${r.label}` : ""}` : ""].filter(Boolean).join(" · ");
  return (
    <section
      role="status"
      aria-live="assertive"
      data-testid="door-result"
      data-status={r.status}
      className={cn(
        "rounded-3xl border-2 p-5",
        // Verde = pasa (corporativo: esmeralda ejecutivo; noche: cian de siempre). Ámbar = ya entró. Rojo = no pasa.
        tone === "ok" && (corporate ? "border-pro-emerald bg-pro-emerald/15" : "border-squad bg-squad/10 shadow-glow-squad"),
        tone === "vip" && "border-vip bg-vip/10 shadow-glow-vip",
        tone === "sos" && "border-sos bg-sos/10 shadow-glow-sos",
      )}
    >
      <div className="flex items-center gap-3">
        <Icon className={cn("size-10 shrink-0", tone === "ok" ? (corporate ? "text-pro-emerald" : "text-squad") : tone === "vip" ? "text-vip" : "text-sos")} />
        <div className="min-w-0">
          <p className="font-display text-2xl font-bold">{title}</p>
          <p className="text-sm text-muted">{detail}</p>
        </div>
      </div>
      {(r.name || (r.tier && r.tier !== "attendee")) && (
        <div className="mt-4 flex items-center gap-4 rounded-2xl bg-black/30 p-3">
          <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-surface-raised font-display text-3xl font-bold text-muted">
            {r.photo ? <MediaImage photo={{ url: r.photo }} alt={r.name ?? ""} className="size-full" /> : (r.name?.slice(0, 1) ?? "?")}
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-xl font-bold">{r.name ?? "Entrada sin app"}</p>
            {r.company || r.job_title ? (
              <p className="truncate text-sm text-primary/85">{[r.job_title, r.company].filter(Boolean).join(" · ")}</p>
            ) : r.username ? (
              <p className="text-sm text-muted">@{r.username}</p>
            ) : null}
            {r.tier && (
              <span
                className={cn(
                  "mt-1.5 inline-block rounded-full border px-2.5 py-0.5 font-display text-xs font-bold tracking-wider",
                  r.tier === "attendee" ? "border-white/20 text-muted" : "border-vip/60 bg-vip/15 text-vip",
                )}
                data-testid="door-tier"
              >
                {tierLabel(r.tier)}
              </span>
            )}
            {r.age != null && (
              <p className={cn("mt-1 font-display text-lg font-bold", minor ? "text-sos" : "text-primary")}>
                {r.age} años{minor ? " · MENOR" : ""}
              </p>
            )}
            {r.photo && <p className="mt-1 text-xs text-muted">Compará la foto con quien está entrando.</p>}
          </div>
        </div>
      )}
    </section>
  );
}
