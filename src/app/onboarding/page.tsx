"use client";

import * as C from "@/lib/store/commands";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeNext } from "@/lib/engine/roles";
import { ArrowRight, ChevronLeft, PartyPopper, ShieldCheck } from "lucide-react";
import type { Gender, MusicGenre, ProfilePhoto } from "@/lib/types";
import { upsertProfile } from "@/lib/engine/actions";
import { BIO_MAX, GENDER_OPTIONS, checkBirthDate, checkUsername, cleanUsername } from "@/lib/engine/profile";
import { getProfile } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { normalizePhone, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Segmented, TextAreaField, TextField } from "@/components/ui/field";
import { PhoneField } from "@/components/profile/PhoneField";
import { PhotoSlots } from "@/components/profile/PhotoSlots";
import { LoopVideoField } from "@/components/profile/LoopVideoField";
import { GenrePicker } from "@/components/profile/GenrePicker";
import { SpotifyField } from "@/components/profile/SpotifyField";
import { BlacklistManager } from "@/components/profile/BlacklistManager";

const STEPS = [
  { title: "Quién sos", subtitle: "Tu perfil se crea una sola vez y sirve para todas las fiestas." },
  { title: "Tu mejor versión", subtitle: "Hasta 4 fotos y un loop de 5 segundos." },
  { title: "Lo que te hace bailar", subtitle: "Con esto calculamos tu afinidad con cada asistente." },
  { title: "Tu noche, tus reglas", subtitle: "Bloqueá de antemano a quien no querés cruzarte." },
] as const;

export default function OnboardingPage() {
  return (
    <Suspense>
      <Onboarding />
    </Suspense>
  );
}

function Onboarding() {
  const { state, exec, notify, mode, signedIn } = useRouge();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next")) ?? "/app";
  const meId = state.current_user_id;
  const existing = getProfile(state, meId);

  // Supabase: el perfil se crea con el id de la sesión (auth.uid()).
  useEffect(() => {
    if (mode === "supabase" && !signedIn) router.replace(`/login?next=${encodeURIComponent(`/onboarding${next !== "/app" ? `?next=${next}` : ""}`)}`);
  }, [mode, signedIn, router, next]);

  // Si ya tenía perfil al entrar, no repetimos el onboarding.
  const hadProfileOnMount = useRef(!!existing);
  useEffect(() => {
    if (hadProfileOnMount.current) router.replace("/profile/edit");
  }, [router]);

  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState(existing?.full_name ?? "");
  const [username, setUsername] = useState(existing?.username ?? "");
  const [birthDate, setBirthDate] = useState(existing?.birth_date ?? "");
  const [gender, setGender] = useState<Gender>(existing?.gender ?? "undisclosed");
  const [phone, setPhone] = useState("");
  const [photos, setPhotos] = useState<ProfilePhoto[]>(existing?.photos ?? []);
  const [loop, setLoop] = useState<string | null>(existing?.loop_video_url ?? null);
  const [bio, setBio] = useState(existing?.bio ?? "");
  const [genres, setGenres] = useState<MusicGenre[]>(existing?.music_genres ?? []);
  const [spotify, setSpotify] = useState(existing?.spotify_embed_url ?? "");
  const [touched, setTouched] = useState(false);

  if (hadProfileOnMount.current) return null;

  const usernameCheck = username ? checkUsername(state, username, meId) : null;
  const birthError = birthDate ? checkBirthDate(birthDate) : null;
  const phoneOk = !!normalizePhone(phone) || !!existing?.phone_normalized;

  const stepValid = [
    fullName.trim().length > 0 && usernameCheck?.ok === true && !!birthDate && !birthError && phoneOk,
    photos.length >= 1 && bio.length <= BIO_MAX,
    genres.length >= 1,
    true,
  ][step];

  const save = async () => {
    setTouched(true);
    if (!stepValid) return false;
    const input =
      step === 0
        ? { full_name: fullName, username, birth_date: birthDate, gender, ...(phone ? { phone } : {}) }
        : step === 1
          ? { photos, loop_video_url: loop, bio }
          : step === 2
            ? { music_genres: genres, spotify_embed_url: spotify.trim() || null }
            : {};
    const r = await exec(C.upsertProfile(meId, input));
    return r.ok;
  };

  const advance = async () => {
    if (!(await save())) return;
    setTouched(false);
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      window.scrollTo({ top: 0 });
    } else {
      notify({ tone: "rouge", title: `¡Listo, ${fullName.split(" ")[0]}! 🔥`, description: "Tu perfil ya está activo para todas tus fiestas." });
      router.replace(next);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="safe-top sticky top-0 z-30 bg-background/85 px-4 pb-3 pt-3 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={step === 0 ? "Salir" : "Paso anterior"}
            onClick={() => (step === 0 ? router.push("/login") : setStep(step - 1))}
            className="-ml-2 grid size-11 place-items-center rounded-full hover:bg-white/5"
          >
            <ChevronLeft className="size-6" />
          </button>
          <div className="flex flex-1 gap-1.5" aria-label={`Paso ${step + 1} de ${STEPS.length}`}>
            {STEPS.map((_, i) => (
              <span key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= step ? "bg-rouge shadow-glow-rouge" : "bg-white/10")} />
            ))}
          </div>
          <span className="w-11 text-right font-display text-xs font-semibold text-muted">
            {step + 1}/{STEPS.length}
          </span>
        </div>
      </header>

      <div className="flex-1 space-y-6 px-5 pb-32 pt-2">
        <div>
          {step === 0 && <p className="font-display text-sm font-bold tracking-tight text-rouge text-glow-rouge">BIENVENIDO A ROUGE</p>}
          <h1 className="mt-1 text-[30px] leading-[1.05]">{STEPS[step].title}</h1>
          <p className="mt-2 text-sm text-muted">{STEPS[step].subtitle}</p>
        </div>

        {step === 0 && (
          <div className="space-y-5">
            <TextField label="Nombre" autoComplete="name" placeholder="Sofía Benítez" value={fullName} maxLength={60} onChange={(e) => setFullName(e.target.value)} error={touched && !fullName.trim() ? "Ingresá tu nombre." : null} />
            <TextField
              label="@username"
              prefix="@"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="sofi.noche"
              maxLength={21}
              value={username}
              onChange={(e) => setUsername(cleanUsername(e.target.value))}
              error={username && usernameCheck && !usernameCheck.ok ? usernameCheck.error : touched && !username ? "Elegí tu @username." : null}
              hint={usernameCheck?.ok ? <span className="text-squad">✓ @{usernameCheck.value} está disponible</span> : "Es único: así te encuentran para sumarte a su Squad."}
            />
            <TextField label="Fecha de nacimiento" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} error={birthError ?? (touched && !birthDate ? "Ingresá tu fecha de nacimiento." : null)} hint="Solo mostramos tu edad. ROUGE es +18." />
            <Segmented label="Género" options={GENDER_OPTIONS} value={gender} onChange={setGender} />
            <PhoneField value={phone} onChange={setPhone} required />
            {touched && !phoneOk && <p className="-mt-3 text-xs text-rouge">Necesitamos tu teléfono para que los bloqueos funcionen.</p>}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-7">
            <PhotoSlots photos={photos} onChange={setPhotos} />
            {touched && photos.length === 0 && <p className="-mt-4 text-xs text-rouge">Subí al menos 1 foto.</p>}
            <section>
              <h2 className="mb-3 text-base">Loop de 5 segundos</h2>
              <LoopVideoField value={loop} onChange={setLoop} />
            </section>
            <TextAreaField label="Bio corta" placeholder="Si suena house, estoy en primera fila…" value={bio} maxLength={BIO_MAX} onChange={(e) => setBio(e.target.value)} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-7">
            <GenrePicker value={genres} onChange={setGenres} />
            {touched && genres.length === 0 && <p className="-mt-5 text-xs text-rouge">Elegí al menos 1 género.</p>}
            <SpotifyField value={spotify} onChange={setSpotify} />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div className="flex gap-3 rounded-2xl border border-squad/30 bg-squad/[0.06] p-4">
              <ShieldCheck className="size-6 shrink-0 text-squad" />
              <p className="text-sm text-primary/90">
                Si alguien de tu lista tiene cuenta, <b>ninguno de los dos va a ver al otro</b>: ni en la grilla, ni en búsquedas, squads o el plano. Nunca te
                decimos si el número tiene cuenta, y esa persona jamás se entera.
              </p>
            </div>
            <BlacklistManager compact />
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-white/10 bg-background/90 px-5 pb-[max(1rem,var(--safe-bottom))] pt-3 backdrop-blur-xl">
        <Button block size="lg" onClick={advance} variant={stepValid ? "rouge" : "glass"}>
          {step === STEPS.length - 1 ? (
            <>
              <PartyPopper /> Entrar a ROUGE
            </>
          ) : (
            <>
              Continuar <ArrowRight />
            </>
          )}
        </Button>
        {step === 3 && <p className="mt-2 text-center text-xs text-muted">Podés editar tu lista negra cuando quieras desde Privacidad.</p>}
      </div>
    </main>
  );
}
