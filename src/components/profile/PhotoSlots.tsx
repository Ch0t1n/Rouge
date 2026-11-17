"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import * as C from "@/lib/store/commands";
import { SOCIAL, startInstagram } from "@/lib/social/client";
import { InstagramPhotoPicker } from "@/components/social/InstagramPhotoPicker";
import { InstagramIcon } from "@/components/ui/brand-icons";
import { Button } from "@/components/ui/button";
import type { ProfilePhoto } from "@/lib/types";
import { MAX_PHOTOS } from "@/lib/engine/profile";
import { averageColor, compressImage, formatBytes, imageSize } from "@/lib/media/compress";
import { uploadMedia } from "@/lib/media/upload";
import { useRouge } from "@/lib/store/RougeContext";
import { MediaImage } from "@/components/media/MediaImage";
import { PhotoCropper } from "@/components/profile/PhotoCropper";
import { cn } from "@/lib/utils";

/**
 * Hasta 4 fotos, SIEMPRE verticales 3:4. Al subir, cada una pasa por el encuadre (`PhotoCropper`): la persona elige
 * qué parte se ve; la app nunca recorta sola. Después se comprime en el cliente a WebP (~250 KB) ANTES de subir y se
 * muestra el ahorro para que el usuario lo entienda.
 */
export function PhotoSlots({ photos, onChange }: { photos: ProfilePhoto[]; onChange: (p: ProfilePhoto[]) => void }) {
  const { notify, state, mode, exec } = useRouge();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [picker, setPicker] = useState(false);
  const latest = useRef(photos);
  latest.current = photos;
  const me = state.current_user_id;
  const igLink = state.instagram_links.find((l) => l.user_id === me);

  /** Sin Instagram conectado: en demo se simula; con Supabase va al OAuth y vuelve a esta misma pantalla. */
  const connectInstagram = async () => {
    if (mode === "demo") {
      const suggestion = state.profiles.find((p) => p.id === me)?.username ?? `noche.${Math.floor(100 + Math.random() * 900)}`;
      const r = await exec(C.linkInstagramDemo(me, suggestion));
      if (r.ok) setPicker(true);
      return;
    }
    const err = await startInstagram("link", window.location.pathname + window.location.search);
    if (err) notify({ tone: "error", title: err });
  };

  /** Fotos elegidas que esperan su encuadre (de a una). */
  const [queue, setQueue] = useState<File[]>([]);
  const batch = useRef({ total: 0, done: 0 });
  const savings = useRef({ before: 0, after: 0, pending: 0 });

  /** Del teléfono o de Instagram: cada foto pasa primero por el encuadre vertical (la elige la persona). */
  const onFiles = (files: FileList | File[] | null) => {
    if (!files?.length) return;
    const free = MAX_PHOTOS - latest.current.length - busy - queue.length;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, Math.max(0, free));
    if (files.length > list.length) notify({ tone: "info", title: `Máximo ${MAX_PHOTOS} fotos`, description: list.length ? `Se agregan solo ${list.length}.` : "Borrá una para sumar otra." });
    if (input.current) input.current.value = "";
    if (!list.length) return;
    if (!queue.length) batch.current = { total: 0, done: 0 };
    batch.current.total += list.length;
    setQueue((q) => [...q, ...list]);
  };

  const next = () => {
    batch.current.done += 1;
    setQueue((q) => q.slice(1));
  };

  /** Foto ya encuadrada → WebP liviano → Storage (o IndexedDB en demo). */
  const upload = async (original: File, cropped: File) => {
    next();
    setBusy((b) => b + 1);
    savings.current.pending += 1;
    try {
      const compressed = await compressImage(cropped, "profile");
      const [blur_color, size, url] = await Promise.all([averageColor(compressed), imageSize(compressed), uploadMedia(compressed, "photo")]);
      savings.current.before += original.size;
      savings.current.after += compressed.size;
      const updated = [...latest.current, { url, blur_color, ...size }];
      latest.current = updated;
      onChange(updated);
    } catch (e) {
      notify({ tone: "error", title: "No pudimos procesar esa foto", description: e instanceof Error && /imagen/.test(e.message) ? e.message : "Probá con JPG o PNG." });
    } finally {
      setBusy((b) => b - 1);
      const sv = savings.current;
      sv.pending -= 1;
      if (sv.pending === 0 && sv.after) {
        notify({ tone: "squad", title: "📶 Fotos optimizadas para la pista", description: `${formatBytes(sv.before)} → ${formatBytes(sv.after)}. Cargan al instante con poca señal.` });
        savings.current = { before: 0, after: 0, pending: 0 };
      }
    }
  };

  const remove = (i: number) => onChange(photos.filter((_, j) => j !== i));
  const makeMain = (i: number) => onChange([photos[i], ...photos.filter((_, j) => j !== i)]);
  const slots = Array.from({ length: MAX_PHOTOS }, (_, i) => i);

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {slots.map((i) => {
          const p = photos[i];
          if (p) {
            return (
              <div key={p.url} className="group relative aspect-card overflow-hidden rounded-2xl border border-white/10">
                <MediaImage photo={p} className="absolute inset-0" alt={`Foto ${i + 1}`} />
                <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-gradient-to-t from-black/90 to-transparent p-1.5 pt-6">
                  {i === 0 ? (
                    <span className="glass-pill inline-flex items-center gap-1 text-vip">
                      <Star className="size-3 fill-current" /> Principal
                    </span>
                  ) : (
                    <button type="button" onClick={() => makeMain(i)} className="glass-pill inline-flex min-h-[32px] items-center gap-1" aria-label={`Usar foto ${i + 1} como principal`}>
                      <Star className="size-3" /> Principal
                    </button>
                  )}
                  <button type="button" onClick={() => remove(i)} aria-label={`Eliminar foto ${i + 1}`} className="grid size-8 place-items-center rounded-full bg-black/60 text-primary hover:text-rouge">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            );
          }
          const isNext = i === photos.length;
          const showSpinner = i >= photos.length && i < photos.length + busy;
          return (
            <button
              key={`empty-${i}`}
              type="button"
              disabled={!isNext || busy > 0 || queue.length > 0}
              onClick={() => input.current?.click()}
              className={cn(
                "flex aspect-card flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-sm transition",
                isNext && !busy ? "border-rouge/50 bg-rouge/[0.06] text-primary hover:bg-rouge/10" : "border-white/10 text-muted/50",
              )}
              aria-label={isNext ? "Agregar foto" : `Espacio de foto ${i + 1}`}
            >
              {showSpinner ? (
                <>
                  <Loader2 className="size-6 animate-spin text-rouge" />
                  <span className="text-xs text-muted">Comprimiendo…</span>
                </>
              ) : (
                <>
                  <ImagePlus className={cn("size-6", isNext && "text-rouge")} />
                  {isNext && <span className="font-display font-semibold">{i === 0 ? "Foto principal" : "Agregar"}</span>}
                </>
              )}
            </button>
          );
        })}
      </div>
      {(igLink || SOCIAL.instagram) && (
        <Button type="button" variant="glass" block className="mt-3" disabled={busy > 0} onClick={() => (igLink ? setPicker(true) : connectInstagram())}>
          <InstagramIcon className="text-rouge" /> {igLink ? `Importar de Instagram · @${igLink.username}` : "Conectar Instagram e importar fotos"}
        </Button>
      )}
      <InstagramPhotoPicker open={picker} onClose={() => setPicker(false)} max={MAX_PHOTOS - photos.length} username={igLink?.username} onPicked={(files) => onFiles(files)} />
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} data-testid="photo-input" />
      <PhotoCropper
        key={batch.current.done}
        file={queue[0] ?? null}
        position={batch.current.done + 1}
        total={batch.current.total}
        onDone={(cropped) => queue[0] && upload(queue[0], cropped)}
        onCancel={next}
      />
    </div>
  );
}
