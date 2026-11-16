"use client";

import { useEffect, useState } from "react";
import type { Message, Profile } from "@/lib/types";
import { useMediaUrl } from "@/lib/media/useMediaUrl";
import { cn, formatTime } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";

/** Lista de mensajes: texto, fotos y alertas del sistema (rescate, punto base, llegué a casa). */
export function MessageList({ messages, meId, profiles, group = false }: { messages: Message[]; meId: string; profiles: Map<string, Profile>; group?: boolean }) {
  useEffect(() => {
    // Hasta el fondo real de la página: el compositor es sticky y no debe tapar el último mensaje.
    window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [messages.length]);

  return (
    <div className="space-y-1.5">
      {messages.map((m, i) => {
        if (m.message_type === "system_alert") return <SystemAlert key={m.id} message={m} />;
        const mine = m.sender_id === meId;
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const firstOfRun = !prev || prev.sender_id !== m.sender_id || prev.message_type === "system_alert";
        const lastOfRun = !next || next.sender_id !== m.sender_id || next.message_type === "system_alert";
        const sender = profiles.get(m.sender_id);
        return (
          <div key={m.id} className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start", firstOfRun && "pt-2")}>
            {group && !mine && <div className="w-7 shrink-0">{lastOfRun && sender && <Avatar profile={sender} size={28} ring="squad" />}</div>}
            <div className={cn("flex max-w-[78%] flex-col", mine ? "items-end" : "items-start")}>
              {group && !mine && firstOfRun && <span className="mb-0.5 px-3 text-[11px] font-semibold text-squad">{sender?.full_name.split(" ")[0] ?? "Alguien"}</span>}
              {m.message_type === "image" && m.media_url ? (
                <ChatImage url={m.media_url} mine={mine} caption={m.content} />
              ) : (
                <p
                  className={cn(
                    "whitespace-pre-wrap break-words rounded-3xl px-4 py-2.5 text-[15px] leading-snug",
                    mine ? "bg-rouge text-white" : group ? "bg-surface-raised text-primary" : "bg-surface-raised text-primary",
                    mine && lastOfRun && "rounded-br-md",
                    !mine && lastOfRun && "rounded-bl-md",
                  )}
                >
                  {m.content}
                </p>
              )}
              {lastOfRun && <span className="mt-1 px-2 text-[10px] text-muted">{formatTime(m.created_at)}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SystemAlert({ message: m }: { message: Message }) {
  const rescue = m.content.startsWith("🚨");
  const ok = m.content.startsWith("🏠") || m.content.startsWith("✅");
  const base = m.content.startsWith("🚩");
  return (
    <div className="flex justify-center py-1.5">
      <p
        role={rescue ? "alert" : undefined}
        className={cn(
          "max-w-[92%] rounded-2xl px-3.5 py-2 text-center text-[13px] font-semibold",
          rescue ? "border border-sos/60 bg-sos/15 text-sos shadow-glow-sos" : ok ? "bg-squad/10 text-squad" : base ? "bg-vip/10 text-vip" : "bg-white/[0.05] text-muted",
        )}
      >
        {m.content} <span className="ml-1 text-[10px] font-normal opacity-70">{formatTime(m.created_at)}</span>
      </p>
    </div>
  );
}

/** Si la foto termina de cargar cuando estabas cerca del final, el chat vuelve al fondo (no queda tapada). */
function keepAtBottom() {
  const el = document.documentElement;
  if (el.scrollHeight - (window.scrollY + window.innerHeight) < 600) window.scrollTo({ top: el.scrollHeight });
}

function ChatImage({ url, mine, caption }: { url: string; mine: boolean; caption: string }) {
  const { src, missing } = useMediaUrl(url);
  const [zoom, setZoom] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setZoom(true)} className={cn("overflow-hidden rounded-3xl border border-white/10 bg-surface-raised", mine ? "rounded-br-md" : "rounded-bl-md")} aria-label="Ampliar foto">
        {src && !missing ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={caption || "Foto"} loading="lazy" onLoad={keepAtBottom} className="max-h-72 w-auto max-w-full object-cover" />
        ) : (
          <div className="grid h-40 w-56 place-items-center text-xs text-muted">{missing ? "Foto no disponible" : "Cargando…"}</div>
        )}
        {caption && <p className={cn("px-3 py-2 text-left text-[14px]", mine ? "bg-rouge text-white" : "text-primary")}>{caption}</p>}
      </button>
      {zoom && src && (
        <button type="button" aria-label="Cerrar foto" onClick={() => setZoom(false)} className="fixed inset-0 z-[80] grid place-items-center bg-black/95 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="max-h-full max-w-full rounded-2xl object-contain" />
        </button>
      )}
    </>
  );
}
