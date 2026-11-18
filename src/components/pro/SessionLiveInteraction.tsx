"use client";

/**
 * Sala en vivo de una charla (ROUGE Pro): dos sub-pestañas.
 *  - Preguntas al orador (Q&A): enviar como "Nombre · Empresa" o anónima, lista por votos ▲ y, para la moderación
 *    (dueño/a, producción), Destacar / Marcar como respondida / Ocultar.
 *  - Encuestas rápidas: la moderación lanza una de opción múltiple; el público vota en un toque y ve los porcentajes.
 * Todo pasa por comandos (`exec(C.…)`): mismas reglas en el demo y en Supabase (RPCs de schema.sql).
 */
import * as C from "@/lib/store/commands";
import { useState } from "react";
import { BarChart3, CheckCheck, CheckCircle2, ChevronUp, EyeOff, Eye, Lock, MessageSquareText, Pin, PinOff, Plus, Radio, RotateCcw, Send, Square, X } from "lucide-react";
import type { SessionQuestion, UUID } from "@/lib/types";
import {
  authorLabel,
  getSession,
  hasVoted,
  isMyQuestion,
  myPollVote,
  openPoll,
  POLL_OPTION_MAX,
  POLL_OPTIONS_MAX,
  POLL_OPTIONS_MIN,
  POLL_QUESTION_MAX,
  pollsOf,
  pollTotals,
  QUESTION_MAX,
  questionsFor,
  type ModerationAction,
} from "@/lib/engine/schedule";
import { getAttendee } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { cn } from "@/lib/utils";
import { LiveBadge, ProButton, ProSurface } from "./scheduleUi";

type Tab = "qa" | "polls";

export function SessionLiveInteraction({ sessionId, moderator = false, className }: { sessionId: UUID; moderator?: boolean; className?: string }) {
  const { state } = useRouge();
  const session = getSession(state, sessionId);
  const [tab, setTab] = useState<Tab>("qa");
  if (!session) return null;
  const open = openPoll(state, sessionId);
  const questions = questionsFor(state, sessionId, state.current_user_id, moderator);
  const pendingCount = questions.filter((q) => q.status === "open").length;

  return (
    <ProSurface className={cn("space-y-4", className)}>
      {moderator && <LiveControl sessionId={sessionId} />}
      {!session.is_live_now && !moderator && (
        <p className="flex items-start gap-2 rounded-xl border border-pro-line bg-pro-slate p-3 text-xs text-pro-mist" data-testid="not-live">
          <Lock className="mt-0.5 size-4 shrink-0" /> La sala de preguntas y las encuestas se abren cuando la organización pone la charla en vivo.
        </p>
      )}
      <div role="tablist" aria-label="Interacción en vivo" className="grid grid-cols-2 gap-1 rounded-xl border border-pro-line bg-pro-navy p-1">
        {(
          [
            { id: "qa", label: "Preguntas al orador", short: "Preguntas", icon: <MessageSquareText className="size-4" />, badge: pendingCount },
            { id: "polls", label: "Encuestas rápidas", short: "Encuestas", icon: <BarChart3 className="size-4" />, badge: open ? 1 : 0 },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            data-testid={`tab-${t.id}`}
            className={cn("flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition", tab === t.id ? "bg-pro-cobalt text-white shadow" : "text-pro-mist hover:text-white")}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.short}</span>
            {t.badge > 0 && <span className={cn("rounded-full px-1.5 font-pro-mono text-[10px] leading-4", tab === t.id ? "bg-white/20" : "bg-pro-panel")}>{t.badge}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel">{tab === "qa" ? <QuestionsPanel sessionId={sessionId} moderator={moderator} questions={questions} /> : <PollsPanel sessionId={sessionId} moderator={moderator} />}</div>
    </ProSurface>
  );
}

/** "Activar En Vivo" / "Terminar en vivo" (solo moderación). */
export function LiveControl({ sessionId, compact = false }: { sessionId: UUID; compact?: boolean }) {
  const { state, exec, notify } = useRouge();
  const session = getSession(state, sessionId);
  if (!session) return null;
  const toggle = async () => {
    const r = await exec(C.setSessionLive(session.event_id, sessionId, !session.is_live_now));
    if (r.ok) notify({ tone: r.data.is_live_now ? "squad" : "info", title: r.data.is_live_now ? "🔴 Charla en vivo" : "Charla terminada", description: r.data.is_live_now ? "Se abrieron las preguntas y las encuestas." : "Se cerraron las preguntas y la encuesta abierta." });
  };
  return compact ? (
    <ProButton tone={session.is_live_now ? "success" : "primary"} size="sm" onClick={toggle} data-testid={`live-toggle-${sessionId}`}>
      {session.is_live_now ? <Square /> : <Radio />} {session.is_live_now ? "Terminar en vivo" : "Activar En Vivo"}
    </ProButton>
  ) : (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-pro-line bg-pro-slate p-3">
      <span className="min-w-0 text-xs text-pro-mist">
        {session.is_live_now ? <LiveBadge className="mb-1" /> : <b className="block text-sm text-white">Fuera del aire</b>}
        <span className="block">{session.is_live_now ? "El público puede preguntar, votar y responder encuestas." : "Activala para abrir preguntas y encuestas."}</span>
      </span>
      <LiveControl sessionId={sessionId} compact />
    </div>
  );
}

// ── Q&A ──────────────────────────────────────────────────────────────

function QuestionsPanel({ sessionId, moderator, questions }: { sessionId: UUID; moderator: boolean; questions: SessionQuestion[] }) {
  const { state, exec, notify } = useRouge();
  const session = getSession(state, sessionId)!;
  const me = state.current_user_id;
  const attendee = !!getAttendee(state, session.event_id, me);
  const [body, setBody] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [sending, setSending] = useState(false);
  const signature = authorLabel(state, session.event_id, me);
  const canAsk = attendee && session.is_live_now;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    const r = await exec(C.askQuestion(me, sessionId, body, anonymous));
    setSending(false);
    if (!r.ok) return;
    setBody("");
    notify({ tone: "squad", title: "Pregunta enviada", description: anonymous ? "Se publicó como anónima." : `Firmada como ${signature}.` });
  };

  return (
    <div className="space-y-3">
      {canAsk && (
        <form onSubmit={send} className="space-y-2.5 rounded-2xl border border-pro-line bg-pro-slate p-3" data-testid="ask-form">
          <label className="block">
            <span className="sr-only">Tu pregunta</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, QUESTION_MAX))}
              rows={2}
              placeholder="Escribí tu pregunta para el orador…"
              className="w-full resize-none rounded-xl border border-pro-line bg-pro-navy p-3 text-sm text-white placeholder:text-pro-mist/70 focus:outline-none focus:ring-2 focus:ring-pro-sapphire"
              data-testid="ask-input"
            />
          </label>
          <div role="radiogroup" aria-label="Cómo se publica" className="grid grid-cols-[1fr_auto] gap-1 rounded-lg border border-pro-line bg-pro-navy p-1 text-xs">
            {[
              { v: false, label: `Enviar como ${signature}` },
              { v: true, label: "Anónimo" },
            ].map((o) => (
              <button
                key={String(o.v)}
                type="button"
                role="radio"
                aria-checked={anonymous === o.v}
                onClick={() => setAnonymous(o.v)}
                className={cn("min-h-[36px] rounded-md px-3 py-1 text-left font-semibold leading-tight transition", anonymous === o.v ? "bg-pro-panel text-white" : "text-pro-mist hover:text-white")}
                title={o.label}
                data-testid={o.v ? "ask-anonymous" : "ask-named"}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-pro-mono text-[10px] text-pro-mist">
              {body.length}/{QUESTION_MAX}
            </span>
            <ProButton type="submit" tone="primary" size="sm" disabled={sending || body.trim().length < 3} data-testid="ask-send">
              <Send /> Enviar pregunta
            </ProButton>
          </div>
        </form>
      )}
      {!attendee && !moderator && <p className="text-xs text-pro-mist">Entrá al evento para preguntar y votar.</p>}

      {questions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-pro-line p-5 text-center text-sm text-pro-mist">Todavía no hay preguntas. {canAsk && "¡Hacé la primera!"}</p>
      ) : (
        <ul className="space-y-2" data-testid="questions">
          {questions.map((q) => (
            <QuestionRow key={q.id} q={q} moderator={moderator} canVote={canAsk} mine={isMyQuestion(state, me, q.id)} voted={hasVoted(state, me, q.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function QuestionRow({ q, moderator, canVote, mine, voted }: { q: SessionQuestion; moderator: boolean; canVote: boolean; mine: boolean; voted: boolean }) {
  const { state, exec } = useRouge();
  const me = state.current_user_id;
  const onModerate = (a: ModerationAction) => exec(C.moderateQuestion(q.event_id, q.id, a));
  const voteDisabled = !canVote || mine || q.status === "hidden";
  return (
    <li
      className={cn(
        "flex gap-3 rounded-2xl border p-3",
        q.is_featured ? "border-pro-sapphire/50 bg-pro-sapphire/10" : q.status === "hidden" ? "border-dashed border-pro-line bg-pro-navy opacity-70" : "border-pro-line bg-pro-slate",
      )}
      data-testid={`question-${q.id}`}
    >
      <button
        type="button"
        onClick={() => exec(C.toggleQuestionVote(me, q.id))}
        disabled={voteDisabled}
        aria-pressed={voted}
        aria-label={`${voted ? "Quitar voto" : "Votar"} (${q.upvotes} votos)`}
        title={mine ? "Es tu pregunta" : undefined}
        className={cn(
          "flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border font-pro-mono text-sm font-semibold tabular-nums transition disabled:cursor-default",
          voted ? "border-pro-cobalt bg-pro-cobalt text-white" : "border-pro-line bg-pro-navy text-pro-alabaster hover:border-pro-mist/40",
          voteDisabled && !voted && "text-pro-mist",
        )}
        data-testid={`upvote-${q.id}`}
      >
        <ChevronUp className="size-4" />
        {q.upvotes}
      </button>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          {q.is_featured && (
            <span className="inline-flex items-center gap-1 rounded-md bg-pro-sapphire px-1.5 py-0.5 font-pro-mono text-[10px] font-bold uppercase tracking-[0.12em] text-white">
              <Pin className="size-3" /> Destacada
            </span>
          )}
          {q.status === "answered" && (
            <span className="inline-flex items-center gap-1 rounded-md border border-pro-emerald/50 bg-pro-emerald/15 px-1.5 py-0.5 font-pro-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
              <CheckCheck className="size-3" /> Respondida
            </span>
          )}
          {q.status === "hidden" && (
            <span className="inline-flex items-center gap-1 rounded-md border border-pro-line px-1.5 py-0.5 font-pro-mono text-[10px] uppercase tracking-[0.12em] text-pro-mist">
              <EyeOff className="size-3" /> Oculta
            </span>
          )}
          {mine && <span className="rounded-md border border-pro-gold/50 bg-pro-gold/10 px-1.5 py-0.5 font-pro-mono text-[10px] uppercase tracking-[0.12em] text-white">Tu pregunta</span>}
        </div>
        <p className="break-words text-sm leading-snug text-white">{q.body}</p>
        <p className="mt-1 truncate text-[11px] text-pro-mist">{q.is_anonymous ? "Anónimo" : q.author_label}</p>
        {moderator && (
          <div className="mt-2 flex flex-wrap gap-1.5" data-testid={`moderate-${q.id}`}>
            {q.status !== "hidden" && (
              <ProButton size="sm" tone={q.is_featured ? "success" : "outline"} onClick={() => onModerate(q.is_featured ? "unfeature" : "feature")}>
                {q.is_featured ? <PinOff /> : <Pin />} {q.is_featured ? "Quitar destacado" : "Destacar"}
              </ProButton>
            )}
            {q.status === "open" && (
              <ProButton size="sm" onClick={() => onModerate("answer")}>
                <CheckCircle2 /> Marcar como respondida
              </ProButton>
            )}
            {q.status === "answered" && (
              <ProButton size="sm" tone="ghost" onClick={() => onModerate("reopen")}>
                <RotateCcw /> Reabrir
              </ProButton>
            )}
            {q.status === "hidden" ? (
              <ProButton size="sm" tone="ghost" onClick={() => onModerate("unhide")}>
                <Eye /> Mostrar
              </ProButton>
            ) : (
              <ProButton size="sm" tone="ghost" onClick={() => onModerate("hide")}>
                <EyeOff /> Ocultar
              </ProButton>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

// ── Encuestas ────────────────────────────────────────────────────────

function PollsPanel({ sessionId, moderator }: { sessionId: UUID; moderator: boolean }) {
  const { state, exec, notify } = useRouge();
  const session = getSession(state, sessionId)!;
  const me = state.current_user_id;
  const attendee = !!getAttendee(state, session.event_id, me);
  const polls = pollsOf(state, sessionId);
  const open = polls.find((p) => p.status === "open");
  const closed = polls.filter((p) => p.status === "closed");

  return (
    <div className="space-y-3">
      {moderator && session.is_live_now && <PollComposer sessionId={sessionId} eventId={session.event_id} replacing={!!open} />}
      {open ? (
        <PollCard key={open.id} pollId={open.id} canVote={attendee && session.is_live_now} moderator={moderator} onClose={async () => {
          const r = await exec(C.closePoll(session.event_id, open.id));
          if (r.ok) notify({ tone: "info", title: "Encuesta cerrada", description: open.question });
        }} />
      ) : (
        <p className="rounded-2xl border border-dashed border-pro-line p-5 text-center text-sm text-pro-mist" data-testid="no-poll">
          {moderator ? (session.is_live_now ? "Lanzá una encuesta para la sala." : "Activá la charla en vivo para lanzar encuestas.") : "No hay una encuesta abierta. Cuando la organización lance una, aparece acá."}
        </p>
      )}
      {closed.length > 0 && (
        <details className="group rounded-2xl border border-pro-line bg-pro-slate">
          <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold">
            Resultados anteriores ({closed.length})
            <ChevronUp className="size-4 rotate-180 text-pro-mist transition group-open:rotate-0" />
          </summary>
          <div className="space-y-2 px-3 pb-3">
            {closed.map((p) => (
              <PollCard key={p.id} pollId={p.id} canVote={false} moderator={moderator} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function PollCard({ pollId, canVote, moderator, onClose }: { pollId: UUID; canVote: boolean; moderator: boolean; onClose?: () => void }) {
  const { state, exec } = useRouge();
  const poll = state.session_polls.find((p) => p.id === pollId);
  if (!poll) return null;
  const mine = myPollVote(state, state.current_user_id, pollId);
  const { total, rows } = pollTotals(poll);
  // Los porcentajes se ven después de votar (o al cerrar, o para la moderación): el voto no se contagia.
  const showResults = !!mine || poll.status === "closed" || moderator || !canVote;
  return (
    <section className={cn("space-y-3 rounded-2xl border p-4", poll.status === "open" ? "border-pro-sapphire/50 bg-pro-navy" : "border-pro-line bg-pro-navy/60")} data-testid={`poll-${poll.id}`}>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-pro-mono text-[10px] uppercase tracking-[0.16em] text-pro-mist">{poll.status === "open" ? "Encuesta en vivo" : "Encuesta cerrada"}</p>
          <h3 className="mt-0.5 font-pro text-[15px] font-semibold leading-snug text-white">{poll.question}</h3>
        </div>
        {onClose && moderator && poll.status === "open" && (
          <ProButton size="sm" tone="ghost" onClick={onClose} data-testid="poll-close">
            <X /> Cerrar
          </ProButton>
        )}
      </header>
      <ul className="space-y-2">
        {rows.map(({ option, votes, pct }) => {
          const chosen = mine === option.id;
          return (
            <li key={option.id}>
              <button
                type="button"
                disabled={!canVote || poll.status !== "open"}
                onClick={() => exec(C.votePoll(state.current_user_id, pollId, option.id))}
                aria-pressed={chosen}
                className={cn(
                  "relative flex min-h-touch w-full items-center gap-2 overflow-hidden rounded-xl border px-3 text-left text-sm transition disabled:cursor-default",
                  chosen ? "border-pro-cobalt" : "border-pro-line hover:border-pro-mist/40",
                  !showResults && "hover:bg-pro-panel",
                )}
                data-testid={`poll-option-${option.id}`}
              >
                {showResults && (
                  <span
                    className={cn("absolute inset-y-0 left-0 transition-[width] duration-700 ease-out", chosen ? "bg-pro-cobalt/40" : "bg-pro-panel")}
                    style={{ width: `${pct}%` }}
                    aria-hidden
                  />
                )}
                <span className="relative flex min-w-0 flex-1 items-center gap-2">
                  {chosen && <CheckCircle2 className="size-4 shrink-0 text-pro-alabaster" aria-label="Tu voto" />}
                  <span className="truncate font-medium text-white">{option.label}</span>
                </span>
                {showResults && (
                  <span className="relative shrink-0 font-pro-mono text-xs font-semibold tabular-nums text-white">
                    {pct}% <span className="text-pro-mist">· {votes}</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="font-pro-mono text-[10px] text-pro-mist">
        {total} {total === 1 ? "voto" : "votos"}
        {canVote && poll.status === "open" && (mine ? " · Podés cambiar tu voto mientras esté abierta" : " · Tocá una opción para votar")}
      </p>
    </section>
  );
}

function PollComposer({ sessionId, eventId, replacing }: { sessionId: UUID; eventId: UUID; replacing: boolean }) {
  const { exec, notify } = useRouge();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const launch = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await exec(C.launchPoll(eventId, sessionId, question, options));
    if (!r.ok) return;
    notify({ tone: "squad", title: "📊 Encuesta lanzada", description: r.data.question });
    setQuestion("");
    setOptions(["", ""]);
    setOpen(false);
  };
  if (!open)
    return (
      <ProButton tone="primary" className="w-full" onClick={() => setOpen(true)} data-testid="poll-new">
        <Plus /> {replacing ? "Lanzar otra encuesta (cierra la actual)" : "Lanzar encuesta"}
      </ProButton>
    );
  const input = "min-h-[44px] w-full rounded-xl border border-pro-line bg-pro-navy px-3 text-sm text-white placeholder:text-pro-mist/70 focus:outline-none focus:ring-2 focus:ring-pro-sapphire";
  return (
    <form onSubmit={launch} className="space-y-2.5 rounded-2xl border border-pro-line bg-pro-slate p-3" data-testid="poll-form">
      <input value={question} onChange={(e) => setQuestion(e.target.value.slice(0, POLL_QUESTION_MAX))} placeholder="Pregunta de la encuesta" className={input} aria-label="Pregunta de la encuesta" data-testid="poll-question" />
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={o}
            onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value.slice(0, POLL_OPTION_MAX) : x)))}
            placeholder={`Opción ${i + 1}`}
            className={input}
            aria-label={`Opción ${i + 1}`}
            data-testid={`poll-opt-${i}`}
          />
          {options.length > POLL_OPTIONS_MIN && (
            <button type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))} className="grid size-11 shrink-0 place-items-center rounded-xl text-pro-mist hover:bg-pro-panel hover:text-white" aria-label={`Quitar opción ${i + 1}`}>
              <X className="size-4" />
            </button>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {options.length < POLL_OPTIONS_MAX ? (
          <ProButton size="sm" tone="ghost" onClick={() => setOptions([...options, ""])}>
            <Plus /> Opción
          </ProButton>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <ProButton size="sm" tone="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </ProButton>
          <ProButton type="submit" size="sm" tone="primary" disabled={question.trim().length < 3 || filled.length < POLL_OPTIONS_MIN} data-testid="poll-launch">
            <BarChart3 /> Lanzar
          </ProButton>
        </div>
      </div>
    </form>
  );
}
