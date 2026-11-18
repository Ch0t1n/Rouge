"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, Loader2, X } from "lucide-react";
import { LEAD_EVENT_TYPES, validateLead, type LeadEventType, type LeadField } from "@/lib/leads";
import { cn } from "@/lib/utils";

export const PRO_SALES_EMAIL = process.env.NEXT_PUBLIC_SALES_EMAIL ?? "";

// ── Modal de demo: cualquier CTA de la página lo abre con useDemoRequest() ──

interface DemoCtx {
  open: (source?: string) => void;
}
const Ctx = createContext<DemoCtx>({ open: () => undefined });
export const useDemoRequest = () => useContext(Ctx);

export function ProDemoProvider({ children }: { children: ReactNode }) {
  const [source, setSource] = useState<string | null>(null);
  const open = useCallback((s = "pro · modal") => setSource(s), []);
  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {source && <ProDemoModal source={source} onClose={() => setSource(null)} />}
    </Ctx.Provider>
  );
}

function ProDemoModal({ source, onClose }: { source: string; onClose: () => void }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLInputElement>("input")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-pro-navy/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-pro-line-light bg-white p-6 text-pro-ink shadow-2xl sm:rounded-3xl sm:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="font-pro-mono text-xs uppercase tracking-[0.2em] text-pro-cobalt">Demo ejecutiva</p>
            <h2 id={titleId} className="mt-1 font-pro text-2xl font-bold tracking-[-0.02em]">
              Agendemos 20 minutos con tu evento
            </h2>
            <p className="mt-1 text-sm text-pro-ink-soft">Te mostramos la plataforma con tu agenda, tu plano y tus salas.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="grid size-11 shrink-0 place-items-center rounded-full text-pro-ink-soft hover:bg-pro-alabaster">
            <X className="size-5" />
          </button>
        </div>
        <ProDemoForm source={source} compact onDone={() => undefined} />
      </div>
    </div>
  );
}

// ── Formulario (inline y en el modal) ─────────────────────────────────

type FormState = { name: string; company: string; job_title: string; email: string; whatsapp: string; event_type: LeadEventType | ""; attendees: string; message: string; website: string };
const EMPTY: FormState = { name: "", company: "", job_title: "", email: "", whatsapp: "", event_type: "", attendees: "", message: "", website: "" };

/**
 * Pedido de demo B2B → POST /api/leads (misma validación que el servidor: validateLead). Honeypot anti-spam.
 * Si el servidor no está configurado, ofrece el mail de ventas (NEXT_PUBLIC_SALES_EMAIL).
 */
export function ProDemoForm({ source = "pro", compact, onDone, tone = "light" }: { source?: string; compact?: boolean; onDone?: () => void; tone?: "light" | "dark" }) {
  const [f, setF] = useState<FormState>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [serverError, setServerError] = useState<string | null>(null);
  const v = validateLead({ ...f, source });
  const errors: Partial<Record<LeadField, string>> = !v.ok && touched ? v.errors : {};
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const dark = tone === "dark";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!v.ok) return;
    setStatus("sending");
    setServerError(null);
    try {
      const res = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, attendees: Number(f.attendees), source }) });
      if (res.ok) {
        setStatus("sent");
        onDone?.();
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setServerError(body?.error?.message ?? "No pudimos enviar tu pedido. Probá de nuevo.");
      setStatus("error");
    } catch {
      setServerError("Sin conexión. Probá de nuevo en un momento.");
      setStatus("error");
    }
  };

  if (status === "sent") {
    return (
      <div role="status" className={cn("flex flex-col items-center rounded-2xl border p-8 text-center", dark ? "border-pro-line bg-pro-panel/70 text-white" : "border-pro-line-light bg-pro-alabaster")}>
        <span className="grid size-14 place-items-center rounded-full bg-pro-emerald/15 text-pro-emerald">
          <Check className="size-7" />
        </span>
        <h3 className="mt-4 font-pro text-2xl font-bold tracking-[-0.02em]">¡Gracias, {f.name.split(" ")[0]}!</h3>
        <p className={cn("mt-2 text-sm", dark ? "text-pro-mist" : "text-pro-ink-soft")}>Recibimos tu pedido. Te escribimos a {f.email} en el día hábil para coordinar la demo.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="relative grid gap-4 sm:grid-cols-2">
      <Field dark={dark} label="Nombre y apellido" error={errors.name}>
        <input autoComplete="name" value={f.name} onChange={set("name")} className={input(dark, !!errors.name)} />
      </Field>
      <Field dark={dark} label="Empresa / Organización" error={errors.company}>
        <input autoComplete="organization" value={f.company} onChange={set("company")} className={input(dark, !!errors.company)} />
      </Field>
      <Field dark={dark} label="Cargo" error={errors.job_title} hint="Opcional">
        <input autoComplete="organization-title" value={f.job_title} onChange={set("job_title")} placeholder="Ej. Directora de Eventos" className={input(dark, !!errors.job_title)} />
      </Field>
      <Field dark={dark} label="Tipo de evento" error={errors.event_type}>
        <select value={f.event_type} onChange={set("event_type")} className={input(dark, !!errors.event_type)}>
          <option value="">Elegí una opción</option>
          {LEAD_EVENT_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <Field dark={dark} label="Email corporativo" error={errors.email}>
        <input type="email" autoComplete="email" inputMode="email" value={f.email} onChange={set("email")} className={input(dark, !!errors.email)} />
      </Field>
      <Field dark={dark} label="WhatsApp" error={errors.whatsapp} hint="Opcional">
        <input type="tel" autoComplete="tel" inputMode="tel" placeholder="11 2345-6789" value={f.whatsapp} onChange={set("whatsapp")} className={input(dark, !!errors.whatsapp)} />
      </Field>
      <Field dark={dark} label="Cantidad estimada de asistentes" error={errors.attendees}>
        <input type="number" inputMode="numeric" min={10} placeholder="Ej. 600" value={f.attendees} onChange={set("attendees")} className={cn(input(dark, !!errors.attendees), "font-pro-mono")} />
      </Field>
      {!compact && (
        <div className="sm:col-span-2">
          <Field dark={dark} label="Contanos tu evento" error={errors.message} hint="Opcional">
            <textarea rows={3} maxLength={1000} value={f.message} onChange={set("message")} placeholder="Fecha, sede, formato, qué te gustaría resolver…" className={cn(input(dark, !!errors.message), "min-h-[96px] py-3")} />
          </Field>
        </div>
      )}
      {/* Honeypot anti-spam: invisible para personas */}
      <div aria-hidden className="absolute left-[-9999px] top-auto size-px overflow-hidden">
        <label>
          Sitio web
          <input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} />
        </label>
      </div>
      {serverError && (
        <p role="alert" className="text-sm text-red-600 sm:col-span-2">
          {serverError}
          {PRO_SALES_EMAIL && (
            <>
              {" "}
              También podés escribirnos a{" "}
              <a className="underline" href={`mailto:${PRO_SALES_EMAIL}`}>
                {PRO_SALES_EMAIL}
              </a>
              .
            </>
          )}
        </p>
      )}
      <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", compact ? "sm:col-span-2" : "sm:col-span-2")}>
        <p className={cn("text-xs", dark ? "text-pro-mist" : "text-pro-ink-soft")}>Usamos tus datos solo para responderte. Sin newsletters.</p>
        <button
          type="submit"
          disabled={status === "sending"}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-pro-cobalt px-6 font-pro text-sm font-semibold text-white shadow-[0_8px_30px_rgba(29,78,216,0.35)] transition hover:bg-pro-sapphire disabled:opacity-60"
        >
          {status === "sending" ? <Loader2 className="size-4 animate-spin" /> : null}
          {status === "sending" ? "Enviando…" : "Solicitar demo"} {status !== "sending" && <ArrowRight className="size-4" />}
        </button>
      </div>
    </form>
  );
}

const input = (dark: boolean, bad: boolean) =>
  cn(
    "min-h-[48px] w-full rounded-xl border px-4 font-pro text-[15px] transition focus:outline-none focus:ring-2",
    dark ? "border-pro-line bg-pro-slate text-white placeholder:text-pro-mist/60" : "border-pro-line-light bg-white text-pro-ink placeholder:text-pro-mist",
    bad ? "border-red-500/70 focus:ring-red-500/30" : "focus:border-pro-sapphire focus:ring-pro-sapphire/25",
  );

function Field({ label, error, hint, children, dark }: { label: string; error?: string; hint?: string; children: ReactNode; dark: boolean }) {
  return (
    <label className="block space-y-1.5">
      <span className={cn("flex items-baseline justify-between font-pro text-[13px] font-semibold", dark ? "text-white" : "text-pro-ink")}>
        {label}
        {hint && <span className={cn("text-[11px] font-normal", dark ? "text-pro-mist" : "text-pro-ink-soft")}>{hint}</span>}
      </span>
      {children}
      {error && <span className="block text-xs text-red-600">{error}</span>}
    </label>
  );
}
