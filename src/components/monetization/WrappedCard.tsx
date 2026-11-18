"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Download, Share2 } from "lucide-react";
import { wrappedFor, type Wrapped } from "@/lib/engine/monetization";
import { lobbyPhase } from "@/lib/engine/selectors";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { formatDateTime, formatMoney, formatTime } from "@/lib/utils";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, buttonVariants } from "@/components/ui/button";

const W = 1080;
const H = 1920;

/** Dibuja la tarjeta 9:16 en un canvas (para descargar o compartir a Stories). */
async function renderPng(w: Wrapped): Promise<Blob | null> {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (!g) return null;
  const css = getComputedStyle(document.documentElement);
  const rouge = `rgb(${css.getPropertyValue("--c-rouge").trim().replace(/\s+/g, ",")})`;
  const vip = `rgb(${css.getPropertyValue("--c-vip").trim().replace(/\s+/g, ",")})`;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#070709");
  bg.addColorStop(0.55, "#121216");
  bg.addColorStop(1, "#070709");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.3, H * 0.25, 0, W * 0.3, H * 0.25, 700);
  glow.addColorStop(0, rouge.replace("rgb", "rgba").replace(")", ",0.45)"));
  glow.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  // Fotos (las propias y las de tus matches), en tira.
  const photos = await Promise.all(
    w.photos.filter((u) => !u.startsWith("idb:")).map(
      (u) =>
        new Promise<HTMLImageElement | null>((res) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => res(img);
          img.onerror = () => res(null);
          img.src = u;
        }),
    ),
  );
  const ok = photos.filter((x): x is HTMLImageElement => !!x);
  const size = 220;
  ok.forEach((img, i) => {
    const x = 90 + i * (size + 24);
    g.save();
    g.beginPath();
    g.roundRect(x, 260, size, size * 1.33, 36);
    g.clip();
    g.drawImage(img, x, 260, size, size * 1.33);
    g.restore();
  });
  g.fillStyle = rouge;
  g.font = "700 64px 'Space Grotesk', system-ui";
  g.fillText("ROUGE WRAPPED", 90, 170);
  g.fillStyle = "#F8FAFC";
  g.font = "700 84px 'Space Grotesk', system-ui";
  g.fillText(`${w.name}, qué noche.`, 90, 680);
  g.font = "500 40px 'Plus Jakarta Sans', system-ui";
  g.fillStyle = "#94A3B8";
  g.fillText(`${w.event} · ${w.venue}`, 90, 745);
  const stats: [string, string][] = [
    [String(w.matches), "matches"],
    [w.squad ? `${w.squad.size}` : "—", w.squad ? `en ${w.squad.name}` : "sin Squad"],
    [String(w.drinks), "tragos sin fila"],
    [w.hours != null ? `${w.hours} h` : "—", "de fiesta"],
    [String(w.songs_voted), "temas votados"],
    [w.top_genres[0] ?? "—", "tu género"],
  ];
  stats.forEach(([v, l], i) => {
    const x = 90 + (i % 2) * 470;
    const y = 900 + Math.floor(i / 2) * 260;
    g.fillStyle = "rgba(255,255,255,0.06)";
    g.beginPath();
    g.roundRect(x, y, 430, 220, 36);
    g.fill();
    g.fillStyle = i % 2 ? vip : "#F8FAFC";
    g.font = "700 96px 'Space Grotesk', system-ui";
    g.fillText(v.slice(0, 10), x + 36, y + 120);
    g.fillStyle = "#94A3B8";
    g.font = "500 36px 'Plus Jakarta Sans', system-ui";
    g.fillText(l.slice(0, 22), x + 36, y + 180);
  });
  g.fillStyle = "#F8FAFC";
  g.font = "600 40px 'Plus Jakarta Sans', system-ui";
  g.fillText(`Tus chats siguen abiertos · after hasta ${formatTime(w.afterglow_until)}`, 90, 1740);
  g.fillStyle = rouge;
  g.font = "700 44px 'Space Grotesk', system-ui";
  g.fillText("rouge.app", 90, 1820);
  return new Promise((res) => c.toBlob(res, "image/png"));
}

export function WrappedCard() {
  const { state } = useRouge();
  const now = useNow(60_000);
  const params = useSearchParams();
  const eventId = params.get("evento") ?? state.active_event_id;
  const w = useMemo(() => wrappedFor(state, state.current_user_id, eventId, now), [state, eventId, now]);
  const ev = state.events.find((e) => e.id === eventId);
  const [busy, setBusy] = useState(false);

  const exportPng = async (mode: "share" | "download") => {
    if (!w) return;
    setBusy(true);
    const blob = await renderPng(w);
    setBusy(false);
    if (!blob) return;
    const file = new File([blob], `rouge-wrapped-${ev?.slug ?? "noche"}.png`, { type: "image/png" });
    if (mode === "share" && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "Mi noche en ROUGE" }).catch(() => null);
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  if (!w || !ev) {
    return (
      <main>
        <PageHeader title="Rouge Wrapped" backHref="/app" />
        <p className="mx-4 mt-10 rounded-3xl border border-dashed border-white/10 p-8 text-center text-sm text-muted">Tu resumen aparece cuando entraste a una fiesta con ROUGE.</p>
      </main>
    );
  }
  const live = lobbyPhase(ev, now) === "live";
  return (
    <main className="pb-12">
      <PageHeader title="Rouge Wrapped" subtitle={live ? "Tu noche hasta ahora" : formatDateTime(ev.starts_at)} backHref="/app" />
      <div className="mx-auto max-w-sm px-4">
        {/* Vista previa 9:16 (la descarga se dibuja en 1080×1920) */}
        <article className="relative aspect-[9/16] overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-b from-rouge/25 via-surface to-background p-6 shadow-glow-rouge" aria-label="Tarjeta de tu noche">
          <p className="font-display text-sm font-bold tracking-widest text-rouge">ROUGE WRAPPED</p>
          <h1 className="mt-6 text-3xl">{w.name}, qué noche.</h1>
          <p className="text-xs text-muted">{w.event} · {w.venue}</p>
          <dl className="mt-6 grid grid-cols-2 gap-2">
            {[
              [String(w.matches), "matches"],
              [w.squad ? String(w.squad.size) : "—", w.squad ? `en ${w.squad.name}` : "sin Squad"],
              [String(w.drinks), "tragos sin fila"],
              [w.hours != null ? `${w.hours} h` : "—", "de fiesta"],
              [String(w.songs_voted), "temas votados"],
              [w.top_genres[0] ?? "—", "tu género"],
            ].map(([v, l], i) => (
              <div key={l} className="rounded-2xl bg-white/[0.06] p-3">
                <dd className={i % 2 ? "metric text-2xl text-vip" : "metric text-2xl"}>{v}</dd>
                <dt className="truncate text-[11px] text-muted">{l}</dt>
              </div>
            ))}
          </dl>
          <p className="absolute inset-x-6 bottom-6 text-xs text-primary/85">Tus chats siguen abiertos · after hasta las {formatTime(w.afterglow_until)}</p>
        </article>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="rouge" onClick={() => exportPng("share")} disabled={busy}>
            <Share2 /> A Stories
          </Button>
          <Button variant="glass" onClick={() => exportPng("download")} disabled={busy}>
            <Download /> Descargar
          </Button>
        </div>
        <p className="mt-3 text-center text-xs text-muted">Gastaste {formatMoney(w.spent)} sin hacer fila. Solo se ven tus datos y fotos de tus matches.</p>
        <Link href="/inbox" className={buttonVariants({ variant: "ghost", block: true })}>
          Escribirle a tus matches
        </Link>
      </div>
    </main>
  );
}
