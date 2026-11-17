"use client";

import * as C from "@/lib/store/commands";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Copy, Flag, Gift, House, LogOut, MapPin, MessageCircle, QrCode, ShieldAlert, Siren, UserPlus, UsersRound } from "lucide-react";
import { useShare } from "@/components/share/ShareSheet";
import type { SafetyStatus } from "@/lib/types";
import {
  announceBaseMeetup,
  createSquad,
  declineSquadInvite,
  inviteToSquad,
  joinSquad,
  leaveSquad,
  markHomeSafe,
  resolveRescue,
  triggerRescue,
  updateSquad,
} from "@/lib/engine/actions";
import {
  activeEvent,
  activePinOf,
  getProfile,
  isLobbyInteractive,
  openVipSquads,
  pendingSquadInvites,
  rescueAlertsFor,
  searchAttendeesByUsername,
  squadMembers,
  squadMessages,
  squadOf,
  visiblePins,
} from "@/lib/engine/selectors";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { useRequireProfile } from "@/lib/store/hooks";
import { cn, formatTime } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { faceOf, verticalOf } from "@/lib/engine/verticals";
import { profileHref } from "@/lib/engine/privacy";

/** Vocabulario de la vertical: "Squad" en la noche, "Equipo" en corporativo. */
function useSq() {
  const { state } = useRouge();
  return verticalOf(state, state.active_event_id).copy.squad;
}

export default function SquadPage() {
  const me = useRequireProfile();
  if (!me) return null;
  return <Squad />;
}

const SAFETY: Record<SafetyStatus, { label: string; cls: string }> = {
  ok: { label: "En la fiesta", cls: "bg-white/[0.06] text-muted" },
  rescue_needed: { label: "🚨 Pidió rescate", cls: "bg-sos text-white shadow-glow-sos" },
  home_safe: { label: "🏠 En casa", cls: "bg-squad/15 text-squad" },
};

function Squad() {
  const sq = useSq();
  const { state } = useRouge();
  const now = useNow(15_000);
  const event = activeEvent(state)!;
  const meId = state.current_user_id;
  const mine = squadOf(state, event.id, meId);
  const alerts = rescueAlertsFor(state, event.id, meId, now);
  const open = isLobbyInteractive(event, now);

  return (
    <main className="safe-top">
      <header className="sticky top-0 z-30 bg-background/85 px-4 pb-3 pt-4 backdrop-blur-xl">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-squad">{event.name}</p>
        <h1 className="text-2xl">{mine ? mine.squad.name : `Tu ${sq}`}</h1>
      </header>

      <div className="space-y-4 px-4 pb-10">
        {alerts.map((a) => (
          <section key={a.member.id} role="alert" className="rounded-3xl border border-sos bg-sos/15 p-4 shadow-glow-sos">
            <div className="flex items-center gap-3">
              <span className="relative">
                <span className="absolute inset-0 animate-ping rounded-full bg-sos/60" />
                <Avatar profile={a.profile} size={48} ring="rouge" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-bold text-sos">🚨 {a.profile.full_name.split(" ")[0]} necesita que vayan</p>
                <p className="text-sm text-primary/90">{a.pin?.sector_name ? `📍 ${a.pin.sector_name}` : "Ubicación en el plano"}{a.pin ? ` · ${formatTime(a.pin.created_at)}` : ""}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link href={`/map?focus=${a.profile.id}`} className={buttonVariants({ variant: "rouge" })}>
                <MapPin /> Ir a su pin
              </Link>
              <Link href="/squad/chat" className={buttonVariants({ variant: "glass" })}>
                <MessageCircle /> Chat
              </Link>
            </div>
          </section>
        ))}

        {mine ? <MySquad /> : open ? <NoSquad /> : <p className="rounded-3xl border border-dashed border-white/10 p-8 text-center text-sm text-muted">El lobby cerró: los {sq === "Squad" ? "Squads de esta noche" : "equipos de este evento"} ya no están activos.</p>}
      </div>
    </main>
  );

}

// ── Sin squad ─────────────────────────────────────────────────────
function NoSquad() {
  const sq = useSq();
const { state, exec, notify } = useRouge();
const now = useNow(15_000);
const event = activeEvent(state)!;
const meId = state.current_user_id;
const router = useRouter();
  const [name, setName] = useState(`${sq} de ${faceOf(state, meId)!.full_name.split(" ")[0]}`);
  const [code, setCode] = useState("");
  const invites = pendingSquadInvites(state, event.id, meId);
  const vip = openVipSquads(state, event.id, meId);
  const rule = state.perk_rules.find((r) => r.event_id === event.id && r.is_active && (!r.trigger.before || +new Date(r.trigger.before) > now));

  return (
    <>
      {invites.map(({ member, squad }) => {
        const by = faceOf(state, member.invited_by);
        return (
          <section key={member.id} className="rounded-3xl border border-squad/40 bg-squad/[0.07] p-4">
            <div className="flex items-center gap-3">
              {by && <Avatar profile={by} size={44} ring="squad" />}
              <p className="flex-1 text-sm">
                <b>{by?.full_name.split(" ")[0] ?? "Alguien"}</b> te invitó a <b className="text-squad">{squad.name}</b> · {squadMembers(state, squad.id).length} integrantes
              </p>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <Button
                variant="squad"
                onClick={async () => {
                  const r = await exec(C.joinSquad(meId, squad.id));
                  if (r.ok) notify({ tone: "squad", title: `👯 Te sumaste a ${squad.name}`, description: r.data.grantedPerks.length ? "🎁 ¡Desbloquearon un QR para cada una! Miralo en Perks." : undefined });
                }}
              >
                Unirme
              </Button>
              <Button variant="ghost" onClick={() => exec(C.declineSquadInvite(meId, member.id))}>
                Rechazar
              </Button>
            </div>
          </section>
        );
      })}

      <section className="relative overflow-hidden rounded-3xl border border-squad/30 bg-gradient-to-br from-squad/15 via-surface to-surface p-5">
        <UsersRound className="size-8 text-squad" />
        <h2 className="mt-3 text-2xl leading-tight">Armá tu {sq}</h2>
        <p className="mt-1 text-sm text-muted">Se ven en el plano, tienen chat grupal y botón de rescate entre ustedes. Nadie se pierde.</p>
        {rule && (
          <p className="mt-3 flex items-center gap-2 rounded-2xl bg-vip/10 px-3 py-2 text-sm text-vip">
            <Gift className="size-4 shrink-0" /> {rule.title}
            {rule.trigger.before ? ` · antes de las ${formatTime(rule.trigger.before)}` : ""}
          </p>
        )}
        <div className="mt-4 space-y-3">
          <TextField label={`Nombre del ${sq}`} value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />
          <Button
            block
            size="lg"
            variant="squad"
            onClick={async () => {
              const r = await exec(C.createSquad(event.id, meId, name));
              if (r.ok) notify({ tone: "squad", title: `✨ Creaste ${r.data.name}`, description: "Invitá a tu gente con el link o por @username." });
            }}
          >
            Crear {sq}
          </Button>
        </div>
      </section>

      <form
        className="glass flex items-end gap-2 rounded-3xl p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) router.push(`/join/${encodeURIComponent(code.trim().toUpperCase())}`);
        }}
      >
        <div className="flex-1">
          <TextField label={`¿Te pasaron un código de ${sq}?`} placeholder="SQ-XXXX" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </div>
        <Button type="submit" variant="glass" disabled={!code.trim()}>
          Unirme
        </Button>
      </form>

      {vip.length > 0 && <VipTables list={vip} />}
    </>
  );
}

// ── Con squad ─────────────────────────────────────────────────────
function MySquad() {
  const sq = useSq();
const { state, exec, notify } = useRouge();
const now = useNow(15_000);
const event = activeEvent(state)!;
const meId = state.current_user_id;
  const { squad, member } = squadOf(state, event.id, meId)!;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [q, setQ] = useState("");
  const members = squadMembers(state, squad.id, "any");
  const joined = members.filter((m) => m.status === "joined");
  const pins = useMemo(() => new Map(visiblePins(state, event.id, meId, now).map((p) => [p.pin.user_id, p])), [state, event.id, meId, now]);
  const msgs = squadMessages(state, squad.id);
  const last = msgs.at(-1);
  const rule = state.perk_rules.find((r) => r.event_id === event.id && r.is_active);
  const unlocked = rule ? state.user_perks_qrs.some((p) => p.user_id === meId && p.source_ref_id === rule.id) : false;
  const results = q.trim().length >= 2 ? searchAttendeesByUsername(state, event.id, meId, q).filter((p) => !members.some((m) => m.user_id === p.id)).slice(0, 6) : [];
  const link = typeof window !== "undefined" ? `${window.location.origin}/join/${squad.invite_code}` : `/join/${squad.invite_code}`;

  const myRescuePin = activePinOf(state, event.id, meId, now);

  const rescue = () => {
    const pin = activePinOf(state, event.id, meId, now);
    const coords = pin ? undefined : squad.base_pin_x != null ? { x: squad.base_pin_x, y: squad.base_pin_y! } : undefined;
    // Sin banner: la confirmación se muestra en línea para no tapar "Ya estoy bien".
    exec(C.triggerRescue(event.id, meId, coords));
  };

  const shareSheet = useShare();
  const share = () =>
    shareSheet.open({ url: link, title: `Sumate a ${squad.name}`, text: `Sumate a mi ${sq} "${squad.name}" en ROUGE 👯 (entrás al evento y quedás en el grupo)`, fileName: `rouge-squad-${squad.invite_code}`, accent: "squad", caption: squad.invite_code });

  return (
    <>
      {shareSheet.sheet}
      {/* Seguridad */}
      <section className="grid grid-cols-2 gap-3">
        {member.safety_status === "rescue_needed" ? (
          <div className="col-span-2 space-y-2 rounded-3xl border border-sos bg-sos/10 p-4 shadow-glow-sos" role="status">
            <p className="font-display font-bold text-sos">🚨 Tu {sq} recibió la alerta</p>
            <p className="text-sm text-primary/90">
              Ven tu pin rojo{myRescuePin?.sector_name ? ` en ${myRescuePin.sector_name}` : ""}.{" "}
              <Link href="/map?rescue=1" className="font-semibold text-sos underline underline-offset-4">
                Precisar mi ubicación
              </Link>
            </p>
            <Button size="lg" variant="glass" block className="min-h-[56px] border-sos/60 text-primary" onClick={() => exec(C.resolveRescue(event.id, meId))}>
              ✅ Ya estoy bien · cancelar alerta
            </Button>
          </div>
        ) : (
          <button type="button" onClick={rescue} className="flex min-h-[96px] flex-col items-center justify-center gap-1 rounded-3xl bg-sos px-3 text-center font-display font-bold text-white shadow-glow-sos transition active:scale-95">
            <Siren className="size-7" />
            <span className="leading-tight">Rescate</span>
            <span className="text-[11px] font-medium opacity-85">Vengan a mi pin</span>
          </button>
        )}
        {member.safety_status !== "rescue_needed" && (
          <button
            type="button"
            disabled={member.safety_status === "home_safe"}
            onClick={async () => {
              const r = await exec(C.markHomeSafe(event.id, meId));
              if (r.ok) notify({ tone: "squad", title: `🏠 Avisamos a tu ${sq} que llegaste bien`, description: "Borramos tu pin del plano." });
            }}
            className="flex min-h-[96px] flex-col items-center justify-center gap-1 rounded-3xl border border-squad/40 bg-squad/10 px-3 text-center font-display font-bold text-squad transition active:scale-95 disabled:opacity-60"
          >
            <House className="size-7" />
            <span className="leading-tight">{member.safety_status === "home_safe" ? "Ya avisaste" : "Llegué a casa"}</span>
            <span className="text-[11px] font-medium opacity-85">Avisa a todo el {sq}</span>
          </button>
        )}
      </section>

      {/* Integrantes */}
      <section className="glass rounded-3xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base">
            Integrantes <span className="text-muted">· {joined.length}</span>
          </h2>
          {squad.has_vip_table_to_share && <Badge tone="vip">🍾 Mesa VIP</Badge>}
        </div>
        <ul className="space-y-1">
          {members.map((m) => {
            const p = faceOf(state, m.user_id);
            if (!p) return null;
            const pin = pins.get(m.user_id);
            return (
              <li key={m.id} className="flex min-h-touch items-center gap-3">
                <Link href={m.user_id === meId ? "/profile" : profileHref(p, state.active_event_id)}>
                  <Avatar profile={p} size={40} ring={m.status === "joined" ? "squad" : "none"} className={m.status === "invited" ? "opacity-50" : undefined} />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {p.full_name.split(" ")[0]} {m.user_id === meId && <span className="text-muted">(vos)</span>} {squad.created_by === m.user_id && "👑"}
                  </p>
                  <p className="truncate text-xs text-muted">{m.status === "invited" ? "Invitación pendiente" : pin ? `📍 ${pin.pin.sector_name ?? "En el plano"} · ${pin.minutesLeft} min` : "Sin pin activo"}</p>
                </div>
                {m.status === "joined" && <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", SAFETY[m.safety_status].cls)}>{SAFETY[m.safety_status].label}</span>}
              </li>
            );
          })}
        </ul>
        <Button block variant="squad" className="mt-3" onClick={() => setInviteOpen(true)}>
          <UserPlus /> Invitar a mi {sq}
        </Button>
      </section>

      {/* Perk por squad */}
      {rule && (
        <section className="rounded-3xl border border-vip/30 bg-vip/[0.06] p-4">
          <p className="flex items-center gap-2 font-display text-sm font-bold text-vip">
            <Gift className="size-4" /> {rule.title}
          </p>
          {unlocked ? (
            <Link href="/perks" className="mt-1 inline-flex min-h-touch items-center text-sm text-primary underline decoration-vip underline-offset-4">
              ¡Desbloqueado! Ver mi QR →
            </Link>
          ) : (
            <>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-vip shadow-glow-vip" style={{ width: `${Math.min(100, (joined.length / rule.trigger.min_members) * 100)}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-muted">
                {joined.length}/{rule.trigger.min_members} integrantes{rule.trigger.before ? ` · hasta las ${formatTime(rule.trigger.before)}` : ""}
              </p>
            </>
          )}
        </section>
      )}

      {/* Punto Base */}
      <section className="glass rounded-3xl p-4">
        <h2 className="flex items-center gap-2 text-base">
          <Flag className="size-4 text-vip" /> Punto Base
        </h2>
        <p className="mt-1 text-sm text-muted">{squad.base_pin_label ? squad.base_pin_label : "Fijen un lugar de encuentro por si se pierden."}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link href="/map?mode=base" className={buttonVariants({ variant: "outline", size: "sm" })}>
            {squad.base_pin_label ? "Moverlo" : "Fijar en el plano"}
          </Link>
          <Button
            size="sm"
            variant="vip"
            disabled={squad.base_pin_x == null}
            onClick={async () => {
              const r = await exec(C.announceBaseMeetup(squad.id, meId, 10));
              if (r.ok) notify({ tone: "vip", title: "🚩 Aviso enviado", description: "¡Nos vemos en el Punto Base en 10 min!" });
            }}
          >
            Nos vemos en 10′
          </Button>
        </div>
      </section>

      {/* Chat */}
      <Link href="/squad/chat" className="glass flex min-h-[72px] items-center gap-3 rounded-3xl p-4 transition hover:bg-white/10">
        <span className="grid size-11 place-items-center rounded-2xl bg-squad/15 text-squad">
          <MessageCircle className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Chat del {sq}</p>
          <p className="truncate text-sm text-muted">{last ? `${last.message_type === "system_alert" ? "" : `${faceOf(state, last.sender_id)?.full_name.split(" ")[0]}: `}${last.message_type === "image" ? "📷 Foto" : last.content}` : "Todavía no hay mensajes"}</p>
        </div>
      </Link>

      {/* Cuentas de la mesa */}
      <Link href="/squad/cuentas" className="glass flex min-h-[72px] items-center gap-3 rounded-3xl p-4 transition hover:bg-white/10" data-testid="squad-cuentas">
        <span className="grid size-11 place-items-center rounded-2xl bg-vip/15 text-xl" aria-hidden>
          🧾
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Cuentas de la mesa</p>
          <p className="truncate text-sm text-muted">Quién pagó qué y cuánto le transfiere cada uno al final.</p>
        </div>
      </Link>

      {/* Mesa VIP */}
      <section className="glass rounded-3xl px-4 py-1">
        <Switch
          tone="vip"
          id="vip-share"
          checked={squad.has_vip_table_to_share}
          onCheckedChange={async (v) => {
            const r = await exec(C.updateSquad(squad.id, meId, { has_vip_table_to_share: v }));
            if (r.ok && v) notify({ tone: "vip", title: "🍾 Mesa VIP visible", description: "Otros grupos pueden ver que tienen lugar para sumar gente y dividir gastos." });
          }}
          label="🍾 Compartimos Mesa VIP"
          description="Mostrar que tienen mesa y están abiertos a sumar otro grupo"
        />
      </section>

      <VipTables list={openVipSquads(state, event.id, meId)} />

      <Button variant="ghost" block onClick={() => setLeaveOpen(true)}>
        <LogOut /> Salir del {sq}
      </Button>

      {/* Invitar */}
      <BottomSheet open={inviteOpen} onClose={() => setInviteOpen(false)} title={`Invitar a mi ${sq}`} description="Por link, por @username o desde el perfil de cualquier asistente.">
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="font-display text-[13px] font-semibold">Link rápido</p>
            <div className="flex gap-2">
              <code className="glass flex min-h-touch flex-1 items-center truncate rounded-2xl px-3 font-display text-sm text-squad">{squad.invite_code}</code>
              <Button
                variant="squad"
                onClick={() => {
                  setInviteOpen(false);
                  share();
                }}
              >
                <QrCode /> QR
              </Button>
              <Button
                variant="glass"
                size="icon"
                aria-label="Copiar link"
                onClick={async () => {
                  await navigator.clipboard?.writeText(link).catch(() => undefined);
                  notify({ tone: "squad", title: "Link copiado 🔗", duration: 1800 });
                }}
              >
                <Copy />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <TextField label="Buscar por @username" prefix={<AtSign className="size-4" />} placeholder="cami.beats" autoCapitalize="none" value={q} onChange={(e) => setQ(e.target.value)} />
            <ul className="space-y-1">
              {results.map((p) => (
                <li key={p.id} className="flex min-h-touch items-center gap-3">
                  <Avatar profile={p} size={36} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {p.full_name} <span className="text-muted">@{p.username}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="squad"
                    onClick={async () => {
                      const r = await exec(C.inviteToSquad(squad.id, meId, p.id));
                      if (r.ok) notify({ tone: "squad", title: `Invitaste a @${p.username}`, duration: 2000 });
                    }}
                  >
                    Invitar
                  </Button>
                </li>
              ))}
              {q.trim().length >= 2 && results.length === 0 && <li className="py-2 text-sm text-muted">No encontramos a nadie con ese @username en el evento.</li>}
            </ul>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title={`¿Salir de ${squad.name}?`}
        description="Dejás de ver sus pines y su chat, y ellas dejan de ver los tuyos."
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="glass" onClick={() => setLeaveOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                exec(C.leaveSquad(meId, squad.id));
                setLeaveOpen(false);
              }}
            >
              Salir
            </Button>
          </div>
        }
      >
        <p className="flex items-center gap-2 text-sm text-muted">
          <ShieldAlert className="size-4 text-sos" /> Sin {sq} no vas a tener Botón de Rescate.
        </p>
      </BottomSheet>
    </>
  );
}

function VipTables({ list }: { list: ReturnType<typeof openVipSquads> }) {
  if (!list.length) return null;
  return (
    <section>
      <h2 className="mb-2 text-sm text-muted">🍾 Mesas VIP abiertas a sumar grupo</h2>
      <ul className="space-y-2">
        {list.map(({ squad, members }) => (
          <li key={squad.id} className="flex items-center gap-3 rounded-2xl border border-vip/30 bg-vip/[0.05] p-3">
            <div className="flex -space-x-2">
              {members.slice(0, 3).map((p) => (
                <Avatar key={p.id} profile={p} size={32} ring="vip" />
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{squad.name}</p>
              <p className="truncate text-xs text-muted">{squad.base_pin_label ?? "Sector VIP"} · {members.length} personas</p>
            </div>
            {members[0] && (
              <Link href={profileHref(members[0], squad.event_id)} className={buttonVariants({ size: "sm", variant: "glass" })}>
                Ver
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
