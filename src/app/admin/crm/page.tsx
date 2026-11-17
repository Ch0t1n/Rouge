"use client";

import { useMemo, useState } from "react";
import * as C from "@/lib/store/commands";
import { ArrowDownUp, Ban, Download, MessageCircle, Search, UserX } from "lucide-react";
import { MOOD_TAGS } from "@/lib/types";
import { crmRows, SMART_TAG_META, type CrmRow, type SmartTag } from "@/lib/engine/analytics";
import { formatPhone } from "@/lib/engine/profile";
import { activeEvent, getProfile } from "@/lib/engine/selectors";
import { staffRoleOf } from "@/lib/engine/roles";
import { useRouge } from "@/lib/store/RougeContext";
import { cn, formatMoney, toCSV, whatsappLink } from "@/lib/utils";
import { AdminHeader, downloadCSV } from "@/components/admin/AdminChrome";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { faceOf, verticalOf } from "@/lib/engine/verticals";

type SortKey = "total_spent" | "squad_size" | "matches" | "age" | "full_name";
const GENDER: Record<CrmRow["gender"], string> = { female: "Mujer", male: "Hombre", non_binary: "No binarie", undisclosed: "—" };

export default function AdminCrmPage() {
  const { state, exec, notify } = useRouge();
  const event = activeEvent(state)!;
  const bans = state.event_bans.filter((b) => b.event_id === event.id);
  const v = verticalOf(state, event.id);
  const pro = v.kind === "corporate";
  /** Expulsar del evento: deja el lobby, su Squad de hoy y el plano; con bloqueo, no puede volver a entrar. */
  const expel = async (r: CrmRow) => {
    const first = r.full_name.split(" ")[0];
    if (!window.confirm(`¿Expulsar a ${first} de ${event.name}? Sale del lobby, de su Squad de esta noche y del plano.`)) return;
    const ban = window.confirm(`¿Bloquear también que ${first} vuelva a entrar a este evento (con cualquier código)?`);
    const res = await exec(C.removeAttendee(event.id, r.user_id, ban));
    if (res.ok) notify({ tone: "vip", title: `${first} fue expulsado/a`, description: ban ? "No puede volver a entrar a este evento." : "Puede volver a entrar con su código." });
  };
  const all = useMemo(() => crmRows(state, event.id), [state, event.id]);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<SmartTag | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "total_spent", dir: -1 });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^@/, "");
    return all
      .filter((r) => !tag || r.tags.includes(tag))
      .filter((r) => !needle || r.full_name.toLowerCase().includes(needle) || r.username.includes(needle) || r.music_genres.some((g) => g.toLowerCase().includes(needle)) || r.company.toLowerCase().includes(needle))
      .sort((a, b) => {
        const va = a[sort.key];
        const vb = b[sort.key];
        return (typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number)) * sort.dir;
      });
  }, [all, q, tag, sort]);

  const total = rows.reduce((acc, r) => acc + r.total_spent, 0);

  const exportCsv = () =>
    downloadCSV(
      `crm-${event.slug}.csv`,
      toCSV(
        rows.map((r) => ({
          nombre: r.full_name,
          username: `@${r.username}`,
          telefono: r.phone ?? "",
          whatsapp: r.phone ? whatsappLink(r.phone) : "",
          ...(pro
            ? { empresa: r.company, cargo: r.job_title, rubro: r.industry ?? "", busca: r.looking_for, ofrece: r.offering, linkedin: r.linkedin_url ?? "" }
            : { edad: r.age, genero: GENDER[r.gender], generos_musicales: r.music_genres }),
          mood: MOOD_TAGS.find((m) => m.id === r.mood)?.label ?? "",
          tamano_squad: r.squad_size,
          matches: r.matches,
          gasto_total: r.total_spent,
          tags: r.tags.map((t) => SMART_TAG_META[t].label),
          ingreso: r.joined_at,
        })),
      ),
    );

  const Th = ({ k, children, className }: { k?: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={cn("px-3 py-3 font-semibold", className)}>
      {k ? (
        <button type="button" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : -1 }))} className={cn("inline-flex items-center gap-1 uppercase", sort.key === k && "text-vip")}>
          {children} <ArrowDownUp className="size-3" />
        </button>
      ) : (
        children
      )}
    </th>
  );

  return (
    <main className="mx-auto max-w-7xl 2xl:max-w-[1600px] space-y-6 px-5 py-6 lg:px-10 lg:py-10">
      <AdminHeader
        title="CRM de asistentes"
        subtitle={`${all.length} asistentes registrados · datos para remarketing y fidelización (con consentimiento del usuario).`}
        actions={
          <>
            <Link href="/admin/blasts#whatsapp" className={buttonVariants({ variant: "glass" })}>
              <MessageCircle /> Campaña por WhatsApp
            </Link>
            <Button variant="vip" onClick={exportCsv} disabled={!rows.length}>
              <Download /> Exportar CSV ({rows.length})
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[240px] flex-1">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pro ? "Buscar por nombre o empresa (atajo: /)" : "Buscar por nombre, @username o género musical (atajo: /)"} data-admin-search className="min-h-touch w-full rounded-2xl border border-white/10 bg-white/[0.04] pl-9 pr-3 text-sm focus:border-vip/50 focus:outline-none" />
        </label>
        <button type="button" onClick={() => setTag(null)} className={cn("min-h-[40px] rounded-full px-3 text-xs font-semibold", !tag ? "bg-vip text-background" : "bg-white/[0.05] text-muted")}>
          Todos
        </button>
        {(Object.keys(SMART_TAG_META) as SmartTag[]).map((t) => (
          <button key={t} type="button" onClick={() => setTag(tag === t ? null : t)} className={cn("min-h-[40px] rounded-full px-3 text-xs font-semibold", tag === t ? "bg-vip text-background" : "bg-white/[0.05] text-muted")}>
            {SMART_TAG_META[t].emoji} {SMART_TAG_META[t].label} · {all.filter((r) => r.tags.includes(t)).length}
          </button>
        ))}
      </div>

      <div className="glass overflow-hidden rounded-3xl">
        {/* Alta densidad: cabecera fija dentro de la tabla con scroll propio (monitores anchos) */}
        <div className="max-h-[calc(100dvh-16rem)] overflow-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="sticky top-0 z-10 bg-surface/95 text-left text-xs uppercase tracking-wider text-muted backdrop-blur">
              <tr>
                <Th k="full_name" className="pl-5">Asistente</Th>
                <Th>Teléfono</Th>
                {pro ? (
                  <>
                    <Th>Empresa · cargo</Th>
                    <Th>Busca / ofrece</Th>
                  </>
                ) : (
                  <>
                    <Th k="age">Edad</Th>
                    <Th>Géneros</Th>
                  </>
                )}
                <Th k="squad_size">{v.copy.squad}</Th>
                <Th k="matches">{v.copy.matches}</Th>
                <Th>Tags</Th>
                <Th k="total_spent" className="text-right">Gasto</Th>
                <Th className="pr-5"><span className="sr-only">Acciones</span></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="py-3 pl-5 pr-3">
                    <p className="font-semibold">{r.full_name}</p>
                    <p className="text-xs text-muted">{pro ? r.industry ?? "—" : `@${r.username} · ${GENDER[r.gender]}`}{r.mood ? ` · ${MOOD_TAGS.find((m) => m.id === r.mood)?.emoji}` : ""}</p>
                  </td>
                  <td className="px-3 py-3">
                    {r.phone ? (
                      <a href={whatsappLink(r.phone, pro ? `¡Hola ${r.full_name.split(" ")[0]}! Gracias por venir a ${event.name}.` : `¡Hola ${r.full_name.split(" ")[0]}! Gracias por venir a ${event.name} 🔥`)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-squad hover:underline">
                        <MessageCircle className="size-3.5" /> {formatPhone(r.phone)}
                      </a>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  {pro ? (
                    <>
                      <td className="px-3 py-3 text-xs">
                        <p className="font-semibold text-primary">{r.company || "—"}</p>
                        <p className="text-muted">{r.job_title}</p>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted">
                        <p>Busca: {r.looking_for.join(", ") || "—"}</p>
                        <p>Ofrece: {r.offering.join(", ") || "—"}</p>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-3 tabular-nums">{r.age}</td>
                      <td className="px-3 py-3 text-xs text-muted">{r.music_genres.join(", ")}</td>
                    </>
                  )}
                  <td className="px-3 py-3 tabular-nums">{r.squad_size || "—"}</td>
                  <td className="px-3 py-3 tabular-nums">{r.matches}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {r.tags.map((t) => (
                        <Badge key={t} tone={SMART_TAG_META[t].color}>{SMART_TAG_META[t].emoji} {SMART_TAG_META[t].label}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="metric py-3 pl-3 text-right text-vip">{formatMoney(r.total_spent)}</td>
                  <td className="py-3 pl-2 pr-5 text-right">
                    {!staffRoleOf(state, event.id, r.user_id) && (
                      <button type="button" onClick={() => expel(r)} aria-label={`Expulsar a ${r.full_name}`} title="Expulsar del evento" className="grid size-9 place-items-center rounded-xl text-muted hover:bg-rouge/15 hover:text-rouge">
                        <UserX className="size-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/10 text-sm">
                <td colSpan={7} className="px-5 py-3 text-muted">{rows.length} asistentes</td>
                <td className="metric py-3 pl-3 text-right text-vip">{formatMoney(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      {bans.length > 0 && (
        <section className="glass rounded-3xl p-5" aria-labelledby="bans">
          <h2 id="bans" className="flex items-center gap-2 text-lg"><Ban className="size-5 text-rouge" /> Bloqueados en este evento</h2>
          <ul className="mt-3 divide-y divide-white/5">
            {bans.map((b) => {
              const p = faceOf(state, b.user_id);
              return (
                <li key={b.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>{p ? `${p.full_name} · @${p.username}` : "Perfil no disponible"}{b.reason ? <span className="text-muted"> — {b.reason}</span> : null}</span>
                  <Button size="sm" variant="ghost" onClick={() => exec(C.unbanAttendee(event.id, b.user_id))}>Permitir que vuelva</Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <p className="text-xs text-muted">
        Smart Tags: 🏆 Top Spender = top 10% de consumo · 👑 Squad Leader = creó un Squad de 4+ o sumó 4+ amigos · 🔥 Power Matcher = 3+ matches en la noche.
      </p>
    </main>
  );
}
