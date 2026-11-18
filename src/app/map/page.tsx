"use client";

import * as C from "@/lib/store/commands";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock3, Flag, MapPin, MessageCircle, RefreshCw, Siren, Trash2 } from "lucide-react";
import type { UUID, VenueSector } from "@/lib/types";
import { dropPin, removePin, setSquadBasePin, triggerRescue } from "@/lib/engine/actions";
import { activeEvent, activePinOf, connectionBetween, getAttendee, isLobbyInteractive, matchesOf, sectorAt, squadOf, visiblePins, type VisiblePin } from "@/lib/engine/selectors";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { useRequireProfile } from "@/lib/store/hooks";
import { cn } from "@/lib/utils";
import { VenueMap } from "@/components/venue/VenueMap";
import { Avatar } from "@/components/ui/avatar";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { privacyOf, profileHref } from "@/lib/engine/privacy";
import { displayStatus, meetingPlace, meetingPoint, meetingsOf, otherOf } from "@/lib/engine/meetings";
import { faceOf, hasFeature } from "@/lib/engine/verticals";
import type { MapMark } from "@/components/venue/VenueMap";
import { formatTime } from "@/lib/utils";

export default function MapPage() {
  const me = useRequireProfile();
  if (!me) return null;
  return (
    <Suspense>
      <LiveMap />
    </Suspense>
  );
}

type Mode = "pin" | "base" | "rescue";

function LiveMap() {
  const { state, exec, notify } = useRouge();
  const router = useRouter();
  const params = useSearchParams();
  const now = useNow(10_000);
  const event = activeEvent(state)!;
  const meId = state.current_user_id;
  const attendee = getAttendee(state, event.id, meId);
  const mine = squadOf(state, event.id, meId);
  const myPin = activePinOf(state, event.id, meId, now);
  const pins = useMemo(() => visiblePins(state, event.id, meId, now), [state, event.id, meId, now]);
  const matches = useMemo(() => matchesOf(state, meId, event.id), [state, meId, event.id]);
  // Reuniones aceptadas (y pendientes) con lugar en el plano: solo las mías. ?meeting=<id> la resalta.
  const focusMeeting = params.get("meeting");
  const meetingMarks: MapMark[] = meetingsOf(state, meId, event.id)
    .filter((m) => ["accepted", "pending", "rescheduled"].includes(displayStatus(m, now)))
    .flatMap((m) => {
      const pt = meetingPoint(state, m);
      if (!pt) return [];
      const other = faceOf(state, otherOf(m, meId), event.id);
      return [{
        key: `meeting-${m.id}`,
        x: pt.x,
        y: pt.y,
        icon: "📅",
        tone: m.status === "accepted" ? ("squad" as const) : ("muted" as const),
        label: `${formatTime(m.starts_at)} · ${other?.full_name.split(" ")[0] ?? ""} · ${meetingPlace(state, m)}`,
        emphasis: m.id === focusMeeting,
        onClick: () => router.push(`/meetings#${m.id}`),
      }];
    });
  // Privacidad: si elegí "solo mi Squad", el pin nunca se comparte con matches.
  const squadOnly = !privacyOf(state, meId).pin_share_matches;

  // Corporativo: sin Botón de Rescate (feature "rescue").
  const rescueOn = hasFeature(state, state.active_event_id, "rescue");
  const initialMode: Mode = params.get("mode") === "base" && mine ? "base" : params.get("rescue") && rescueOn ? "rescue" : "pin";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [draft, setDraft] = useState<{ x: number; y: number; sector?: VenueSector } | null>(null);
  const [shareSquad, setShareSquad] = useState(true);
  const [shareMatches, setShareMatches] = useState(false);
  const [selected, setSelected] = useState<UUID[]>([]);
  const [note, setNote] = useState("");
  const [baseLabel, setBaseLabel] = useState(mine?.squad.base_pin_label ?? "");
  const [inspect, setInspect] = useState<VisiblePin | null>(null);

  // ?focus=<userId>: abrir directamente el pin de esa persona (ej. alerta de rescate)
  const focus = params.get("focus");
  useEffect(() => {
    if (!focus) return;
    const target = pins.find((p) => p.pin.user_id === focus);
    if (target) setInspect(target);
    // solo al entrar
  }, [focus]);

  if (!attendee || !isLobbyInteractive(event, now)) {
    return (
      <main className="safe-top flex min-h-[80dvh] flex-col items-center justify-center gap-3 px-8 text-center">
        <MapPin className="size-10 text-muted" />
        <h1 className="text-2xl">{attendee ? "El plano se apagó 🌙" : "Entrá al lobby para ver el plano"}</h1>
        <p className="text-sm text-muted">{attendee ? "El lobby cerró. Tus matches y chats siguen abiertos." : "Usá el link o el código de tu entrada."}</p>
        <Link href={attendee ? "/inbox" : `/join/${event.slug}`} className={buttonVariants({ size: "lg" })}>
          {attendee ? "Ir a mis matches" : "Entrar al lobby"}
        </Link>
      </main>
    );
  }

  const audienceOk = (shareSquad && !!mine) || (shareMatches && selected.length > 0);

  const confirmPin = async () => {
    if (!draft) return;
    const r = await exec(C.dropPin(event.id, meId, { x: draft.x, y: draft.y, shareWithSquad: shareSquad && !!mine, matchIds: shareMatches && !squadOnly ? selected : [], note }));
    if (!r.ok) return;
    setDraft(null);
    setNote("");
    const who = [r.data.share_with_squad && "tu Squad", r.data.shared_match_ids.length && `${r.data.shared_match_ids.length} match(es)`].filter(Boolean).join(" y ");
    notify({ tone: r.data.share_with_squad ? "squad" : "rouge", title: `📍 Pin en ${r.data.sector_name ?? "el plano"}`, description: `Lo ve ${who} durante 15 min.` });
  };

  const onTap = async (x: number, y: number, sector?: VenueSector) => {
    if (mode === "rescue") {
      const r = await exec(C.triggerRescue(event.id, meId, { x, y }));
      if (r.ok) {
        notify({ tone: "rouge", title: `🚨 Rescate en ${r.data.sector_name ?? "tu ubicación"}`, description: "Tu Squad recibió la alerta y tu pin rojo." });
        setMode("pin");
      }
      return;
    }
    setDraft({ x, y, sector });
  };

  const renew = async () => {
    if (!myPin) return;
    const r = await exec(C.dropPin(event.id, meId, { x: myPin.coord_x, y: myPin.coord_y, shareWithSquad: myPin.share_with_squad, matchIds: myPin.shared_match_ids, note: myPin.note ?? undefined }));
    if (r.ok) notify({ tone: "squad", title: "⏱️ Pin renovado por 15 min", duration: 1800 });
  };

  const myPinLeft = myPin ? Math.max(0, Math.ceil((+new Date(myPin.expires_at) - now) / 60_000)) : 0;
  const sharedNames = myPin
    ? [myPin.share_with_squad && "Squad", ...myPin.shared_match_ids.map((id) => matches.find((m) => m.profile.id === id)?.profile.full_name.split(" ")[0])].filter(Boolean).join(" · ")
    : "";

  return (
    <main className="safe-top">
      <header className="sticky top-0 z-30 bg-background/85 px-4 pb-3 pt-4 backdrop-blur-xl">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{event.venue_name}</p>
            <h1 className="text-2xl">Plano en vivo</h1>
          </div>
          <div className="flex gap-3 pb-1 text-[11px] font-semibold text-muted">
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-squad" /> Squad</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-rouge" /> Match</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-vip" /> Base</span>
          </div>
        </div>
      </header>

      <div className="space-y-3 px-4 pb-8">
        {/* Modo */}
        {mode !== "pin" ? (
          <div className={cn("flex items-center gap-3 rounded-2xl border p-3 text-sm", mode === "rescue" ? "border-sos bg-sos/15 text-sos shadow-glow-sos" : "border-vip/50 bg-vip/10 text-vip")}>
            {mode === "rescue" ? <Siren className="size-5 shrink-0" /> : <Flag className="size-5 shrink-0" />}
            <p className="flex-1 font-semibold">{mode === "rescue" ? "Tocá dónde estás: le mandamos tu pin rojo al Squad." : "Tocá el plano para fijar el Punto Base del Squad."}</p>
            <Button size="sm" variant="ghost" onClick={() => setMode("pin")}>
              Cancelar
            </Button>
          </div>
        ) : myPin ? (
          <div className={cn("flex items-center gap-3 rounded-2xl border p-3", myPin.is_rescue_alert ? "border-sos bg-sos/10" : "border-white/10 bg-white/[0.04]")}>
            <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", myPin.is_rescue_alert ? "bg-sos text-white" : "bg-squad/15 text-squad")}>
              {myPin.is_rescue_alert ? <Siren className="size-5" /> : <MapPin className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{myPin.is_rescue_alert ? "🚨 " : ""}{myPin.sector_name ?? "Tu pin"}</p>
              <p className="truncate text-xs text-muted">
                <span className="metric text-squad">Expira en {myPinLeft} min</span> · Lo ve: {sharedNames || "nadie"}
              </p>
            </div>
            <button type="button" onClick={renew} aria-label="Renovar 15 min" className="grid size-11 place-items-center rounded-full bg-white/[0.06]">
              <RefreshCw className="size-4" />
            </button>
            <button type="button" onClick={() => void exec(C.removePin(myPin.id, meId, event.id))} aria-label="Quitar mi pin" className="grid size-11 place-items-center rounded-full bg-white/[0.06] text-muted hover:text-rouge">
              <Trash2 className="size-4" />
            </button>
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-2xl border border-dashed border-white/15 p-3 text-sm text-muted">
            <Clock3 className="size-4 shrink-0" /> Tocá el plano y marcá "Estoy acá". Tu pin dura 15 min y vos elegís quién lo ve.
          </p>
        )}

        <VenueMap
          layout={event.venue_layout_json}
          mapImageUrl={event.venue_map_url}
          pins={pins}
          draft={draft}
          highlightSector={draft?.sector?.name}
          basePin={mine?.squad.base_pin_x != null ? { x: mine.squad.base_pin_x, y: mine.squad.base_pin_y!, label: mine.squad.base_pin_label ?? "Punto Base" } : null}
          onTap={onTap}
          onPinClick={setInspect}
          marks={meetingMarks}
        />

        <div className={cn("grid gap-2", rescueOn ? "grid-cols-2" : "grid-cols-1")}>
          {rescueOn && (
            <Button variant="danger" onClick={() => (mine ? setMode("rescue") : notify({ tone: "info", title: "Necesitás un Squad para el Botón de Rescate", cta: { label: "Armar Squad", href: "/squad" } }))}>
              <Siren /> Rescate
            </Button>
          )}
          <Button variant="outline" disabled={!mine} onClick={() => setMode("base")}>
            <Flag className="text-vip" /> Punto Base
          </Button>
        </div>
        <p className="text-center text-[11px] text-muted/70">Nadie te ve en el plano salvo las personas que elegís, y solo por 15 minutos.</p>
      </div>

      {/* Estoy acá */}
      <BottomSheet
        open={!!draft && mode === "pin"}
        onClose={() => setDraft(null)}
        title={<span className="flex items-center gap-2"><MapPin className="size-5 text-rouge" /> Estoy acá{draft?.sector ? ` · ${draft.sector.name}` : ""}</span>}
        description="Elegí con quién compartirlo durante los próximos 15 minutos."
        footer={
          <Button block size="lg" disabled={!audienceOk} onClick={confirmPin}>
            Compartir por 15 min
          </Button>
        }
      >
        <div className="space-y-2">
          <div className={cn("rounded-2xl border px-3", shareSquad && mine ? "border-squad/50 bg-squad/[0.07]" : "border-white/10")}>
            <Switch tone="squad" id="share-squad" checked={shareSquad && !!mine} disabled={!mine} onCheckedChange={setShareSquad} label="Mi Squad de amigos" description={mine ? `${mine.squad.name} · pin cian` : "Todavía no tenés Squad"} />
          </div>
          <div className={cn("rounded-2xl border px-3", shareMatches ? "border-rouge/50 bg-rouge/[0.07]" : "border-white/10")}>
            <Switch tone="rouge" id="share-matches" checked={shareMatches && !squadOnly} disabled={!matches.length || squadOnly} onCheckedChange={setShareMatches} label="Matches específicos de esta noche" description={squadOnly ? "Desactivado en tu Privacidad: tu ubicación es solo para tu Squad" : matches.length ? "Solo los que selecciones · pin rouge" : "Todavía no tenés matches esta noche"} />
            {shareMatches && !squadOnly && (
              <ul className="space-y-1 pb-3">
                {matches.map(({ profile: p }) => {
                  const on = selected.includes(p.id);
                  return (
                    <li key={p.id}>
                      <label className="flex min-h-touch cursor-pointer items-center gap-3 rounded-xl px-1">
                        <input type="checkbox" checked={on} onChange={() => setSelected((sel) => (on ? sel.filter((x) => x !== p.id) : [...sel, p.id]))} className="size-5 accent-rouge" />
                        <Avatar profile={p} size={32} ring={on ? "rouge" : "none"} />
                        <span className="text-sm font-semibold">{p.full_name.split(" ")[0]}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <TextField label="Nota (opcional)" placeholder="Al lado de la columna dorada 🍸" maxLength={60} value={note} onChange={(e) => setNote(e.target.value)} />
          {!audienceOk && <p className="text-xs text-rouge">Elegí al menos una audiencia: nunca compartimos tu ubicación sin que lo elijas.</p>}
        </div>
      </BottomSheet>

      {/* Punto Base */}
      <BottomSheet
        open={!!draft && mode === "base"}
        onClose={() => setDraft(null)}
        title={<span className="flex items-center gap-2"><Flag className="size-5 text-vip" /> Punto Base{draft?.sector ? ` · ${draft.sector.name}` : ""}</span>}
        description="Su lugar de encuentro si alguien se pierde. Lo ve solo tu Squad."
        footer={
          <Button
            block
            size="lg"
            variant="vip"
            onClick={async () => {
              if (!draft || !mine) return;
              const label = baseLabel.trim() || draft.sector?.name || "Nuestro Punto de Encuentro";
              const r = await exec(C.setSquadBasePin(mine.squad.id, meId, draft.x, draft.y, label));
              if (r.ok) {
                setDraft(null);
                setMode("pin");
                notify({ tone: "vip", title: `🚩 Punto Base: ${label}`, description: "Le avisamos a tu Squad por el chat." });
              }
            }}
          >
            Fijar Punto Base
          </Button>
        }
      >
        <TextField label="¿Cómo lo reconocen?" placeholder="Columna dorada de la Barra Central" maxLength={60} value={baseLabel} onChange={(e) => setBaseLabel(e.target.value)} />
      </BottomSheet>

      {/* Detalle de pin */}
      <BottomSheet open={!!inspect} onClose={() => setInspect(null)}>
        {inspect && <PinDetail vp={inspect} onClose={() => setInspect(null)} go={(href) => router.push(href)} />}
      </BottomSheet>
    </main>
  );
}

function PinDetail({ vp, onClose, go }: { vp: VisiblePin; onClose: () => void; go: (href: string) => void }) {
  const { state } = useRouge();
  const meId = state.current_user_id;
  const conn = connectionBetween(state, vp.pin.event_id, meId, vp.profile.id).find((c) => c.status === "accepted");
  const tone = vp.pin.is_rescue_alert ? "rescue" : vp.audience;
  const sector = vp.pin.sector_name ?? sectorAt(state.events.find((e) => e.id === vp.pin.event_id)!.venue_layout_json.sectors, vp.pin.coord_x, vp.pin.coord_y)?.name;
  return (
    <div className="space-y-4 pt-3">
      <div className="flex items-center gap-3">
        <Avatar profile={vp.profile} size={56} ring={tone === "squad" ? "squad" : tone === "self" ? "none" : "rouge"} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold">{vp.audience === "self" ? "Vos" : vp.profile.full_name.split(" ")[0]}</p>
          <p className="text-sm text-muted">📍 {sector ?? "En el plano"} · expira en {vp.minutesLeft} min</p>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 font-display text-[11px] font-bold", tone === "rescue" ? "bg-sos text-white" : tone === "squad" ? "bg-squad/15 text-squad" : tone === "match" ? "bg-rouge/15 text-rouge" : "bg-white/10 text-muted")}>
          {tone === "rescue" ? "🚨 RESCATE" : tone === "squad" ? "Squad" : tone === "match" ? "Match" : "Tu pin"}
        </span>
      </div>
      {vp.pin.note && <p className="rounded-2xl bg-white/[0.05] px-4 py-3 text-[15px]">“{vp.pin.note}”</p>}
      {vp.audience !== "self" && (
        <div className="grid grid-cols-2 gap-2">
          {vp.audience === "squad" ? (
            <Button variant="squad" onClick={() => { onClose(); go("/squad/chat"); }}>
              <MessageCircle /> Chat del Squad
            </Button>
          ) : conn ? (
            <Button onClick={() => { onClose(); go(`/chat/${conn.id}`); }}>
              <MessageCircle /> Escribile
            </Button>
          ) : null}
          <Button variant="glass" onClick={() => { onClose(); go(profileHref(vp.profile, vp.pin.event_id)); }}>
            Ver perfil
          </Button>
        </div>
      )}
    </div>
  );
}
