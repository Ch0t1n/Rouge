"use client";

import * as C from "@/lib/store/commands";
import { useMemo, useState } from "react";
import { CalendarClock, Send } from "lucide-react";
import type { Meeting, Profile, UUID } from "@/lib/types";
import { MEETING_TOPIC_MAX, checkSlot, hasConflict, meetingSlots, spotsOf, type MeetingLocation } from "@/lib/engine/meetings";
import { getEvent } from "@/lib/engine/selectors";
import { verticalOf } from "@/lib/engine/verticals";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { cn } from "@/lib/utils";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/field";
import { Avatar } from "@/components/ui/avatar";
import { LocationPicker } from "./LocationPicker";

const PRO_TOPICS = ["Charlar sobre alianzas B2B", "Presentarte mi producto", "Consulta rápida", "Ver si podemos trabajar juntos"];
const NIGHT_TOPICS = ["Nos vemos en la barra 🍸", "Te espero cerca de la cabina", "¿Nos juntamos en el patio?", "Nos vemos en el sector VIP"];

const locationOf = (m: Meeting): MeetingLocation =>
  m.location_kind === "spot" && m.spot_id ? { kind: "spot", spotId: m.spot_id } : m.location_kind === "pin" && m.pin_x != null && m.pin_y != null ? { kind: "pin", x: m.pin_x, y: m.pin_y, label: m.pin_label } : { kind: "tbd" };

/**
 * Pedir una reunión ("Solicitar reunión" en corporativo, "Punto de encuentro" con un match en la noche) o reprogramar
 * una existente (`meeting`). Horario en franjas dentro del evento, 15 o 30 min, y lugar: sala/mesa, pin o a definir.
 */
export function MeetingRequestSheet({
  open,
  onClose,
  eventId,
  target,
  meeting,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  eventId: UUID;
  target: Pick<Profile, "id" | "full_name" | "photos">;
  /** Si viene, reprograma esa reunión. */
  meeting?: Meeting;
  onDone?: (m: Meeting) => void;
}) {
  const { state, exec, notify } = useRouge();
  const now = useNow(30_000);
  const event = getEvent(state, eventId);
  const v = verticalOf(state, eventId);
  const pro = v.kind === "corporate";
  const [topic, setTopic] = useState(meeting?.topic ?? "");
  const [duration, setDuration] = useState<15 | 30>(meeting?.duration_min ?? (pro ? 30 : 15));
  const slots = useMemo(() => (event ? meetingSlots(event, now, duration) : []), [event, now, duration]);
  const [startsAt, setStartsAt] = useState<string | null>(meeting?.starts_at ?? null);
  const chosen = startsAt ?? slots[0]?.value ?? null;
  const [location, setLocation] = useState<MeetingLocation>(meeting ? locationOf(meeting) : spotsOf(state, eventId).length && pro ? { kind: "spot", spotId: spotsOf(state, eventId)[0].id } : { kind: "tbd" });
  const first = target.full_name.split(" ")[0];
  if (!event) return null;

  // Mismas reglas que el servidor, antes de enviar: horario, lugar libre y mi propia agenda.
  const slotError = chosen
    ? (checkSlot(state, eventId, chosen, duration, location, now, meeting?.id) ??
      (hasConflict(state, state.current_user_id, chosen, duration, meeting?.id) ? "Ya tenés una reunión confirmada en ese horario: elegí otro." : null))
    : "Este evento ya no tiene horarios disponibles.";
  const valid = (!!meeting || (topic.trim().length > 0 && topic.length <= MEETING_TOPIC_MAX)) && !slotError;

  const submit = async () => {
    if (!chosen || !valid) return;
    const r = meeting
      ? await exec(C.rescheduleMeeting(meeting.id, state.current_user_id, { startsAt: chosen, duration, location }))
      : await exec(C.requestMeeting(eventId, state.current_user_id, target.id, { topic, startsAt: chosen, duration, location }));
    if (!r.ok) return;
    notify({
      tone: "squad",
      title: meeting ? "📅 Nueva propuesta enviada" : pro ? `📅 Le pediste una reunión a ${first}` : `📍 Le propusiste un punto de encuentro a ${first}`,
      description: "Te avisamos cuando responda. Lo ves en Mis reuniones.",
    });
    onDone?.(r.data);
    onClose();
  };

  const title = meeting ? "Reprogramar" : pro ? `Reunión con ${first}` : `Punto de encuentro con ${first}`;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <CalendarClock className="size-5 text-squad" /> {title}
        </span>
      }
      description={pro ? "Proponé motivo, horario y lugar. Si acepta, se abre el chat y la sala queda reservada." : "Solo entre matches. Si acepta, el punto aparece en el plano para los dos."}
      footer={
        <div className="space-y-2">
          {slotError && chosen && <p className="text-center text-xs text-rouge">{slotError}</p>}
          <Button block size="lg" onClick={submit} disabled={!valid}>
            <Send /> {meeting ? "Enviar nueva propuesta" : pro ? "Solicitar reunión" : "Proponer punto de encuentro"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {!meeting && (
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <Avatar profile={target} size={40} ring="squad" />
              <div className="relative flex-1">
                <textarea
                  value={topic}
                  maxLength={MEETING_TOPIC_MAX}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder={pro ? "Motivo o agenda breve" : "¿Para qué se encuentran?"}
                  aria-label="Motivo de la reunión"
                  className="min-h-[80px] w-full resize-none rounded-2xl rounded-tl-md border border-squad/40 bg-squad/[0.06] px-4 py-3 text-[15px] placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-squad/40"
                />
                <span className="absolute bottom-2 right-3 text-[11px] tabular-nums text-muted">
                  {topic.length}/{MEETING_TOPIC_MAX}
                </span>
              </div>
            </div>
            <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
              {(pro ? PRO_TOPICS : NIGHT_TOPICS).map((t) => (
                <button key={t} type="button" onClick={() => setTopic(t)} className="glass-pill shrink-0 whitespace-nowrap py-2 text-xs">
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        <Segmented<"15" | "30">
          label="Duración"
          options={[
            { value: "15", label: "15 min" },
            { value: "30", label: "30 min" },
          ]}
          value={String(duration) as "15" | "30"}
          onChange={(d) => setDuration(Number(d) as 15 | 30)}
        />

        <div>
          <p className="mb-1.5 font-display text-[13px] font-semibold text-primary">Horario</p>
          {slots.length === 0 ? (
            <p className="text-sm text-muted">No quedan horarios dentro del evento.</p>
          ) : (
            <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5" role="radiogroup" aria-label="Horario">
              {slots.map((sl) => (
                <button
                  key={sl.value}
                  type="button"
                  role="radio"
                  aria-checked={chosen === sl.value}
                  onClick={() => setStartsAt(sl.value)}
                  className={cn(
                    "min-h-[40px] shrink-0 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold transition",
                    chosen === sl.value ? "border-squad bg-squad/15 text-primary" : "border-white/15 bg-white/[0.04] text-primary/85",
                  )}
                >
                  {sl.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-1.5 font-display text-[13px] font-semibold text-primary">Dónde</p>
          <LocationPicker eventId={eventId} startsAt={chosen} duration={duration} value={location} onChange={setLocation} excludeMeetingId={meeting?.id} />
        </div>
      </div>
    </BottomSheet>
  );
}
