"use client";

import * as C from "@/lib/store/commands";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ImagePlus, Palette, Plus, RotateCcw, Save, ShieldAlert, Trash2, Wallet } from "lucide-react";
import type { Brand, RougeEvent } from "@/lib/types";
import {
  ACCENT_PRESETS,
  BRAND_NAME_MAX,
  PRIMARY_PRESETS,
  ROUGE_ACCENT,
  ROUGE_PRIMARY,
  checkBrandColor,
  getBrand,
  myBrands,
  normalizeHex,
  resolveTheme,
  themeVars,
  type EventTheme,
} from "@/lib/engine/branding";
import { can } from "@/lib/engine/roles";
import { compressImage } from "@/lib/media/compress";
import { uploadMedia } from "@/lib/media/upload";
import { MP_ENABLED, MP_ERRORS, connectMercadoPago, mpErrorMessage } from "@/lib/payments/client";
import { useRouge } from "@/lib/store/RougeContext";
import { cn, formatDateTime, formatMoney } from "@/lib/utils";
import { AdminHeader, Panel } from "@/components/admin/AdminChrome";
import { BrandLogo } from "@/components/brand/BrandTheme";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";

/**
 * Marca y cobros: logo + colores de la marca (y de cada evento) con vista previa en vivo,
 * y la conexión de la cuenta de Mercado Pago donde entra la plata de la Barra Express.
 */
export function BrandStudio() {
  const { state, notify } = useRouge();
  const router = useRouter();
  const params = useSearchParams();
  const mine = myBrands(state);
  const event = state.events.find((e) => e.id === state.active_event_id) ?? null;
  const eventBrand = getBrand(state, event?.brand_id);
  const [selected, setSelected] = useState<string | "new">(eventBrand && eventBrand.owner_id === state.current_user_id ? eventBrand.id : (mine[0]?.id ?? "new"));
  const brand = selected === "new" ? null : (mine.find((b) => b.id === selected) ?? null);

  // Vuelta del OAuth de Mercado Pago (/api/mercadopago/callback → ?mp=connected | ?mp_error=…)
  useEffect(() => {
    const ok = params.get("mp");
    const err = params.get("mp_error");
    if (!ok && !err) return;
    if (ok) notify({ tone: "squad", title: "Mercado Pago conectado", description: "Los pedidos de la barra se cobran en la cuenta de tu marca." });
    else notify({ tone: "rouge", title: "No se conectó Mercado Pago", description: MP_ERRORS[err!] ?? "Probá de nuevo." });
    router.replace("/admin/brand");
  }, [params, notify, router]);

  return (
    <main className="mx-auto max-w-7xl 2xl:max-w-[1600px] space-y-6 px-5 py-6 lg:px-10 lg:py-10">
      <AdminHeader
        title="Marca y cobros"
        subtitle="Tu logo y tus colores en la app de tus fiestas, y la cuenta de Mercado Pago donde entra la plata de la barra."
        actions={
          mine.length > 0 && (
            <Button variant="glass" onClick={() => setSelected("new")}>
              <Plus /> Nueva marca
            </Button>
          )
        }
      />

      {mine.length > 1 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto" role="tablist" aria-label="Mis marcas">
          {mine.map((b) => (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={selected === b.id}
              onClick={() => setSelected(b.id)}
              className={cn("flex shrink-0 items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition", selected === b.id ? "border-vip bg-vip/10" : "border-white/10 bg-white/[0.03] hover:bg-white/5")}
            >
              <span className="size-3 rounded-full" style={{ background: b.primary_color ?? ROUGE_PRIMARY }} aria-hidden />
              {b.name}
            </button>
          ))}
        </div>
      )}

      {mine.length === 0 && eventBrand && (
        <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-muted">
          La marca de este evento (<b className="text-primary">{eventBrand.name}</b>) la administra quien creó el evento. Podés personalizar los colores de esta edición más abajo.
        </p>
      )}

      <BrandEditor key={brand?.id ?? "new"} brand={brand} onSaved={(id) => setSelected(id)} />
      {brand && <PaymentsPanel brand={brand} />}
      {event && can(state, event.id, state.current_user_id, "admin.events") && <EventBrandingPanel key={event.id} event={event} />}
    </main>
  );
}

// ── Marca ─────────────────────────────────────────────────────────────

function BrandEditor({ brand, onSaved }: { brand: Brand | null; onSaved: (id: string) => void }) {
  const { exec, notify } = useRouge();
  const [name, setName] = useState(brand?.name ?? "");
  const [logo, setLogo] = useState<string | null>(brand?.logo_url ?? null);
  const [primary, setPrimary] = useState(brand?.primary_color ?? ROUGE_PRIMARY);
  const [accent, setAccent] = useState(brand?.accent_color ?? ROUGE_ACCENT);
  const errors = { primary: checkBrandColor(primary, "primary"), accent: checkBrandColor(accent, "accent") };
  const theme = resolveTheme(null, { name: name || "Tu marca", logo_url: logo, primary_color: errors.primary ? null : primary, accent_color: errors.accent ? null : accent });

  const save = async () => {
    const r = await exec(
      C.upsertBrand({
        ...(brand ? { id: brand.id } : {}),
        name,
        logo_url: logo,
        // Los colores de ROUGE se guardan como "sin personalizar" (null): si ROUGE ajusta su paleta, la marca la sigue.
        primary_color: normalizeHex(primary) === ROUGE_PRIMARY ? null : primary,
        accent_color: normalizeHex(accent) === ROUGE_ACCENT ? null : accent,
      }),
    );
    if (!r.ok) return;
    notify({ tone: "squad", title: brand ? "Marca actualizada" : "Marca creada", description: "Los eventos con esta marca ya se ven con tu logo y tus colores." });
    onSaved(r.data.id);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Panel title={<span className="inline-flex items-center gap-2"><Palette className="size-5 text-vip" /> {brand ? "Identidad de la marca" : "Creá tu marca"}</span>}>
        <div className="space-y-5">
          <TextField label="Nombre de la marca o fiesta" value={name} maxLength={BRAND_NAME_MAX} showCounter onChange={(e) => setName(e.target.value)} placeholder="Ej: Noche Neón" />
          <LogoField value={logo} onChange={setLogo} />
          <ColorField label="Color principal" hint="Botones, matches y chat. Va con texto blanco encima." kind="primary" value={primary} presets={PRIMARY_PRESETS} onChange={setPrimary} error={errors.primary} />
          <ColorField label="Color de acento" hint="Barra, perks y Mesa VIP. Va con texto oscuro encima." kind="accent" value={accent} presets={ACCENT_PRESETS} onChange={setAccent} error={errors.accent} />
          <p className="flex items-start gap-2 rounded-2xl bg-white/[0.03] p-3 text-xs text-muted">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-sos" />
            El botón de Rescate 🚨 siempre es rojo y los pines del Squad siempre cian: son señales de seguridad y no cambian con la marca.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="vip" onClick={save} disabled={!!errors.primary || !!errors.accent || name.trim().length < 2}>
              <Save /> {brand ? "Guardar marca" : "Crear marca"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setPrimary(ROUGE_PRIMARY);
                setAccent(ROUGE_ACCENT);
              }}
            >
              <RotateCcw /> Colores de Rouge Pass
            </Button>
          </div>
        </div>
      </Panel>
      <Panel title="Así lo ven tus invitados">
        <ThemePreview theme={theme} />
      </Panel>
    </div>
  );
}

function LogoField({ value, onChange, label = "Logo" }: { value: string | null; onChange: (v: string | null) => void; label?: string }) {
  const { notify } = useRouge();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      onChange(await uploadMedia(await compressImage(f, "logo"), "photo"));
    } catch (e) {
      notify({ tone: "rouge", title: "No se pudo subir el logo", description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{label}</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid h-16 w-40 place-items-center rounded-2xl border border-dashed border-white/15 bg-background p-2">
          {value ? <BrandLogo theme={{ logo_url: value, brand_name: null }} className="h-12 max-w-[140px]" /> : <span className="text-xs text-muted">Sin logo</span>}
        </div>
        <input ref={file} type="file" accept="image/png,image/webp,image/jpeg,image/svg+xml" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <Button variant="glass" size="sm" onClick={() => file.current?.click()} disabled={busy}>
          <ImagePlus /> {busy ? "Subiendo…" : value ? "Cambiar" : "Subir logo"}
        </Button>
        {value && (
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
            <Trash2 /> Quitar
          </Button>
        )}
      </div>
      <p className="mt-1.5 text-xs text-muted">PNG con fondo transparente o SVG. Se achica y comprime antes de subir.</p>
    </div>
  );
}

function ColorField({
  label,
  hint,
  kind,
  value,
  presets,
  onChange,
  error,
}: {
  label: string;
  hint: string;
  kind: "primary" | "accent";
  value: string;
  presets: { name: string; hex: string }[];
  onChange: (v: string) => void;
  error: string | null;
}) {
  const hex = normalizeHex(value);
  return (
    <fieldset>
      <legend className="text-sm font-semibold">{label}</legend>
      <p className="mb-2 text-xs text-muted">{hint}</p>
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <button
            key={p.hex}
            type="button"
            onClick={() => onChange(p.hex)}
            aria-label={`${p.name} (${p.hex})`}
            aria-pressed={hex === p.hex}
            title={p.name}
            className={cn("grid size-11 place-items-center rounded-full ring-offset-2 ring-offset-surface transition", hex === p.hex ? "ring-2 ring-white" : "hover:scale-105")}
            style={{ background: p.hex }}
          >
            {hex === p.hex && <Check className={cn("size-4", kind === "primary" ? "text-white" : "text-background")} />}
          </button>
        ))}
        <label className="relative grid size-11 cursor-pointer place-items-center overflow-hidden rounded-full border border-white/20 bg-[conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)]" title="Elegir otro color">
          <span className="sr-only">Elegir otro {label.toLowerCase()}</span>
          <input type="color" value={hex ?? "#000000"} onChange={(e) => onChange(e.target.value.toUpperCase())} className="absolute inset-0 size-full cursor-pointer opacity-0" />
        </label>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} en hexadecimal`}
          maxLength={7}
          className={cn("min-h-[44px] w-28 rounded-xl border bg-white/[0.04] px-3 font-mono text-sm uppercase text-primary focus:outline-none", error ? "border-rouge/60" : "border-white/10 focus:border-vip/50")}
        />
      </div>
      {error && (
        <p className="mt-2 text-xs text-rouge" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Teléfono de muestra con los colores aplicados localmente (las variables CSS se heredan). */
function ThemePreview({ theme }: { theme: EventTheme }) {
  const vars = useMemo(() => themeVars(theme) as CSSProperties, [theme]);
  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[2rem] border-[8px] border-surface-raised bg-background p-4 shadow-glow-rouge" style={vars} data-testid="brand-preview">
      <div className="flex items-center justify-between">
        <BrandLogo theme={theme} className="h-7 max-w-[130px]" />
        <span className="rounded-full bg-rouge px-2 py-0.5 font-display text-[10px] font-bold uppercase text-white">En vivo</span>
      </div>
      <p className="mt-4 font-display text-xl font-bold leading-tight">
        Hola, Sofía <span className="text-rouge">✦</span>
      </p>
      <div className="mt-3 overflow-hidden rounded-2xl border border-white/10">
        <div className="aspect-[3/2] bg-gradient-to-br from-rouge/40 via-surface to-vip/25" />
        <div className="flex items-center justify-between bg-surface px-3 py-2">
          <span className="text-sm font-semibold">Mateo, 27</span>
          <span className="rounded-full bg-rouge/15 px-2 py-0.5 font-display text-[11px] font-bold text-rouge ring-1 ring-inset ring-rouge/35">92% afín</span>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <span className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-xl bg-rouge font-display text-sm font-semibold text-white shadow-glow-rouge">Conectar</span>
        <span className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-xl bg-vip font-display text-sm font-semibold text-background shadow-glow-vip">Pedir</span>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-2xl border border-vip/40 bg-vip/[0.07] px-3 py-2 text-sm">
        <span>🍸 Gin Tonic</span>
        <span className="metric text-vip">{formatMoney(8000)}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-semibold">
        <span className="rounded-xl bg-squad/15 px-2 py-1.5 text-center text-squad">👯 Tu Squad</span>
        <span className="rounded-xl bg-sos px-2 py-1.5 text-center text-white">🚨 Rescate</span>
      </div>
    </div>
  );
}

// ── Cobros con Mercado Pago ───────────────────────────────────────────

function PaymentsPanel({ brand }: { brand: Brand }) {
  const { state, exec, mode, notify } = useRouge();
  const account = state.brand_payment_accounts.find((a) => a.brand_id === brand.id);
  const [busy, setBusy] = useState(false);
  const canConnect = mode === "demo" || MP_ENABLED;

  const connect = async () => {
    if (mode === "demo") {
      const r = await exec(C.connectPaymentsDemo(brand.id));
      if (r.ok) notify({ tone: "squad", title: "Mercado Pago conectado (demo)", description: "Los pedidos de la barra ahora se pagan con Mercado Pago antes de prepararse." });
      return;
    }
    setBusy(true);
    try {
      await connectMercadoPago(brand.id);
    } catch (e) {
      notify({ tone: "rouge", title: "No se pudo conectar", description: mpErrorMessage(e) });
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("¿Desconectar Mercado Pago? Los pedidos nuevos se van a cobrar en la barra.")) return;
    const r = await exec(C.disconnectPayments(brand.id));
    if (r.ok) notify({ tone: "vip", title: "Mercado Pago desconectado", description: "Los pedidos nuevos se cobran en la barra." });
  };

  return (
    <Panel title={<span className="inline-flex items-center gap-2"><Wallet className="size-5 text-vip" /> Cobros con Mercado Pago</span>}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3 text-sm text-muted">
          <p>
            Conectá la cuenta de Mercado Pago de <b className="text-primary">{brand.name}</b>: tus invitados pagan desde la app (billetera de Mercado Pago, dinero en cuenta o
            tarjeta) y la plata entra directo a tu cuenta.
          </p>
          <ul className="space-y-1.5">
            <li>✓ La barra solo prepara pedidos ya pagos: cero fiado, cero fila para cobrar.</li>
            <li>✓ La comisión de Rouge Pass la separa Mercado Pago en cada cobro: no hay que facturarla aparte.</li>
            <li>✓ Nunca vemos tu clave: la autorización se hace en Mercado Pago y se puede revocar cuando quieras.</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          {brand.payments_enabled && account ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="squad" size="md">Conectado</Badge>
                {!account.live_mode && <Badge tone="vip" size="md">Modo prueba</Badge>}
              </div>
              <p className="font-display text-lg font-semibold">{account.account_label}</p>
              <p className="text-xs text-muted">Desde {formatDateTime(account.connected_at)}</p>
              <Button variant="ghost" size="sm" onClick={disconnect}>
                Desconectar
              </Button>
            </div>
          ) : brand.payments_enabled ? (
            <p className="text-sm">Cobros activos. La cuenta conectada la ve solo quien creó la marca.</p>
          ) : (
            <div className="space-y-3">
              <Badge tone="neutral" size="md">Sin conectar · se cobra en la barra</Badge>
              <Button variant="vip" block onClick={connect} disabled={!canConnect || busy}>
                <Wallet /> {busy ? "Abriendo Mercado Pago…" : mode === "demo" ? "Conectar Mercado Pago (demo)" : "Conectar Mercado Pago"}
              </Button>
              {!canConnect && <p className="text-xs text-muted">Los cobros online todavía no están activados en este sitio (NEXT_PUBLIC_PAYMENTS_MP).</p>}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

// ── Personalización de esta edición ───────────────────────────────────

function EventBrandingPanel({ event }: { event: RougeEvent }) {
  const { state, exec, notify } = useRouge();
  const creatorBrands = state.brands.filter((b) => b.owner_id === event.created_by);
  const [brandId, setBrandId] = useState<string | null>(event.brand_id);
  const [own, setOwn] = useState(!!(event.theme_primary || event.theme_accent || event.logo_url));
  const brand = getBrand(state, brandId);
  const base = resolveTheme(null, brand);
  const [logo, setLogo] = useState<string | null>(event.logo_url);
  const [primary, setPrimary] = useState(event.theme_primary ?? base.primary);
  const [accent, setAccent] = useState(event.theme_accent ?? base.accent);
  const errors = own ? { primary: checkBrandColor(primary, "primary"), accent: checkBrandColor(accent, "accent") } : { primary: null, accent: null };
  const theme = resolveTheme(own ? { logo_url: logo, theme_primary: errors.primary ? null : primary, theme_accent: errors.accent ? null : accent } : null, brand);

  const save = async () => {
    const custom = (v: string, fallback: string) => (normalizeHex(v) === normalizeHex(fallback) ? null : v);
    const r = await exec(
      C.upsertEvent({
        id: event.id,
        name: event.name,
        slug: event.slug, // sin slug, upsertEvent lo recalcularía desde el nombre y cambiaría el link
        starts_at: event.starts_at,
        ends_at: event.ends_at,
        brand_id: brandId,
        logo_url: own ? logo : null,
        theme_primary: own ? custom(primary, base.primary) : null,
        theme_accent: own ? custom(accent, base.accent) : null,
      }),
    );
    if (r.ok) notify({ tone: "squad", title: "Evento personalizado", description: `${event.name} ya se ve con estos colores en la app.` });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Panel title={`Esta edición · ${event.name}`}>
        <div className="space-y-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">Marca del evento</span>
            <select
              value={brandId ?? ""}
              onChange={(e) => setBrandId(e.target.value || null)}
              className="min-h-touch w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm font-semibold text-primary focus:outline-none focus:ring-2 focus:ring-vip/50"
            >
              <option value="" className="bg-surface">Sin marca (colores de Rouge Pass)</option>
              {creatorBrands.map((b) => (
                <option key={b.id} value={b.id} className="bg-surface">
                  {b.name}
                  {b.payments_enabled ? " · cobra con Mercado Pago" : ""}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted">La marca define el logo, los colores y la cuenta donde se cobra la barra.</span>
          </label>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Personalización">
            {[
              { v: false, t: "Igual que la marca", d: "Logo y colores de la marca." },
              { v: true, t: "Personalizar esta edición", d: "Otro logo o colores solo para este evento." },
            ].map((o) => (
              <button
                key={String(o.v)}
                type="button"
                role="radio"
                aria-checked={own === o.v}
                onClick={() => setOwn(o.v)}
                className={cn("rounded-2xl border p-3 text-left transition", own === o.v ? "border-vip bg-vip/10" : "border-white/10 bg-white/[0.03]")}
              >
                <span className="block font-display text-sm font-semibold">{o.t}</span>
                <span className="block text-xs text-muted">{o.d}</span>
              </button>
            ))}
          </div>
          {own && (
            <>
              <LogoField label="Logo de esta edición" value={logo} onChange={setLogo} />
              <ColorField label="Color principal" hint="Botones, matches y chat." kind="primary" value={primary} presets={PRIMARY_PRESETS} onChange={setPrimary} error={errors.primary} />
              <ColorField label="Color de acento" hint="Barra, perks y Mesa VIP." kind="accent" value={accent} presets={ACCENT_PRESETS} onChange={setAccent} error={errors.accent} />
            </>
          )}
          <Button variant="vip" onClick={save} disabled={!!errors.primary || !!errors.accent}>
            <Save /> Guardar en el evento
          </Button>
        </div>
      </Panel>
      <Panel title="Vista previa del evento">
        <ThemePreview theme={theme} />
      </Panel>
    </div>
  );
}
