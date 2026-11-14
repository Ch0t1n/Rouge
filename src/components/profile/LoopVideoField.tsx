"use client";

import { useRef, useState } from "react";
import { Clapperboard, Loader2, Trash2, VolumeX } from "lucide-react";
import { formatBytes, MAX_LOOP_VIDEO_SECONDS, processLoopVideo } from "@/lib/media/compress";
import { uploadMedia } from "@/lib/media/upload";
import { useRouge } from "@/lib/store/RougeContext";
import { LoopVideo } from "@/components/media/LoopVideo";
import { Button } from "@/components/ui/button";

/** Loop corto del perfil (máx 5 s, sin audio, reproducción tipo GIF). */
export function LoopVideoField({ value, onChange }: { value: string | null; onChange: (url: string | null) => void }) {
  const { notify } = useRouge();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const onFile = async (file?: File) => {
    if (!file) return;
    setProgress(0);
    try {
      const res = await processLoopVideo(file, setProgress);
      const url = await uploadMedia(res.file, "loop");
      onChange(url);
      notify({
        tone: "squad",
        title: "🎬 Loop listo",
        description: res.transcoded ? `${res.duration.toFixed(1)} s · ${formatBytes(file.size)} → ${formatBytes(res.file.size)} · sin audio` : `${res.duration.toFixed(1)} s · se reproduce siempre sin audio`,
      });
    } catch (e) {
      notify({ tone: "error", title: e instanceof Error ? e.message : "No pudimos procesar el video." });
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative aspect-card w-28 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-surface-raised">
        {value ? (
          <LoopVideo url={value} className="absolute inset-0 size-full" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted/60">
            {progress !== null ? <Loader2 className="size-6 animate-spin text-rouge" /> : <Clapperboard className="size-7" />}
          </div>
        )}
        {progress !== null && (
          <div className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-rouge transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm text-muted">
          Hasta {MAX_LOOP_VIDEO_SECONDS} segundos. Se reproduce en bucle, como un GIF.{" "}
          <span className="inline-flex items-center gap-1 text-primary/80">
            <VolumeX className="size-3.5" /> Sin audio.
          </span>
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant={value ? "glass" : "outline"} disabled={progress !== null} onClick={() => input.current?.click()}>
            {progress !== null ? "Procesando…" : value ? "Cambiar" : "Subir loop"}
          </Button>
          {value && progress === null && (
            <Button size="sm" variant="ghost" onClick={() => onChange(null)} aria-label="Quitar loop">
              <Trash2 />
            </Button>
          )}
        </div>
      </div>
      <input ref={input} type="file" accept="video/*" hidden onChange={(e) => onFile(e.target.files?.[0])} data-testid="video-input" />
    </div>
  );
}
