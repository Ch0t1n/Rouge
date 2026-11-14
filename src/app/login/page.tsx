"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Mail, MailCheck } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { useRouge } from "@/lib/store/RougeContext";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";

/** Ingreso con magic link (Supabase Auth). En Modo Demo no hace falta: redirige. */
export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

const safeNext = (n: string | null) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/");

function Login() {
  const { mode, signedIn } = useRouge();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "demo" || signedIn) router.replace(next);
  }, [mode, signedIn, next, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb) return;
    setBusy(true);
    setError(null);
    const { error: err } = await sb.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/login?next=${encodeURIComponent(next)}`, shouldCreateUser: true },
    });
    setBusy(false);
    if (err) setError(friendlyError(err));
    else setSent(true);
  };

  if (mode === "demo" || signedIn) return null;

  return (
    <main className="safe-top flex min-h-dvh flex-col justify-center px-6 pb-10">
      <p className="font-display text-5xl font-bold tracking-tight text-rouge text-glow-rouge">ROUGE</p>
      <h1 className="mt-6 text-[28px] leading-tight">La noche, conectada.</h1>
      <p className="mt-2 text-sm text-muted">Entrá con tu email. Te mandamos un link mágico: sin contraseñas que recordar a las 3 AM.</p>

      {sent ? (
        <section className="mt-8 rounded-3xl border border-squad/40 bg-squad/[0.07] p-5" role="status">
          <MailCheck className="size-8 text-squad" />
          <h2 className="mt-3 text-xl">Revisá tu mail</h2>
          <p className="mt-1 text-sm text-primary/85">
            Te enviamos un link a <b>{email}</b>. Abrilo desde este teléfono para entrar.
          </p>
          <Button variant="ghost" className="mt-3 px-0" onClick={() => setSent(false)}>
            Usar otro email
          </Button>
        </section>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-4">
          <TextField label="Email" type="email" inputMode="email" autoComplete="email" required placeholder="vos@mail.com" value={email} onChange={(e) => setEmail(e.target.value)} error={error} prefix={<Mail className="size-4" />} className="pl-10" />
          <Button type="submit" block size="lg" disabled={busy || !/^\S+@\S+\.\S+$/.test(email)}>
            {busy ? "Enviando…" : "Enviarme el link"} <ArrowRight />
          </Button>
          <p className="text-center text-xs text-muted">Al entrar aceptás que el organizador del evento vea tu nombre, edad y teléfono para tu entrada.</p>
        </form>
      )}
    </main>
  );
}
