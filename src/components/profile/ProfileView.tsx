"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BadgeCheck, Briefcase, Handshake, Music2 } from "lucide-react";
import type { EventType, MoodTag, Profile } from "@/lib/types";
import { moodMeta } from "@/lib/engine/eventType";
import { useEventType } from "@/lib/store/hooks";
import type { AffinityResult } from "@/lib/engine/affinity";
import { ageFrom, cn } from "@/lib/utils";
import { MediaImage } from "@/components/media/MediaImage";
import { LoopVideo } from "@/components/media/LoopVideo";
import { SpotifyEmbed } from "@/components/media/SpotifyEmbed";
import { GenreChips } from "./GenrePicker";
import { TagChips } from "./ProfessionalFields";
import { InstagramIcon, LinkedinIcon } from "@/components/ui/brand-icons";
import { instagramUrl, linkedinUrl } from "@/lib/engine/profile";

interface ProfileViewProps {
  profile: Profile;
  mood?: MoodTag | null;
  affinity?: AffinityResult | null;
  /** Botones de acción bajo la media (conectar, rompehielos, squad…) */
  actions?: ReactNode;
  className?: string;
  /** Tipo del evento (si no, el del evento activo): en uno corporativo se destaca el perfil profesional. */
  type?: EventType;
}

type Slide = { kind: "video"; url: string } | { kind: "photo"; index: number };

/** Perfil completo: carrusel tipo stories (loop + fotos), perfil profesional, bio, música y Spotify. */
export function ProfileView({ profile, mood, affinity, actions, className, type: typeProp }: ProfileViewProps) {
  const active = useEventType();
  const corporate = (typeProp ?? active.type) === "corporate";
  const work = [profile.job_title, profile.company].filter(Boolean).join(" · ");
  const slides: Slide[] = [
    ...(profile.loop_video_url ? [{ kind: "video" as const, url: profile.loop_video_url }] : []),
    ...profile.photos.map((_, index) => ({ kind: "photo" as const, index })),
  ];
  const [slide, setSlide] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const moodInfo = moodMeta(mood);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setSlide(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const next = Math.max(0, Math.min(slides.length - 1, i));
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  };

  return (
    <article className={cn("space-y-5", className)}>
      <div className="relative aspect-card overflow-hidden rounded-[28px] border border-white/10 bg-surface-raised">
        <div ref={track} className="no-scrollbar flex size-full snap-x snap-mandatory overflow-x-auto" aria-roledescription="carrusel" aria-label={`Fotos de ${profile.full_name}`}>
          {slides.length === 0 && (
            <div className="grid size-full shrink-0 place-items-center font-display text-6xl font-bold text-muted/40">
              {profile.full_name.slice(0, 1)}
            </div>
          )}
          {slides.map((s, i) => (
            <div key={i} className="relative size-full shrink-0 snap-center" aria-roledescription="diapositiva" aria-label={`${i + 1} de ${slides.length}`}>
              {s.kind === "video" ? (
                <LoopVideo url={s.url} className="absolute inset-0 size-full" />
              ) : (
                <MediaImage photo={profile.photos[s.index]} className="absolute inset-0" priority={i === 0} alt={i === 0 ? profile.full_name : ""} />
              )}
            </div>
          ))}
        </div>

        {/* Indicadores tipo stories */}
        {slides.length > 1 && (
          <div className="pointer-events-none absolute inset-x-3 top-3 flex gap-1">
            {slides.map((_, i) => (
              <span key={i} className={cn("h-1 flex-1 rounded-full transition", i === slide ? "bg-white" : "bg-white/30")} />
            ))}
          </div>
        )}
        {/* Zonas táctiles anterior/siguiente */}
        {slides.length > 1 && (
          <>
            <button type="button" aria-label="Foto anterior" onClick={() => go(slide - 1)} className="absolute inset-y-0 left-0 w-1/4" />
            <button type="button" aria-label="Foto siguiente" onClick={() => go(slide + 1)} className="absolute inset-y-0 right-0 w-1/4" />
          </>
        )}

        {affinity && (
          <span className="absolute right-3 top-6 inline-flex items-center gap-1 rounded-full bg-rouge px-2.5 py-1 font-display text-xs font-bold text-white shadow-glow-rouge">
            {corporate ? <Handshake className="size-3.5" /> : <Music2 className="size-3.5" />} {affinity.percent}% {corporate ? "en común" : "afinidad"}
          </span>
        )}

        <div className="card-fade pointer-events-none absolute inset-x-0 bottom-0 p-5 pt-24">
          {moodInfo && (
            <span className="glass-pill mb-2 inline-flex items-center gap-1">
              {moodInfo.emoji} {moodInfo.label}
            </span>
          )}
          <h2 className="flex items-center gap-2 text-[28px] leading-none">
            {profile.full_name.split(" ")[0]}
            <span className="font-sans text-2xl font-normal text-primary/80">{ageFrom(profile.birth_date)}</span>
            {profile.is_verified && <BadgeCheck className="size-6 text-squad" aria-label="Verificado" />}
          </h2>
          <p className="mt-1 text-sm text-muted">@{profile.username}</p>
          {work && (
            <p className="mt-1.5 flex items-center gap-1.5 text-sm text-primary/90">
              <Briefcase className="size-3.5 shrink-0 text-muted" aria-hidden /> <span className="truncate">{work}</span>
            </p>
          )}
        </div>
      </div>

      {actions}

      {profile.linkedin_username && (
        <a
          href={linkedinUrl(profile.linkedin_username)}
          target="_blank"
          rel="noreferrer noopener"
          className="glass flex min-h-touch items-center gap-3 rounded-2xl px-4 py-2.5 transition hover:bg-white/10"
          aria-label={`LinkedIn de ${profile.full_name.split(" ")[0]}`}
        >
          <LinkedinIcon className="size-5 shrink-0 text-squad" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display font-semibold">linkedin.com/in/{profile.linkedin_username}</span>
            <span className="block text-xs text-muted">Perfil profesional</span>
          </span>
        </a>
      )}

      {profile.instagram_username && (
        <a
          href={instagramUrl(profile.instagram_username)}
          target="_blank"
          rel="noreferrer noopener"
          className="glass flex min-h-touch items-center gap-3 rounded-2xl px-4 py-2.5 transition hover:bg-white/10"
          aria-label={`Instagram de ${profile.full_name.split(" ")[0]}: @${profile.instagram_username}${profile.instagram_verified ? " (verificado)" : " (sin verificar)"}`}
        >
          <InstagramIcon className="size-5 shrink-0 text-rouge" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display font-semibold">@{profile.instagram_username}</span>
            <span className="block text-xs text-muted">{profile.instagram_verified ? "Cuenta conectada" : "Sin verificar · lo escribió a mano"}</span>
          </span>
          {profile.instagram_verified && <BadgeCheck className="size-5 shrink-0 text-squad" aria-hidden />}
        </a>
      )}

      {profile.bio && <p className="text-[15px] leading-relaxed text-primary/90">{profile.bio}</p>}

      {profile.interests.length > 0 && (corporate || profile.music_genres.length === 0) && (
        <section>
          <h3 className="mb-2 text-sm text-muted">
            Áreas e intereses {corporate && affinity && affinity.shared.length > 0 && <span className="text-rouge">· {affinity.shared.length} en común</span>}
          </h3>
          <TagChips tags={profile.interests} shared={corporate ? affinity?.shared : undefined} />
        </section>
      )}

      {profile.music_genres.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm text-muted">
            Música {!corporate && affinity && affinity.shared.length > 0 && <span className="text-rouge">· {affinity.shared.length} en común</span>}
          </h3>
          <GenreChips genres={profile.music_genres} shared={corporate ? undefined : affinity?.shared} />
        </section>
      )}

      {profile.spotify_embed_url && (
        <section>
          <h3 className="mb-2 text-sm text-muted">Sonando en su cabeza</h3>
          <SpotifyEmbed url={profile.spotify_embed_url} />
        </section>
      )}
    </article>
  );
}
