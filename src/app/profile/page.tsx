"use client";

import Link from "next/link";
import { Check, ChevronRight, Lock, PencilLine, QrCode, ShieldCheck } from "lucide-react";
import { useShare } from "@/components/share/ShareSheet";
import { formatPhone, profileCompleteness } from "@/lib/engine/profile";
import { getAttendee } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { useRequireProfile } from "@/lib/store/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProfileView } from "@/components/profile/ProfileView";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/brand";

export default function MyProfilePage() {
  const { state, mode, signOut } = useRouge();
  const me = useRequireProfile();
  const shareSheet = useShare();
  if (!me) return null;
  const att = getAttendee(state, state.active_event_id, me.id);
  const { percent, items } = profileCompleteness(me);

  const share = () => shareSheet.open({ url: `/u/${me.username}`, title: `@${me.username} en ${APP_NAME}`, text: `Encontrame en ${APP_NAME}: @${me.username} ✨`, fileName: `rouge-pass-${me.username}`, accent: "rouge", caption: `@${me.username}` });

  return (
    <main className="pb-12">
      {shareSheet.sheet}
      <PageHeader
        title="Mi perfil"
        subtitle="Así te ven los demás asistentes"
        backHref="/app"
        action={
          <button type="button" onClick={share} aria-label="QR de mi perfil" className="grid size-11 place-items-center rounded-full hover:bg-white/5">
            <QrCode className="size-5" />
          </button>
        }
      />
      <div className="space-y-5 px-4">
        <ProfileView
          profile={me}
          mood={att?.mood_tag}
          actions={
            <div className="grid grid-cols-2 gap-2">
              <Link href="/profile/edit" className={buttonVariants({ variant: "rouge" })}>
                <PencilLine /> Editar perfil
              </Link>
              <Link href="/settings/privacy" className={buttonVariants({ variant: "glass" })}>
                <ShieldCheck /> Privacidad
              </Link>
            </div>
          }
        />

        {percent < 100 && (
          <section className="glass rounded-3xl p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base">Completá tu perfil</h2>
              <span className="metric text-xl text-rouge">{percent}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-rouge shadow-glow-rouge" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">Los perfiles completos aparecen más arriba en la grilla y reciben más conexiones.</p>
            <ul className="mt-3 space-y-1">
              {items.map((it) => (
                <li key={it.key}>
                  <Link href="/profile/edit" className={cn("flex min-h-touch items-center gap-3 rounded-xl px-2 text-sm", it.done ? "text-muted line-through" : "text-primary hover:bg-white/5")}>
                    <span className={cn("grid size-6 place-items-center rounded-full", it.done ? "bg-squad text-background" : "border border-white/20")}>{it.done && <Check className="size-3.5" />}</span>
                    <span className="flex-1">{it.label}</span>
                    {!it.done && <ChevronRight className="size-4 text-muted" />}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {mode === "supabase" && (
          <button type="button" onClick={() => void signOut()} className="w-full rounded-2xl border border-white/10 py-3 text-sm font-semibold text-muted hover:text-primary">
            Cerrar sesión
          </button>
        )}
        <section className="glass flex items-center gap-3 rounded-2xl p-4 text-sm">
          <Lock className="size-5 shrink-0 text-muted" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Datos privados</p>
            <p className="text-xs text-muted">
              {me.phone_normalized ? formatPhone(me.phone_normalized) : "Sin teléfono"} · solo vos y el organizador (para tu entrada) lo ven
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
