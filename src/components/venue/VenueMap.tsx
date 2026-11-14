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
  onTap?: (x: number, y: number, sector?: VenueSector) => void;
  onPinClick?: (pin: VisiblePin) => void;
  className?: string;
  /** Oculta los controles de zoom (miniaturas, minimapas de barra) */
  compact?: boolean;
  children?: ReactNode;
}

const W = 300;

const SECTOR_STYLE: Record<VenueSector["kind"], { fill: string; stroke: string; label: string }> = {
  dancefloor: { fill: "rgba(255,30,86,0.07)", stroke: "rgba(255,30,86,0.55)", label: "#FF7A9A" },
  bar: { fill: "rgba(0,240,255,0.06)", stroke: "rgba(0,240,255,0.5)", label: "#7DF7FF" },
  vip: { fill: "rgba(255,184,0,0.07)", stroke: "rgba(255,184,0,0.6)", label: "#FFD466" },
  outdoor: { fill: "rgba(148,163,184,0.05)", stroke: "rgba(148,163,184,0.35)", label: "#94A3B8" },
  entrance: { fill: "rgba(248,250,252,0.04)", stroke: "rgba(248,250,252,0.3)", label: "#CBD5E1" },
  booth: { fill: "rgba(255,30,86,0.14)", stroke: "rgba(255,30,86,0.8)", label: "#FFFFFF" },
  restroom: { fill: "rgba(148,163,184,0.05)", stroke: "rgba(148,163,184,0.25)", label: "#94A3B8" },
  lounge: { fill: "rgba(148,163,184,0.04)", stroke: "rgba(148,163,184,0.28)", label: "#94A3B8" },
};

export function VenueMap({
  layout,
  mapImageUrl,
  pins = [],
  basePin,
  draft,
  highlightSector,
  onTap,
  onPinClick,
  className,
  compact,
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
                <rect width="14" height="14" fill="none" stroke="rgba(255,30,86,0.10)" strokeWidth="0.5" />
              </pattern>
              <radialGradient id="vm-floor-glow" cx="50%" cy="20%" r="80%">
                <stop offset="0" stopColor="rgba(255,30,86,0.22)" />
                <stop offset="1" stopColor="rgba(255,30,86,0)" />
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
                    <rect x={x} y={y} width={w} height={h} rx={6} fill={st.fill} stroke={st.stroke} strokeWidth={hl ? 1.8 : 0.9} filter={s.kind === "booth" || hl ? "url(#vm-neon)" : undefined} />
                    {s.kind === "dancefloor" && (
                      <>
                        <rect x={x} y={y} width={w} height={h} rx={6} fill="url(#vm-floor)" />
                        <rect x={x} y={y} width={w} height={h} rx={6} fill="url(#vm-floor-glow)" />
                      </>
                    )}
                    {s.kind === "bar" && <line x1={x + 6} y1={y + h - 4} x2={x + w - 6} y2={y + h - 4} stroke={st.stroke} strokeWidth={2.2} strokeLinecap="round" />}
                    {s.kind === "vip" &&
                      [0, 1, 2].map((i) => (
                        <circle key={i} cx={x + w / 2} cy={y + h * (0.28 + i * 0.26)} r={Math.min(w, h) * 0.12} fill="none" stroke="rgba(255,184,0,0.45)" strokeWidth={0.8} />
                      ))}
                    {s.kind === "booth" &&
                      [0, 1, 2, 3, 4, 5, 6].map((i) => (
                        <rect key={i} x={x + w * 0.2 + i * (w * 0.6) / 7} y={y + h * 0.55 - ((i * 37) % 5) * 1.6} width={w * 0.05} height={2 + ((i * 37) % 5) * 1.6} fill="rgba(255,30,86,0.8)" rx={0.6} />
                      ))}
                    {s.kind === "entrance" && <path d={`M${x + w / 2 - 6} ${y + h - 6} L${x + w / 2} ${y + 6} L${x + w / 2 + 6} ${y + h - 6}`} fill="none" stroke={st.stroke} strokeWidth={1.2} />}
                    <text
                      x={x + (s.kind === "booth" ? w / 2 : 6)}
                      y={y + (s.kind === "booth" ? h * 0.38 : 11)}
                      textAnchor={s.kind === "booth" ? "middle" : "start"}
                      fill={st.label}
                      fontSize={s.kind === "dancefloor" ? 9 : 6.4}
                      fontFamily="var(--font-display)"
                      fontWeight={700}
                      letterSpacing="0.04em"
                      style={{ textTransform: "uppercase" }}
                    >
                      {s.name}
                    </text>
                  </g>
                );
              })}
          </svg>

          {/* Punto Base del Squad */}
          {basePin && (
            <MapMarker x={basePin.x} y={basePin.y} z={view.z}>
              <div className="flex flex-col items-center" title={basePin.label}>
                <span className="grid size-8 place-items-center rounded-full bg-vip text-background shadow-glow-vip ring-2 ring-background">
                  <Flag className="size-4" />
                </span>
                {!compact && <span className="mt-1 max-w-[110px] truncate rounded-full bg-vip/90 px-2 py-0.5 font-display text-[10px] font-bold text-background">{basePin.label}</span>}
              </div>
            </MapMarker>
          )}

          {pins.map((vp) => {
            const tone = vp.pin.is_rescue_alert ? "rescue" : vp.audience === "match" ? "rouge" : vp.audience === "squad" ? "squad" : "self";
            const color = { rescue: "bg-rouge", rouge: "bg-rouge", squad: "bg-squad", self: "bg-white" }[tone];
            const ring = { rescue: "rouge", rouge: "rouge", squad: "squad", self: "none" }[tone] as "rouge" | "squad" | "none";
            return (
              <MapMarker key={vp.pin.id} x={vp.pin.coord_x} y={vp.pin.coord_y} z={view.z}>
                <button
                  data-pin
                  type="button"
                  onClick={() => onPinClick?.(vp)}
                  className="group relative flex flex-col items-center focus-visible:ring-0"
                  aria-label={`${vp.profile.full_name}${vp.pin.sector_name ? ` en ${vp.pin.sector_name}` : ""}, expira en ${vp.minutesLeft} minutos`}
                >
                  <span className={cn("absolute top-0 size-9 rounded-full animate-pin-pulse", color, tone === "rescue" && "size-12 -top-1.5")} aria-hidden />
                  <span className="relative">
                    <Avatar profile={vp.profile} size={tone === "rescue" ? 40 : 34} ring={ring} className={tone === "self" ? "ring-2 ring-white" : undefined} />
                    {tone === "rescue" && (
                      <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-rouge text-white ring-2 ring-background">
                        <Siren className="size-3" />
                      </span>
                    )}
                  </span>
                  {!compact && (
                    <span
                      className={cn(
                        "mt-1 whitespace-nowrap rounded-full px-1.5 py-0.5 font-display text-[10px] font-bold",
                        tone === "squad" ? "bg-squad text-background" : tone === "self" ? "bg-white text-background" : "bg-rouge text-white",
                      )}
                    >
                      {tone === "self" ? "Vos" : vp.profile.full_name.split(" ")[0]} · {vp.minutesLeft}m
                    </span>
                  )}
                </button>
              </MapMarker>
            );
          })}

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
function MapMarker({ x, y, z, children }: { x: number; y: number; z: number; children: ReactNode }) {
  return (
    <div className="absolute" style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%, -18px) scale(${1 / z})`, transformOrigin: "50% 18px" }}>
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
