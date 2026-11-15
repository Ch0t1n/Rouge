"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { safeNext } from "@/lib/engine/roles";
import { InstagramIcon } from "@/components/ui/brand-icons";
import { buttonVariants } from "@/components/ui/button";

/**
 * /api/instagram/callback redirige acá con #token_hash=… (fragmento: nunca llega al servidor).
 * Lo canjeamos por la sesión de Supabase y seguimos a /login, que lleva a cada uno a su pantalla
 * (o al onboarding si todavía no tiene perfil).
 */
export function InstagramCallback() {
  const router = useRouter();
  const [error, setError] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const frag = new URLSearchParams(window.location.hash.slice(1));
    const tokenHash = frag.get("token_hash");
    const next = safeNext(frag.get("next"));
    window.history.replaceState(null, "", window.location.pathname); // no dejar el token en el historial
    const sb = getSupabase();
    if (!sb || !tokenHash) {
      setError(true);
      return;
    }
    sb.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" }).then(({ error: err }) => {
      if (err) setError(true);
      else router.replace(`/login?as=attendee${next ? `&next=${encodeURIComponent(next)}` : ""}`);
    });
  }, [router]);

  return (
    <main className="safe-top flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
      <span className="grid size-16 place-items-center rounded-2xl bg-rouge/12 text-rouge shadow-glow-rouge">
        <InstagramIcon className="size-8" />
      </span>
      {error ? (
        <>
          <h1 className="text-2xl">No pudimos abrir tu sesión</h1>
          <p className="text-sm text-muted">El link venció o ya se usó. Probá entrar de nuevo con Instagram.</p>
          <a href="/login" className={buttonVariants({ size: "lg" })}>
            Volver a ingresar
          </a>
        </>
      ) : (
        <>
          <h1 className="text-2xl">Entrando con Instagram…</h1>
          <Loader2 className="size-6 animate-spin text-rouge" aria-label="Cargando" />
        </>
      )}
    </main>
  );
}
