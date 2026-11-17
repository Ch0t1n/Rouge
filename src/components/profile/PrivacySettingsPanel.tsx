"use client";

import * as C from "@/lib/store/commands";
import { Briefcase, EyeOff, Lock, MapPin } from "lucide-react";
import { privacyOf, type PrivacyPatch } from "@/lib/engine/privacy";
import { activeEvent, getAttendee } from "@/lib/engine/selectors";
import { verticalOf } from "@/lib/engine/verticals";
import { useRouge } from "@/lib/store/RougeContext";
import { Switch } from "@/components/ui/switch";

/**
 * Controles de privacidad de la cuenta (tabla `privacy_settings`) + el modo incógnito del evento en curso.
 * Las reglas se aplican en el motor y en el servidor (join_event, drop_pin, persona_cards), no solo acá.
 */
export function PrivacySettingsPanel() {
  const { state, exec, notify } = useRouge();
  const me = state.current_user_id;
  const settings = privacyOf(state, me);
  const event = activeEvent(state);
  const attendee = event ? getAttendee(state, event.id, me) : undefined;
  const v = verticalOf(state, event?.id);

  const save = async (patch: PrivacyPatch, title: string) => {
    const r = await exec(C.updatePrivacySettings(me, patch));
    if (r.ok) notify({ tone: "squad", title, duration: 2200 });
  };

  const toggleEventIncognito = async (on: boolean) => {
    if (!event) return;
    const r = await exec(C.updateAttendeeSettings(event.id, me, { ghost_mode: on }));
    if (r.ok) notify({ tone: "squad", title: on ? `👻 Incógnito en ${event.name}` : "✨ Volviste a la grilla", duration: 2200 });
  };

  return (
    <section className="space-y-3">
      <h2 className="text-base">Privacidad en los eventos</h2>

      {attendee && event && (
        <div className="rounded-2xl border border-squad/30 bg-squad/[0.05] px-3">
          <Switch
            tone="squad"
            id="event-incognito"
            checked={attendee.ghost_mode}
            onCheckedChange={toggleEventIncognito}
            label={`Incógnito en ${event.name}`}
            description={`No aparecés en la grilla (${v.copy.ghost}). Tu entrada, la barra, el plano con tu ${v.copy.squad} y los perks siguen andando.`}
          />
        </div>
      )}

      <div className="glass divide-y divide-white/10 rounded-2xl px-3">
        <Row icon={<EyeOff className="size-5" />}>
          <Switch
            tone="squad"
            id="incognito-default"
            checked={settings.incognito_default}
            onCheckedChange={(on) => save({ incognito_default: on }, on ? "Vas a entrar incógnito a cada evento" : "Vas a aparecer en la grilla al entrar")}
            label="Entrar siempre en modo incógnito"
            description="Al entrar a un evento no aparecés en la grilla de asistentes hasta que lo desactives."
          />
        </Row>
        <Row icon={<MapPin className="size-5" />}>
          <Switch
            tone="squad"
            id="pin-squad-only"
            checked={!settings.pin_share_matches}
            onCheckedChange={(on) => save({ pin_share_matches: !on }, on ? "Tu ubicación: solo tu Squad" : "Podés compartir tu pin con matches elegidos")}
            label="Mi ubicación, solo para mi Squad"
            description="Tu pin del plano nunca es público: lo ven tu Squad y, si lo permitís, los matches que elijas en cada pin."
          />
        </Row>
        <Row icon={<Briefcase className="size-5" />}>
          <Switch
            tone="squad"
            id="pro-after-meeting"
            checked={settings.pro_details_after_meeting}
            onCheckedChange={(on) => save({ pro_details_after_meeting: on }, on ? "Empresa y cargo: después de una reunión" : "Empresa y cargo visibles en el networking")}
            label="Empresa y cargo, solo después de una reunión"
            description="En eventos corporativos se ven tu rubro y lo que buscás u ofrecés; empresa y cargo aparecen cuando aceptás una reunión o un contacto. Tu LinkedIn siempre queda oculto hasta entonces."
          />
        </Row>
      </div>

      <div className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-primary/85">
        <Lock className="size-5 shrink-0 text-squad" />
        <p>
          Nunca mostramos a otros asistentes tu teléfono, tu email, tu fecha de nacimiento (solo la edad, en eventos de noche) ni a
          qué otros eventos fuiste. En un evento corporativo nadie ve tu perfil de la noche.
        </p>
      </div>
    </section>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1">
      <span className="mt-4 shrink-0 text-muted">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
