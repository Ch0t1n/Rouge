"use client";

import * as C from "@/lib/store/commands";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import { BUSINESS_NEEDS, INDUSTRIES, type BusinessNeed, type EventKind, type Industry, type MusicGenre, type ProfilePhoto } from "@/lib/types";
import { BIO_MAX } from "@/lib/engine/profile";
import { COMPANY_MAX, JOB_TITLE_MAX, NEEDS_MAX, OFFERABLE_NEEDS, PERSONA_LABEL_MAX, parseLinkedin, vertical } from "@/lib/engine/verticals";
import { useRouge } from "@/lib/store/RougeContext";
import { useRequireProfile } from "@/lib/store/hooks";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import { PhotoSlots } from "@/components/profile/PhotoSlots";
import { GenrePicker } from "@/components/profile/GenrePicker";
import { SpotifyField } from "@/components/profile/SpotifyField";

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
  const [jobTitle, setJobTitle] = useState(existing?.job_title ?? "");
  const [company, setCompany] = useState(existing?.company ?? "");
  const [industry, setIndustry] = useState<Industry | null>(existing?.industry ?? null);
  const [looking, setLooking] = useState<BusinessNeed[]>(existing?.looking_for ?? []);
  const [offering, setOffering] = useState<BusinessNeed[]>(existing?.offering ?? []);
  const [linkedin, setLinkedin] = useState(existing?.linkedin_url ?? "");
  const [genres, setGenres] = useState<MusicGenre[]>(existing?.music_genres ?? me.music_genres);
  const [spotify, setSpotify] = useState(existing?.spotify_embed_url ?? "");

  const linkedinError = linkedin.trim() && !parseLinkedin(linkedin) ? "Pegá el link de tu perfil (linkedin.com/in/…)." : null;
  const proMissing = pro && (!jobTitle.trim() && !company.trim() ? "Contá tu cargo o tu empresa." : !looking.length && !offering.length ? "Elegí algo que buscás u ofrecés." : null);
  const valid = !!displayName.trim() && bio.length <= BIO_MAX && !linkedinError && !proMissing && (pro || genres.length >= 1);

  const toggle = (list: BusinessNeed[], set: (v: BusinessNeed[]) => void, n: BusinessNeed) =>
    set(list.includes(n) ? list.filter((x) => x !== n) : list.length >= NEEDS_MAX ? list : [...list, n]);

  const save = async () => {
    const r = await exec(
      C.upsertPersona(me.id, {
        id: existing?.id,
        kind,
        label,
        display_name: displayName,
        bio,
        photos,
        ...(pro
          ? { job_title: jobTitle, company, industry, looking_for: looking, offering, linkedin_url: linkedin.trim() || null }
          : { music_genres: genres, spotify_embed_url: spotify.trim() || null }),
      }),
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
        <section className="space-y-5">
          <TextField label="Nombre del perfil (solo lo ves vos)" value={label} maxLength={PERSONA_LABEL_MAX} placeholder={examples} onChange={(e) => setLabel(e.target.value)} />
          <TextField label="Nombre que ven los demás" value={displayName} maxLength={60} onChange={(e) => setDisplayName(e.target.value)} error={!displayName.trim() ? "Ingresá un nombre." : null} />
        </section>

        <section className="space-y-3">
          <h2 className="text-base">{pro ? "Foto profesional" : "Fotos"}</h2>
          <PhotoSlots photos={photos} onChange={setPhotos} />
          <p className="text-xs text-muted">{pro ? "Con una foto clara de tu cara alcanza. Estas fotos NO se mezclan con las de tu perfil de la noche." : "Fotos solo para este perfil."}</p>
        </section>

        {pro ? (
          <>
            <section className="space-y-5">
              <h2 className="text-base">Tu trabajo</h2>
              <TextField label="Cargo" value={jobTitle} maxLength={JOB_TITLE_MAX} placeholder="Ej. Dueña, Gerente comercial, Fundador" onChange={(e) => setJobTitle(e.target.value)} />
              <TextField label="Empresa" value={company} maxLength={COMPANY_MAX} placeholder="Ej. Textil Norte" onChange={(e) => setCompany(e.target.value)} />
              <ChipGroup title="Rubro">
                {INDUSTRIES.map((i) => (
                  <Chip key={i.id} on={industry === i.id} onClick={() => setIndustry(industry === i.id ? null : i.id)}>
                    {i.label}
                  </Chip>
                ))}
              </ChipGroup>
            </section>
            <section className="space-y-5">
              <h2 className="text-base">Qué buscás y qué ofrecés</h2>
              <p className="-mt-3 text-xs text-muted">Te recomendamos con quién hablar cruzando lo que buscás con lo que ofrecen los demás (hasta {NEEDS_MAX} de cada uno).</p>
              <ChipGroup title={`Busco · ${looking.length}/${NEEDS_MAX}`}>
                {BUSINESS_NEEDS.map((n) => (
                  <Chip key={n.id} tone="vip" on={looking.includes(n.id)} onClick={() => toggle(looking, setLooking, n.id)}>
                    {n.emoji} {n.label}
                  </Chip>
                ))}
              </ChipGroup>
              <ChipGroup title={`Ofrezco · ${offering.length}/${NEEDS_MAX}`}>
                {OFFERABLE_NEEDS.map((n) => (
                  <Chip key={n.id} tone="squad" on={offering.includes(n.id)} onClick={() => toggle(offering, setOffering, n.id)}>
                    {n.emoji} {n.label}
                  </Chip>
                ))}
              </ChipGroup>
              {proMissing && <p className="text-xs text-rouge">{proMissing}</p>}
            </section>
            <section className="space-y-5">
              <TextAreaField label="En una frase" value={bio} maxLength={BIO_MAX} onChange={(e) => setBio(e.target.value)} placeholder="Qué hace tu empresa y con quién te gustaría hablar hoy." />
              <TextField label="LinkedIn (opcional)" value={linkedin} autoCapitalize="none" spellCheck={false} placeholder="linkedin.com/in/tu-nombre" onChange={(e) => setLinkedin(e.target.value)} error={linkedinError} />
            </section>
          </>
        ) : (
          <section className="space-y-5">
            <TextAreaField label="Bio corta" value={bio} maxLength={BIO_MAX} onChange={(e) => setBio(e.target.value)} placeholder="Contá qué te hace bailar…" />
            <h2 className="text-base">Música</h2>
            <GenrePicker value={genres} onChange={setGenres} />
            <SpotifyField value={spotify} onChange={setSpotify} />
          </section>
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

function ChipGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 font-display text-[13px] font-semibold text-primary">{title}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children, tone = "rouge" }: { on: boolean; onClick: () => void; children: React.ReactNode; tone?: "rouge" | "vip" | "squad" }) {
  const onCls = tone === "vip" ? "border-vip bg-vip/15 text-primary" : tone === "squad" ? "border-squad bg-squad/15 text-primary" : "border-rouge bg-rouge/15 text-primary";
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn("min-h-[40px] rounded-full border px-3.5 text-sm font-semibold transition", on ? onCls : "border-white/15 bg-white/[0.04] text-primary/85")}>
      {children}
    </button>
  );
}
