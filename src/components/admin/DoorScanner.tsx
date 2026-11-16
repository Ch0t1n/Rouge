"use client";

import * as C from "@/lib/store/commands";
import { useState } from "react";
import { Camera, CameraOff, CheckCircle2, Clock, Keyboard, ShieldAlert, XCircle } from "lucide-react";
import { DOOR_MESSAGES, doorCounts, type DoorResult } from "@/lib/engine/door";
import { activeEvent } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { cn, formatTime } from "@/lib/utils";
import { AdminHeader } from "@/components/admin/AdminChrome";
import { QrScanner } from "@/components/scan/QrScanner";
import { MediaImage } from "@/components/media/MediaImage";
import { Button } from "@/components/ui/button";

/**
 * Puerta: escanea la entrada (QR del código de 1 uso) o el pase de la app y responde al instante con foto, nombre y
 * edad para comparar con quien está entrando. Pensado para el celular del personal de seguridad, con una mano.
 */
export function DoorScanner() {
  const { state, exec } = useRouge();
  const event = activeEvent(state)!;
  const [camera, setCamera] = useState(true);
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<DoorResult | null>(null);
  const [busy, setBusy] = useState(false);
  const counts = doorCounts(state, event.id);

  const check = async (value: string) => {
    if (busy || !value.trim()) return;
    setBusy(true);
    const r = await exec(C.doorCheckIn(event.id, value));
    setBusy(false);
    if (r.ok) {
      setResult(r.data);
      navigator.vibrate?.(r.data.status === "ok" ? 80 : [60, 60, 60]);
    }
  };

  return (
    <main className="mx-auto max-w-xl space-y-5 px-5 py-6 lg:py-10">
      <AdminHeader
        title="Puerta"
        subtitle={`${counts.inside} adentro · cupo ${counts.capacity}`}
        actions={
          <Button variant="glass" onClick={() => setCamera((c) => !c)}>
            {camera ? <CameraOff /> : <Camera />} {camera ? "Apagar cámara" : "Usar cámara"}
          </Button>
        }
      />

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
          <input value={manual} onChange={(e) => setManual(e.target.value.toUpperCase())} placeholder="Código de la entrada" className="min-h-touch w-full rounded-2xl border border-white/10 bg-white/[0.04] pl-9 pr-3 font-display tracking-wider focus:border-squad/50 focus:outline-none" />
        </label>
        <Button type="submit" variant="squad" disabled={!manual.trim() || busy}>
          Validar
        </Button>
      </form>

      {result && <DoorCard result={result} />}

      <p className="text-xs text-muted">
        Sirve el QR de la entrada (código de 1 uso, el del mail o el impreso) y el pase de la app (Inicio → Mi entrada). El link general del evento no es una entrada.
      </p>
    </main>
  );
}

function DoorCard({ result: r }: { result: DoorResult }) {
  const tone = r.status === "ok" ? "squad" : r.status === "already" ? "vip" : "sos";
  const Icon = r.status === "ok" ? CheckCircle2 : r.status === "already" ? Clock : r.status === "banned" ? ShieldAlert : XCircle;
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
        tone === "sos" && "border-sos bg-sos/10 shadow-glow-sos",
      )}
    >
      <div className="flex items-center gap-3">
        <Icon className={cn("size-10 shrink-0", tone === "squad" ? "text-squad" : tone === "vip" ? "text-vip" : "text-sos")} />
        <div className="min-w-0">
          <p className="font-display text-2xl font-bold">{DOOR_MESSAGES[r.status]}</p>
          <p className="text-sm text-muted">
            {r.status === "already" && r.checked_in_at ? `Entró a las ${formatTime(r.checked_in_at)}` : r.kind === "pass" ? "Pase de la app" : r.kind === "code" ? `Entrada${r.label ? ` ${r.label}` : ""}` : ""}
          </p>
        </div>
      </div>
      {r.name && (
        <div className="mt-4 flex items-center gap-4 rounded-2xl bg-black/30 p-3">
          <div className="size-24 shrink-0 overflow-hidden rounded-2xl bg-surface-raised">
            {r.photo ? <MediaImage photo={{ url: r.photo }} alt={r.name} className="size-full" /> : null}
          </div>
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
