"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, LogOut, Mail, MailCheck, Sparkles, UserRoundPlus } from "lucide-react";
import { MOOD_TAGS, type Profile, type StaffRole } from "@/lib/types";
import { destinationFor, ROLE_META, safeNext, STAFF_ROLES, staffRoleOf } from "@/lib/engine/roles";
import { getAttendee, getProfile } from "@/lib/engine/selectors";
import { getSupabase } from "@/lib/supabase/client";
import { SOCIAL } from "@/lib/social/client";
import { friendlyError } from "@/lib/supabase/errors";
import { useRouge } from "@/lib/store/RougeContext";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { OrDivider, SocialLoginButtons } from "@/components/social/SocialLoginButtons";
import { useInstagramReturn } from "@/components/social/InstagramField";
import { Wordmark } from "@/components/brand/Wordmark";

/**
 * Ingreso e identificación del tipo de usuario.
 *  - Asistente: entra a la app (lobby, squad, plano, barra).
 *  - Equipo del evento: dueño/a, producción, barra, mozo/a o seguridad → cada uno a su pantalla.
 * Supabase: magic link y el rol lo define `event_staff` (lo asigna el dueño/a en Eventos → Equipo).
 * Modo Demo: elegís la persona y entrás con su rol.
 */
export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

type Tab = "attendee" | "staff";

function Login() {
  const { mode, signedIn, state, role, signOut } = useRouge();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const switching = params.get("switch") === "1";
  const [tab, setTab] = useState<Tab>(params.get("as") === "staff" ? "staff" : "attendee");
  const me = getProfile(state, state.current_user_id);
  useInstagramReturn();

  // Supabase: con sesión iniciada (vuelta del magic link) va directo a su pantalla según el rol.
  useEffect(() => {
    if (mode !== "supabase" || !signedIn || switching) return;
    if (!me) router.replace(`/onboarding${next ? `?next=${encodeURIComponent(next)}` : ""}`);
    else router.replace(destinationFor(state, state.active_event_id, state.current_user_id, next));
  }, [mode, signedIn, switching, me, next, state, router]);

  if (mode === "supabase" && signedIn && !switching) return null;

  return (
    <main className="safe-top relative flex min-h-dvh flex-col overflow-hidden px-6 pb-10 pt-10">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 size-[420px] -translate-x-1/2 rounded-full bg-rouge/20 blur-[120px]" />
      <Link href="/" className="relative font-display text-5xl font-bold tracking-tight text-rouge text-glow-rouge">
        <Wordmark />
      </Link>
      <h1 className="relative mt-5 text-[28px] leading-tight">¿Cómo entrás esta noche?</h1>
      <p className="relative mt-2 text-sm text-muted">Cada tipo de usuario ve su propia pantalla: la fiesta para asistentes, el panel para el equipo.</p>

      <div role="tablist" aria-label="Tipo de usuario" className="relative mt-6 grid grid-cols-2 gap-2 rounded-3xl bg-white/[0.04] p-1.5">
        {(
          [
            { id: "attendee", label: "Asistente", emoji: "✨", tone: "rouge" },
            { id: "staff", label: "Equipo", emoji: "🎛️", tone: "vip" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "min-h-touch rounded-2xl px-3 font-display text-sm font-semibold transition",
              tab === t.id ? (t.tone === "rouge" ? "bg-rouge text-white shadow-glow-rouge" : "bg-vip text-background shadow-glow-vip") : "text-muted hover:text-primary",
            )}
          >
            <span aria-hidden>{t.emoji}</span> {t.label}
          </button>
        ))}
      </div>

      <div className="relative mt-6 flex-1">
        {mode === "supabase" && signedIn && switching ? (
          <SessionCard me={me} roleLabel={`${ROLE_META[role].emoji} ${ROLE_META[role].label}`} onContinue={() => router.replace(destinationFor(state, state.active_event_id, state.current_user_id, next))} onSignOut={signOut} />
        ) : mode === "supabase" ? (
          <EmailLogin tab={tab} next={next} />
        ) : (
          <DemoPicker tab={tab} next={next} />
        )}
      </div>
    </main>
  );
}

function SessionCard({ me, roleLabel, onContinue, onSignOut }: { me?: Profile; roleLabel: string; onContinue: () => void; onSignOut: () => Promise<void> }) {
  return (
    <section className="glass rounded-3xl p-5">
      <div className="flex items-center gap-3">
        {me && <Avatar profile={me} size={48} ring="rouge" />}
        <div className="min-w-0">
          <p className="truncate font-semibold">{me?.full_name ?? "Sesión iniciada"}</p>
          <p className="text-sm text-vip">{roleLabel}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-2">
        <Button block onClick={onContinue}>
          Continuar <ArrowRight />
        </Button>
        <Button block variant="glass" onClick={() => onSignOut()}>
          <LogOut /> Cerrar sesión y entrar con otra cuenta
        </Button>
      </div>
    </section>
  );
}

function EmailLogin({ tab, next }: { tab: Tab; next: string | null }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb) return;
    setBusy(true);
    setError(null);
    const back = `/login?as=${tab}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
    const { error: err } = await sb.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}${back}`, shouldCreateUser: true },
    });
    setBusy(false);
    if (err) setError(friendlyError(err));
    else setSent(true);
  };

  if (sent)
    return (
      <section className="rounded-3xl border border-squad/40 bg-squad/[0.07] p-5" role="status">
        <MailCheck className="size-8 text-squad" />
        <h2 className="mt-3 text-xl">Revisá tu mail</h2>
        <p className="mt-1 text-sm text-primary/85">
          Te enviamos un link a <b>{email}</b>. Abrilo desde este dispositivo para entrar.
        </p>
        <Button variant="ghost" className="mt-3 px-0" onClick={() => setSent(false)}>
          Usar otro email
        </Button>
      </section>
    );

  return (
    <form onSubmit={submit} className="space-y-4">
      {tab === "attendee" ? (
        <p className="text-sm text-muted">Entrá con tu email: te mandamos un link mágico, sin contraseñas que recordar a las 3 AM.</p>
      ) : (
        <div className="rounded-2xl border border-vip/30 bg-vip/[0.06] p-4 text-sm">
          <p className="font-semibold text-vip">Usá el email de tu cuenta del equipo.</p>
          <p className="mt-1 text-muted">Tu rol lo asigna el dueño/a del evento. Entrás directo a lo tuyo:</p>
          <ul className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
            {STAFF_ROLES.map((r) => (
              <li key={r} className="rounded-xl bg-white/[0.04] px-2.5 py-1.5">
                {ROLE_META[r].emoji} {ROLE_META[r].label}
              </li>
            ))}
          </ul>
        </div>
      )}
      <SocialLoginButtons next={next} as={tab} instagram={tab === "attendee"} />
      {SOCIAL.google || (tab === "attendee" && SOCIAL.instagram) ? <OrDivider label="o con tu email" /> : null}
      <TextField label="Email" type="email" inputMode="email" autoComplete="email" required placeholder="vos@mail.com" value={email} onChange={(e) => setEmail(e.target.value)} error={error} prefix={<Mail className="size-4" />} className="pl-10" />
      <Button type="submit" block size="lg" variant={tab === "staff" ? "vip" : "rouge"} disabled={busy || !/^\S+@\S+\.\S+$/.test(email)}>
        {busy ? "Enviando…" : "Enviarme el link"} <ArrowRight />
      </Button>
      <p className="text-center text-xs text-muted">
        {tab === "attendee" ? "Al entrar aceptás que el organizador del evento vea tu nombre, edad y teléfono para tu entrada." : "¿Organizás tu propia fiesta? Entrá y creá el evento: quedás como dueño/a."}
      </p>
    </form>
  );
}

/** Modo Demo: elegir persona (asistentes) o rol del equipo y entrar a su pantalla. */
function DemoPicker({ tab, next }: { tab: Tab; next: string | null }) {
  const { state, setCurrentUser, startNewPersona } = useRouge();
  const router = useRouter();
  const ev = state.active_event_id;
  const staffOf = (p: Profile) => staffRoleOf(state, ev, p.id);
  const enter = (p: Profile) => {
    setCurrentUser(p.id);
    router.push(destinationFor({ ...state, current_user_id: p.id }, ev, p.id, next));
  };

  if (tab === "staff") {
    const team = state.profiles
      .map((p) => ({ p, role: staffOf(p) }))
      .filter((x): x is { p: Profile; role: StaffRole } => !!x.role)
      .sort((a, b) => STAFF_ROLES.indexOf(a.role) - STAFF_ROLES.indexOf(b.role));
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted">Modo Demo: elegí un rol. Con Supabase se entra por email y el rol lo asigna el dueño/a del evento.</p>
        <ul className="grid gap-2">
          {team.map(({ p, role }) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => enter(p)}
                className={cn("glass flex min-h-[72px] w-full items-center gap-4 rounded-3xl p-4 text-left transition hover:bg-white/10", p.id === state.current_user_id && "ring-1 ring-vip/60")}
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-vip/15 text-2xl" aria-hidden>
                  {ROLE_META[role].emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display font-semibold">
                    {ROLE_META[role].label} <span className="font-sans text-sm font-normal text-muted">· {p.full_name}</span>
                  </span>
                  <span className="block text-xs text-muted">{ROLE_META[role].description}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-vip" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const people = state.profiles.filter((p) => !staffOf(p));
  return (
    <div className="space-y-3">
      <SocialLoginButtons next={next} />
      <OrDivider label="o elegí una persona del demo" />
      <p className="text-xs text-muted">Modo Demo: elegí con quién entrar. Abrí otra pestaña con otra persona para simular un segundo teléfono.</p>
      <ul className="grid grid-cols-2 gap-2">
        {people.map((p) => {
          const att = getAttendee(state, ev, p.id);
          const mood = MOOD_TAGS.find((m) => m.id === att?.mood_tag);
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => enter(p)}
                className={cn("glass flex w-full flex-col items-center gap-2 rounded-3xl p-3 text-center transition hover:bg-white/10", p.id === state.current_user_id && "ring-1 ring-rouge/60")}
              >
                <Avatar profile={p} size={56} ring={p.id === state.current_user_id ? "rouge" : "none"} />
                <span className="w-full truncate text-sm font-semibold">{p.full_name.split(" ")[0]}</span>
                <span className="w-full truncate text-[11px] text-muted">{mood ? `${mood.emoji} ${mood.label}` : att ? "En el evento" : "Fuera del evento"}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <Button
        block
        variant="glass"
        onClick={() => {
          startNewPersona();
          router.push(`/onboarding${next ? `?next=${encodeURIComponent(next)}` : ""}`);
        }}
      >
        <UserRoundPlus /> Crear un perfil nuevo
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
        <Sparkles className="size-3.5 text-rouge" /> Tu perfil es tuyo: sirve para todas las fiestas.
      </p>
    </div>
  );
}
