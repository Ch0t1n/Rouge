"use client";

import * as C from "@/lib/store/commands";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import type { EventKind, MusicGenre, ProfilePhoto } from "@/lib/types";
import { BIO_MAX } from "@/lib/engine/profile";
import { PERSONA_LABEL_MAX, vertical } from "@/lib/engine/verticals";
import { useRouge } from "@/lib/store/RougeContext";
import { useRequireProfile } from "@/lib/store/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import { PhotoSlots } from "@/components/profile/PhotoSlots";
import { GenrePicker } from "@/components/profile/GenrePicker";
import { SpotifyField } from "@/components/profile/SpotifyField";
import { CorporateProfileFields, draftFrom, draftToInput, draftValid } from "@/components/pro/CorporateProfileFields";
import { proFontVars } from "@/components/pro/fonts";

export default function EditPersonaPage() {
  return (
    <Suspense>
      <Gate />
    </Suspense>
  );
}

function Gate() {
  const me = useRequireProfile();
  const params = useSearchParams();
  if (!me) return null;
  const id = params.get("id");
  return <PersonaForm key={id ?? params.get("kind") ?? "new"} />;
}

/** Editor de un perfil adicional (profesional o de la noche). `?id=` edita, `?kind=` crea, `?next=` vuelve. */
function PersonaForm() {
  const { state, exec, notify } = useRouge();
  const router = useRouter();
  const params = useSearchParams();
  const me = state.profiles.find((p) => p.id === state.current_user_id)!;
  const existing = state.profile_personas.find((p) => p.id === params.get("id") && p.user_id === me.id);
  const kind: EventKind = existing?.kind ?? (params.get("kind") === "nightlife" ? "nightlife" : "corporate");
  const next = params.get("next");
  const back = next && next.startsWith("/") ? next : "/profile/personas";
  const pro = kind === "corporate";

  const [label, setLabel] = useState(existing?.label ?? (pro ? "Trabajo" : "Noche"));
  const [displayName, setDisplayName] = useState(existing?.display_name ?? me.full_name);
  const [bio, setBio] = useState(existing?.bio ?? "");
  const [photos, setPhotos] = useState<ProfilePhoto[]>(existing?.photos ?? []);
  const [genres, setGenres] = useState<MusicGenre[]>(existing?.music_genres ?? me.music_genres);
  const [spotify, setSpotify] = useState(existing?.spotify_embed_url ?? "");
  // [v1.10] Profesional: la ficha ejecutiva completa (mismos campos que el panel rápido del ingreso).
  const [draft, setDraft] = useState(() => draftFrom(existing, me.full_name));

  const valid = pro ? draftValid(draft) : !!displayName.trim() && bio.length <= BIO_MAX && genres.length >= 1;

  const save = async () => {
    const r = await exec(
      pro
        ? C.upsertPersona(me.id, draftToInput(draft, existing?.id))
        : C.upsertPersona(me.id, { id: existing?.id, kind, label, display_name: displayName, bio, photos, music_genres: genres, spotify_embed_url: spotify.trim() || null }),
    );
    if (!r.ok) return;
    notify({ tone: "squad", title: existing ? "Perfil actualizado ✓" : `Perfil "${r.data.label}" creado ✓`, description: pro ? "Elegilo al entrar a un evento corporativo." : undefined });
    router.push(back);
  };

  const remove = async () => {
    if (!existing || !window.confirm(`¿Borrar el perfil "${existing.label}"? En los eventos donde lo usaste te van a ver solo con tu nombre.`)) return;
    const r = await exec(C.deletePersona(me.id, existing.id));
    if (!r.ok) return;
    notify({ tone: "squad", title: "Perfil borrado" });
    router.push("/profile/personas");
  };

  const examples = useMemo(() => (pro ? "Ej. Trabajo, Mi pyme, Consultora" : "Ej. Noche techno, Cumbia"), [pro]);

  return (
    <main className="pb-32">
      <PageHeader
        title={existing ? `Editar "${existing.label}"` : pro ? "Nuevo perfil profesional" : "Nuevo perfil para la noche"}
        subtitle={pro ? `${vertical("corporate").copy.brand} · eventos de empresas, pymes y networking` : "ROUGE · fiestas y boliches"}
        backHref={back}
      />
      <div className="space-y-8 px-5 pt-2">
        {pro ? (
          // [v1.10] Ficha ejecutiva (ROUGE Pro): mismos campos y estética que el panel rápido del ingreso.
          <section className={`${proFontVars} rounded-3xl border border-pro-line bg-pro-slate p-4 text-white`}>
            <CorporateProfileFields value={draft} onChange={setDraft} showLabel />
            <p className="mt-4 text-xs text-pro-mist">Estas fotos y datos NO se mezclan con tu perfil de la noche.</p>
          </section>
        ) : (
          <>
            <section className="space-y-5">
              <TextField label="Nombre del perfil (solo lo ves vos)" value={label} maxLength={PERSONA_LABEL_MAX} placeholder={examples} onChange={(e) => setLabel(e.target.value)} />
              <TextField label="Nombre que ven los demás" value={displayName} maxLength={60} onChange={(e) => setDisplayName(e.target.value)} error={!displayName.trim() ? "Ingresá un nombre." : null} />
            </section>
            <section className="space-y-3">
              <h2 className="text-base">Fotos</h2>
              <PhotoSlots photos={photos} onChange={setPhotos} />
              <p className="text-xs text-muted">Fotos solo para este perfil.</p>
            </section>
            <section className="space-y-5">
              <TextAreaField label="Bio corta" value={bio} maxLength={BIO_MAX} onChange={(e) => setBio(e.target.value)} placeholder="Contá qué te hace bailar…" />
              <h2 className="text-base">Música</h2>
              <GenrePicker value={genres} onChange={setGenres} />
              <SpotifyField value={spotify} onChange={setSpotify} />
            </section>
          </>
        )}

        {existing && (
          <button type="button" onClick={remove} className="flex min-h-touch w-full items-center justify-center gap-2 rounded-2xl border border-white/10 text-sm font-semibold text-muted hover:text-primary">
            <Trash2 className="size-4" /> Borrar este perfil
          </button>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-white/10 bg-background/90 px-5 pb-[max(1rem,var(--safe-bottom))] pt-3 backdrop-blur-xl">
        <Button block size="lg" onClick={save} disabled={!valid}>
          <Save /> {existing ? "Guardar cambios" : "Crear perfil"}
        </Button>
      </div>
    </main>
  );
}
