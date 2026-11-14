"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Send } from "lucide-react";
import { compressImage } from "@/lib/media/compress";
import { uploadMedia } from "@/lib/media/upload";
import { useRouge } from "@/lib/store/RougeContext";
import { Button } from "@/components/ui/button";

/**
 * Compositor de chat: texto + foto (comprimida en el cliente antes de subir).
 * Fase 2 del producto: audios y videos cortos (el esquema ya los soporta).
 */
export function Composer({ onSend, placeholder = "Escribí un mensaje…" }: { onSend: (body: { type: "text" | "image"; content: string; mediaUrl?: string }) => boolean | Promise<boolean>; placeholder?: string }) {
  const { notify } = useRouge();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = text;
    if (!content.trim()) return;
    setText(""); // se limpia al instante (UI optimista); si falla, se restaura
    if (!(await onSend({ type: "text", content }))) setText(content);
  };

  const onPhoto = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const compressed = await compressImage(f, "chat");
      const url = await uploadMedia(compressed, "chat");
      if (await onSend({ type: "image", content: text.trim(), mediaUrl: url })) setText("");
    } catch {
      notify({ tone: "error", title: "No pudimos enviar la foto", description: "Probá con JPG o PNG." });
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  };

  return (
    <form onSubmit={submit} className="sticky bottom-0 z-20 flex items-end gap-2 border-t border-white/10 bg-background/90 px-3 pb-[max(0.75rem,var(--safe-bottom))] pt-3 backdrop-blur-xl">
      <button type="button" onClick={() => file.current?.click()} disabled={busy} aria-label="Enviar foto" className="grid size-11 shrink-0 place-items-center rounded-full bg-white/[0.06] text-primary disabled:opacity-50">
        {busy ? <Loader2 className="size-5 animate-spin text-rouge" /> : <ImagePlus className="size-5" />}
      </button>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label="Mensaje"
        maxLength={1000}
        className="min-h-touch flex-1 rounded-full border border-white/10 bg-white/[0.05] px-4 text-[15px] placeholder:text-muted/60 focus:border-rouge/50 focus:outline-none"
      />
      <Button type="submit" size="icon" aria-label="Enviar" disabled={!text.trim() || busy}>
        <Send />
      </Button>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => onPhoto(e.target.files?.[0])} data-testid="chat-photo-input" />
    </form>
  );
}
