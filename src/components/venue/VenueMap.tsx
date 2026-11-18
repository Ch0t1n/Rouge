"use client";

/**
 * Plano interactivo de la discoteca — coordenadas relativas 0-100.
 *
 * - Zoom/paneo suave: pinch con 2 dedos, arrastre con 1, rueda en desktop.
 * - Tap sobre el plano → onTap(x, y, sector) para el Pin-Drop (Fase 4).
 * - Pines: Squad = Cyber Cyan, Match = Electric Rouge, Punto Base = Amber Gold.
 * - Si el evento tiene venue_map_url (plano subido por el admin) se usa como
 *   fondo; si no, se dibuja el plano vectorial a partir de venue_layout_json.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { Flag, Minus, Plus, Scan, Siren } from "lucide-react";
import type { VenueLayout, VenueSector } from "@/lib/types";
import type { VisiblePin } from "@/lib/engine/selectors";
import { sectorAt } from "@/lib/engine/selectors";
import { Avatar } from "@/components/ui/avatar";
import { clamp, cn } from "@/lib/utils";

const MIN_Z = 1;
const MAX_Z = 3.5;

interface VenueMapProps {
  layout: VenueLayout;
  mapImageUrl?: string | null;
  pins?: VisiblePin[];
  basePin?: { x: number; y: number; label: string } | null;
  /** Pin provisorio mientras el usuario elige ubicación */
  draft?: { x: number; y: number } | null;
  highlightSector?: string | null;
  /** Salas, mesas y puntos de encuentro, o reuniones (marcadores con etiqueta). */
  marks?: MapMark[];
  onTap?: (x: number, y: number, sector?: VenueSector) => void;
  onPinClick?: (pin: VisiblePin) => void;
  className?: string;
  /** Oculta los controles de zoom (miniaturas, minimapas de barra) */
  compact?: boolean;
  /** Centra y acerca el plano en ese punto al montar o cuando cambia (ej. "Ubicar sala en el mapa"). */
  focusPoint?: { x: number; y: number } | null;
  children?: ReactNode;
}

const W = 300;

/** Marcador simple del plano (salas/mesas del organizador, lugar de una reunión). */
export interface MapMark {
  key: string;
  x: number;
  y: number;
  label: string;
  icon: string;
  tone: "vip" | "squad" | "rouge" | "muted";
  /** Resaltado (la reunión enfocada, la sala elegida). */
  emphasis?: boolean;
  onClick?: () => void;
}

const MARK_TONE: Record<MapMark["tone"], string> = {
  vip: "bg-vip text-background ring-vip/40",
  squad: "bg-squad text-background ring-squad/40",
  rouge: "bg-rouge text-white ring-rouge/40",
  muted: "bg-white/80 text-background ring-white/30",
};

const SECTOR_STYLE: Record<VenueSector["kind"], { fill: string; stroke: string; label: string }> = {
  // Pista, cabina y VIP siguen los colores de la marca (variables CSS): se aplican con style, no con atributos SVG.
  dancefloor: { fill: "rgb(var(--c-rouge) / 0.07)", stroke: "rgb(var(--c-rouge) / 0.55)", label: "color-mix(in srgb, rgb(var(--c-rouge)) 62%, white)" },
  bar: { fill: "rgba(0,240,255,0.06)", stroke: "rgba(0,240,255,0.5)", label: "#7DF7FF" },
  vip: { fill: "rgb(var(--c-vip) / 0.07)", stroke: "rgb(var(--c-vip) / 0.6)", label: "color-mix(in srgb, rgb(var(--c-vip)) 70%, white)" },
  outdoor: { fill: "rgba(148,163,184,0.05)", stroke: "rgba(148,163,184,0.35)", label: "#94A3B8" },
  entrance: { fill: "rgba(248,250,252,0.04)", stroke: "rgba(248,250,252,0.3)", label: "#CBD5E1" },
  booth: { fill: "rgb(var(--c-rouge) / 0.14)", stroke: "rgb(var(--c-rouge) / 0.8)", label: "#FFFFFF" },
  restroom: { fill: "rgba(148,163,184,0.05)", stroke: "rgba(148,163,184,0.25)", label: "#94A3B8" },
  lounge: { fill: "rgba(148,163,184,0.04)", stroke: "rgba(148,163,184,0.28)", label: "#94A3B8" },
  // Corporativo: escenario (como la cabina), stands de expositores (acento) y salas de reunión.
  stage: { fill: "rgb(var(--c-rouge) / 0.12)", stroke: "rgb(var(--c-rouge) / 0.7)", label: "#FFFFFF" },
  stand: { fill: "rgb(var(--c-vip) / 0.06)", stroke: "rgb(var(--c-vip) / 0.5)", label: "color-mix(in srgb, rgb(var(--c-vip)) 70%, white)" },
  meeting: { fill: "rgba(248,250,252,0.04)", stroke: "rgba(248,250,252,0.35)", label: "#CBD5E1" },
};

export function VenueMap({
  layout,
  mapImageUrl,
  pins = [],
  basePin,
  draft,
  highlightSector,
  marks = [],
  onTap,
  onPinClick,
  className,
  compact,
  focusPoint,
  children,
}: VenueMapProps) {
  const H = W / layout.aspect;
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startX: number; startY: number; t: number; moved: boolean; pinchDist?: number; pinchZ?: number } | null>(null);

  const clampView = useCallback((v: { z: number; x: number; y: number }) => {
    const el = viewportRef.current;
    if (!el) return v;
    const z = clamp(v.z, MIN_Z, MAX_Z);
    const maxX = ((z - 1) * el.clientWidth) / 2;
    const maxY = ((z - 1) * el.clientHeight) / 2;
    return { z, x: clamp(v.x, -maxX, maxX), y: clamp(v.y, -maxY, maxY) };
  }, []);

  // Enfoque: zoom 2,2× con el punto en el centro (acotado a los bordes del plano).
  const fx = focusPoint?.x;
  const fy = focusPoint?.y;
  useEffect(() => {
    const el = viewportRef.current;
    if (fx == null || fy == null || !el) return;
    const z = 2.2;
    setView(clampView({ z, x: -((fx / 100) - 0.5) * el.clientWidth * z, y: -((fy / 100) - 0.5) * el.clientHeight * z }));
  }, [fx, fy, clampView]);

  const zoomBy = (factor: number) => setView((v) => clampView({ ...v, z: v.z * factor }));

  const onPointerDown = (e: RPointerEvent) => {
    // Sin captura sobre los pines: si no, el click no llega al botón del pin.
    if (!(e.target as HTMLElement).closest("[data-pin]")) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      gesture.current = { startX: e.clientX, startY: e.clientY, t: Date.now(), moved: false };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { ...(gesture.current ?? { startX: 0, startY: 0, t: 0 }), moved: true, pinchDist: Math.hypot(a.x - b.x, a.y - b.y), pinchZ: view.z };
    }
  };

  const onPointerMove = (e: RPointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && gesture.current.pinchDist) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      setView((v) => clampView({ ...v, z: (gesture.current!.pinchZ ?? 1) * (dist / gesture.current!.pinchDist!) }));
      return;
    }
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    if (Math.hypot(e.clientX - gesture.current.startX, e.clientY - gesture.current.startY) > 6) gesture.current.moved = true;
    if (gesture.current.moved) setView((v) => clampView({ ...v, x: v.x + dx, y: v.y + dy }));
  };

  const onPointerUp = (e: RPointerEvent) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) return;
    gesture.current = null;
    if (!g || g.moved || Date.now() - g.t > 450 || !onTap || !contentRef.current) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-pin]")) return;
    const rect = contentRef.current.getBoundingClientRect(); // ya incluye la transformación
    const x = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100);
    onTap(Math.round(x * 10) / 10, Math.round(y * 10) / 10, sectorAt(layout.sectors, x, y));
  };

  // Rueda del mouse (desktop). Listener nativo no-pasivo para poder evitar el scroll de la página.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || compact) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setView((v) => clampView({ ...v, z: v.z * f }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [compact, clampView]);

  const sectors = useMemo(() => [...layout.sectors].sort((a, b) => b.w * b.h - a.w * a.h), [layout.sectors]);

  // Sectores con otro sector pegado arriba adentro (ej. Barra Terraza dentro de Patio Terraza): su nombre va abajo.
  const labelAtBottom = useMemo(() => {
    const out = new Set<string>();
    for (const s of layout.sectors) {
      const lw = ((s.name.length * 4.2 + 8) / W) * 100; // ancho aprox. del texto en % del plano
      const lh = (14 / H) * 100;
      const hit = layout.sectors.some((t) => t.id !== s.id && t.x < s.x + lw && t.x + t.w > s.x && t.y < s.y + lh && t.y + t.h > s.y && t.w * t.h < s.w * s.h);
      if (hit) out.add(s.id);
    }
    return out;
  }, [layout.sectors, H]);

  // Ancho real del plano en pantalla: para que las etiquetas de los pines no se pisen.
  const [vpW, setVpW] = useState(0);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setVpW(el.clientWidth));
    ro.observe(el);
    setVpW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  /**
   * Etiquetas visibles sin superposición: se ubican por prioridad (rescate > vos > Punto Base > Squad > match)
   * y la que choca con otra etiqueta o con la foto de otro pin se oculta (el pin sigue). Al hacer zoom se separan.
   */
  const { shownLabels, nudge } = useMemo(() => {
    const shown = new Set<string>();
    const nudge = new Map<string, { dx: number; dy: number }>();
    if (!vpW) return { shownLabels: shown, nudge };
    const cw = vpW * view.z;
    const ch = (vpW / layout.aspect) * view.z;
    type M = { key: string; x: number; y: number; text: string; prio: number; avatar: number };
    const marks: M[] = pins.map((vp) => ({
      key: vp.pin.id,
      x: (vp.pin.coord_x / 100) * cw,
      y: (vp.pin.coord_y / 100) * ch,
      text: `${vp.profile.full_name.split(" ")[0]} · ${vp.minutesLeft}m`,
      prio: vp.pin.is_rescue_alert ? 0 : vp.audience === "self" ? 1 : vp.audience === "squad" ? 3 : 4,
      avatar: vp.pin.is_rescue_alert ? 40 : 34,
    }));
    if (basePin) marks.push({ key: "base", x: (basePin.x / 100) * cw, y: (basePin.y / 100) * ch, text: basePin.label, prio: 2, avatar: 32 });
    // Marcadores casi en el mismo punto (ej. un pin sobre el Punto Base): se separan unos px para que se vean los dos.
    const order = [...marks.keys()].sort((i, j) => marks[i].prio - marks[j].prio);
    const centers: { x: number; y: number }[] = [];
    for (const i of order) {
      const m = marks[i];
      let { x, y } = m;
      for (let tries = 0; tries < 6; tries++) {
        const near = centers.find((c) => Math.hypot(c.x - x, c.y - y) < 38);
        if (!near) break;
        const ang = Math.atan2(y - near.y, x - near.x) || (tries % 2 ? Math.PI : 0);
        x = near.x + Math.cos(ang) * 40;
        y = near.y + Math.sin(ang) * 40;
      }
      centers.push({ x, y });
      if (x !== m.x || y !== m.y) nudge.set(m.key, { dx: x - m.x, dy: y - m.y });
      m.x = x;
      m.y = y;
    }
    if (compact) return { shownLabels: shown, nudge };
    const boxes: { l: number; r: number; t: number; b: number }[] = marks.map((m) => ({ l: m.x - m.avatar / 2, r: m.x + m.avatar / 2, t: m.y - 18, b: m.y - 18 + m.avatar }));
    const placed: { l: number; r: number; t: number; b: number }[] = [];
    const hits = (a: { l: number; r: number; t: number; b: number }, b: { l: number; r: number; t: number; b: number }) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
    order.forEach((i) => {
      const m = marks[i];
      const w = Math.min(m.key === "base" ? 110 : 140, m.text.length * 6 + 14);
      const top = m.y - 18 + m.avatar + 4;
      const box = { l: m.x - w / 2, r: m.x + w / 2, t: top, b: top + 17 };
      const clash = placed.some((p) => hits(p, box)) || boxes.some((b, j) => j !== i && hits(b, box));
      if (!clash) {
        shown.add(m.key);
        placed.push(box);
      }
    });
    return { shownLabels: shown, nudge };
  }, [pins, basePin, vpW, view.z, layout.aspect, compact]);

  return (
    <div className={cn("relative", className)}>
      <div
        ref={viewportRef}
        className="touch-none-select relative w-full overflow-hidden rounded-3xl border border-white/10 bg-surface-sunken"
        style={{ aspectRatio: `${layout.aspect}` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="application"
        aria-label="Plano interactivo del lugar"
      >
        <div
          ref={contentRef}
          className="absolute inset-0 origin-center transition-transform duration-75 ease-out will-change-transform"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}
        >
          {mapImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mapImageUrl} alt="" className="absolute inset-0 size-full object-cover opacity-80" draggable={false} />
          ) : null}

          <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" aria-hidden>
            <defs>
              <pattern id="vm-grid" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M10 0H0V10" fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth="0.6" />
              </pattern>
              <pattern id="vm-floor" width="14" height="14" patternUnits="userSpaceOnUse">
                <rect width="14" height="14" fill="none" style={{ stroke: "rgb(var(--c-rouge) / 0.1)" }} strokeWidth="0.5" />
              </pattern>
              <radialGradient id="vm-floor-glow" cx="50%" cy="20%" r="80%">
                <stop offset="0" style={{ stopColor: "rgb(var(--c-rouge) / 0.22)" }} />
                <stop offset="1" style={{ stopColor: "rgb(var(--c-rouge) / 0)" }} />
              </radialGradient>
              <filter id="vm-neon" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="1.6" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {!mapImageUrl && <rect width={W} height={H} fill="url(#vm-grid)" />}

            {!mapImageUrl &&
              sectors.map((s) => {
                const st = SECTOR_STYLE[s.kind];
                const x = (s.x / 100) * W;
                const y = (s.y / 100) * H;
                const w = (s.w / 100) * W;
                const h = (s.h / 100) * H;
                const hl = highlightSector === s.name;
                return (
                  <g key={s.id}>
                    <rect x={x} y={y} width={w} height={h} rx={6} style={{ fill: st.fill, stroke: st.stroke }} strokeWidth={hl ? 1.8 : 0.9} filter={s.kind === "booth" || hl ? "url(#vm-neon)" : undefined} />
                    {s.kind === "dancefloor" && (
                      <>
                        <rect x={x} y={y} width={w} height={h} rx={6} fill="url(#vm-floor)" />
                        <rect x={x} y={y} width={w} height={h} rx={6} fill="url(#vm-floor-glow)" />
                      </>
                    )}
                    {s.kind === "bar" && <line x1={x + 6} y1={y + h - 4} x2={x + w - 6} y2={y + h - 4} stroke={st.stroke} strokeWidth={2.2} strokeLinecap="round" />}
                    {s.kind === "vip" &&
                      [0, 1, 2].map((i) => (
                        <circle key={i} cx={x + w / 2} cy={y + h * (0.28 + i * 0.26)} r={Math.min(w, h) * 0.12} fill="none" style={{ stroke: "rgb(var(--c-vip) / 0.45)" }} strokeWidth={0.8} />
                      ))}
                    {s.kind === "booth" &&
                      [0, 1, 2, 3, 4, 5, 6].map((i) => (
                        <rect key={i} x={x + w * 0.2 + i * (w * 0.6) / 7} y={y + h * 0.55 - ((i * 37) % 5) * 1.6} width={w * 0.05} height={2 + ((i * 37) % 5) * 1.6} style={{ fill: "rgb(var(--c-rouge) / 0.8)" }} rx={0.6} />
                      ))}
                    {s.kind === "entrance" && <path d={`M${x + w / 2 - 6} ${y + h - 6} L${x + w / 2} ${y + 6} L${x + w / 2 + 6} ${y + h - 6}`} fill="none" stroke={st.stroke} strokeWidth={1.2} />}
                    <text
                      x={x + (s.kind === "booth" ? w / 2 : 6)}
                      y={y + (s.kind === "booth" ? h * 0.38 : labelAtBottom.has(s.id) ? h - 5 : 11)}
                      textAnchor={s.kind === "booth" ? "middle" : "start"}
                      fontSize={Math.min(s.kind === "dancefloor" ? 9 : 6.4, (w - 10) / (s.name.length * 0.7))}
                      fontFamily="var(--font-display)"
                      fontWeight={700}
                      letterSpacing="0.04em"
                      style={{ textTransform: "uppercase", fill: st.label }}
                    >
                      {s.name}
                    </text>
                  </g>
                );
              })}
          </svg>

          {/* Punto Base del Squad */}
          {basePin && (
            <MapMarker x={basePin.x} y={basePin.y} z={view.z} nudge={nudge.get("base")}>
              <div className="flex flex-col items-center" title={basePin.label}>
                <span className="grid size-8 place-items-center rounded-full bg-vip text-background shadow-glow-vip ring-2 ring-background">
                  <Flag className="size-4" />
                </span>
                {!compact && shownLabels.has("base") && <span className="mt-1 max-w-[110px] truncate rounded-full bg-vip/90 px-2 py-0.5 font-display text-[10px] font-bold text-background">{basePin.label}</span>}
              </div>
            </MapMarker>
          )}

          {pins.map((vp) => {
            const tone = vp.pin.is_rescue_alert ? "rescue" : vp.audience === "match" ? "rouge" : vp.audience === "squad" ? "squad" : "self";
            const color = { rescue: "bg-sos", rouge: "bg-rouge", squad: "bg-squad", self: "bg-white" }[tone];
            const ring = { rescue: "rouge", rouge: "rouge", squad: "squad", self: "none" }[tone] as "rouge" | "squad" | "none";
            return (
              <MapMarker key={vp.pin.id} x={vp.pin.coord_x} y={vp.pin.coord_y} z={view.z} nudge={nudge.get(vp.pin.id)}>
                <button
                  data-pin
                  type="button"
                  onClick={() => onPinClick?.(vp)}
                  className="group relative flex flex-col items-center focus-visible:ring-0"
                  aria-label={`${vp.profile.full_name}${vp.pin.sector_name ? ` en ${vp.pin.sector_name}` : ""}, expira en ${vp.minutesLeft} minutos`}
                >
                  <span className={cn("absolute top-0 h-9 w-7 rounded-lg animate-pin-pulse", color, tone === "rescue" && "-top-1.5 h-12 w-9 rounded-xl")} aria-hidden />
                  <span className="relative">
                    <Avatar profile={vp.profile} size={tone === "rescue" ? 40 : 34} ring={ring} className={tone === "self" ? "ring-2 ring-white" : undefined} />
                    {tone === "rescue" && (
                      <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-sos text-white ring-2 ring-background">
                        <Siren className="size-3" />
                      </span>
                    )}
                  </span>
                  {!compact && shownLabels.has(vp.pin.id) && (
                    <span
                      className={cn(
                        "mt-1 whitespace-nowrap rounded-full px-1.5 py-0.5 font-display text-[10px] font-bold",
                        tone === "squad" ? "bg-squad text-background" : tone === "self" ? "bg-white text-background" : tone === "rescue" ? "bg-sos text-white" : "bg-rouge text-white",
                      )}
                    >
                      {tone === "self" ? "Vos" : vp.profile.full_name.split(" ")[0]} · {vp.minutesLeft}m
                    </span>
                  )}
                </button>
              </MapMarker>
            );
          })}

          {marks.map((m) => (
            <MapMarker key={m.key} x={m.x} y={m.y} z={view.z}>
              <button
                type="button"
                data-pin
                onClick={m.onClick}
                disabled={!m.onClick}
                aria-label={m.label}
                className="flex flex-col items-center disabled:cursor-default"
              >
                <span className={cn("grid place-items-center rounded-full font-display text-xs font-bold ring-4", MARK_TONE[m.tone], m.emphasis ? "size-8 animate-pin-pulse" : "size-6")}>{m.icon}</span>
                {(!compact || m.emphasis) && (
                  <span className={cn("mt-1 max-w-[120px] truncate rounded-full px-2 py-0.5 font-display text-[10px] font-bold", m.emphasis ? MARK_TONE[m.tone] : "bg-background/80 text-primary")}>{m.label}</span>
                )}
              </button>
            </MapMarker>
          ))}

          {draft && (
            <MapMarker x={draft.x} y={draft.y} z={view.z}>
              <span className="relative grid size-6 place-items-center">
                <span className="absolute inset-0 rounded-full bg-white/60 animate-pin-pulse" />
                <span className="size-3.5 rounded-full bg-white ring-4 ring-white/30" />
              </span>
            </MapMarker>
          )}

          {children}
        </div>
      </div>

      {!compact && (
        <div className="absolute bottom-3 right-3 flex flex-col gap-2">
          <MapCtl label="Acercar" onClick={() => zoomBy(1.35)}>
            <Plus />
          </MapCtl>
          <MapCtl label="Alejar" onClick={() => zoomBy(1 / 1.35)}>
            <Minus />
          </MapCtl>
          {view.z > 1.01 && (
            <MapCtl label="Ver plano completo" onClick={() => setView({ z: 1, x: 0, y: 0 })}>
              <Scan />
            </MapCtl>
          )}
        </div>
      )}
    </div>
  );
}

/** Posiciona un marcador en % y lo contra-escala para que no crezca con el zoom. */
function MapMarker({ x, y, z, nudge, children }: { x: number; y: number; z: number; nudge?: { dx: number; dy: number }; children: ReactNode }) {
  const dx = (nudge?.dx ?? 0) / z;
  const dy = (nudge?.dy ?? 0) / z;
  return (
    <div className="absolute" style={{ left: `${x}%`, top: `${y}%`, transform: `translate(calc(-50% + ${dx}px), ${dy - 18}px) scale(${1 / z})`, transformOrigin: "50% 18px" }}>
      {children}
    </div>
  );
}

function MapCtl({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="glass grid size-11 place-items-center rounded-full text-primary active:scale-95 [&_svg]:size-5">
      {children}
    </button>
  );
}
