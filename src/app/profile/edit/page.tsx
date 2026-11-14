"use client";

import * as C from "@/lib/store/commands";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import type { Gender, MusicGenre, ProfilePhoto } from "@/lib/types";
import { upsertProfile } from "@/lib/engine/actions";
import { BIO_MAX, GENDER_OPTIONS, checkBirthDate, checkUsername, cleanUsername, formatPhone } from "@/lib/engine/profile";
import { discardMedia } from "@/lib/media/upload";
import { useRouge } from "@/lib/store/RougeContext";
import { useRequireProfile } from "@/lib/store/hooks";
import { normalizePhone } from "@/lib/utils";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Segmented, TextAreaField, TextField } from "@/components/ui/field";
import { PhotoSlots } from "@/components/profile/PhotoSlots";
import { LoopVideoField } from "@/components/profile/LoopVideoField";
import { GenrePicker } from "@/components/profile/GenrePicker";
import { SpotifyField } from "@/components/profile/SpotifyField";
import { PhoneField } from "@/components/profile/PhoneField";

export default function EditProfilePage() {
  const me = useRequireProfile();
  if (!me) return null;
  return <EditForm key={me.id} />;
}

function EditForm() {
  const { state, exec, notify } = useRouge();
  const router = useRouter();
  const me = state.profiles.find((p) => p.id === state.current_user_id)!;

  const [fullName, setFullName] = useState(me.full_name);
  const [username, setUsername] = useState(me.username);
  const [birthDate, setBirthDate] = useState(me.birth_date);
  const [gender, setGender] = useState<Gender>(me.gender);
  const [phone, setPhone] = useState(me.phone_normalized ? formatPhone(me.phone_normalized) : "");
  const [photos, setPhotos] = useState<ProfilePhoto[]>(me.photos);
  const [loop, setLoop] = useState<string | null>(me.loop_video_url);
  const [bio, setBio] = useState(me.bio);
  const [genres, setGenres] = useState<MusicGenre[]>(me.music_genres);
  const [spotify, setSpotify] = useState(me.spotify_embed_url ?? "");

  const usernameCheck = checkUsername(state, username, me.id);
  const birthError = checkBirthDate(birthDate);
  const phoneNorm = phone.trim() ? normalizePhone(phone) : null;

  const dirty = useMemo(
    () =>
      fullName !== me.full_name ||
      username !== me.username ||
      birthDate !== me.birth_date ||
      gender !== me.gender ||
      phoneNorm !== me.phone_normalized ||
      JSON.stringify(photos) !== JSON.stringify(me.photos) ||
      loop !== me.loop_video_url ||
      bio !== me.bio ||
      JSON.stringify(genres) !== JSON.stringify(me.music_genres) ||
      (spotify.trim() || null) !== me.spotify_embed_url,
    [fullName, username, birthDate, gender, phoneNorm, photos, loop, bio, genres, spotify, me],
  );

  const valid = fullName.trim() && usernameCheck.ok && !birthError && !!phoneNorm && photos.length >= 1 && genres.length >= 1 && bio.length <= BIO_MAX;

  const save = async () => {
    const r = await exec(
      C.upsertProfile(me.id, {
        full_name: fullName,
        username,
        birth_date: birthDate,
        gender,
        phone,
        photos,
        loop_video_url: loop,
        bio,
        music_genres: genres,
        spotify_embed_url: spotify.trim() || null,
      }),
    );
    if (!r.ok) return;
    // Limpia media local que dejó de usarse
    const kept = new Set([...photos.map((p) => p.url), loop]);
    [...me.photos.map((p) => p.url), me.loop_video_url].forEach((u) => u && !kept.has(u) && discardMedia(u));
    notify({ tone: "squad", title: "Perfil actualizado ✓" });
    router.push("/profile");
  };

  return (
    <main className="pb-32">
      <PageHeader title="Editar perfil" subtitle="Se guarda para todas tus fiestas" backHref="/profile" />
      <div className="space-y-8 px-5 pt-2">
        <section className="space-y-3">
          <h2 className="text-base">Fotos</h2>
          <PhotoSlots photos={photos} onChange={setPhotos} />
          {photos.length === 0 && <p className="text-xs text-rouge">Necesitás al menos 1 foto.</p>}
        </section>

        <section className="space-y-3">
          <h2 className="text-base">Loop de 5 segundos</h2>
          <LoopVideoField value={loop} onChange={setLoop} />
        </section>

        <section className="space-y-5">
          <h2 className="text-base">Sobre vos</h2>
          <TextField label="Nombre" value={fullName} maxLength={60} onChange={(e) => setFullName(e.target.value)} error={!fullName.trim() ? "Ingresá tu nombre." : null} />
          <TextField
            label="@username"
            prefix="@"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={21}
            value={username}
            onChange={(e) => setUsername(cleanUsername(e.target.value))}
            error={usernameCheck.ok ? null : usernameCheck.error}
          />
          <TextAreaField label="Bio corta" value={bio} maxLength={BIO_MAX} onChange={(e) => setBio(e.target.value)} placeholder="Contá qué te hace bailar…" />
          <TextField label="Fecha de nacimiento" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} error={birthError} />
          <Segmented label="Género" options={GENDER_OPTIONS} value={gender} onChange={setGender} />
          <PhoneField value={phone} onChange={setPhone} />
        </section>

        <section className="space-y-4">
          <h2 className="text-base">Música</h2>
          <GenrePicker value={genres} onChange={setGenres} />
          <SpotifyField value={spotify} onChange={setSpotify} />
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-white/10 bg-background/90 px-5 pb-[max(1rem,var(--safe-bottom))] pt-3 backdrop-blur-xl">
        <Button block size="lg" onClick={save} disabled={!dirty || !valid}>
          <Save /> {dirty ? "Guardar cambios" : "Sin cambios"}
        </Button>
      </div>
    </main>
  );
}
