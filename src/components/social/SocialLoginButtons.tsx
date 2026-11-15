"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as C from "@/lib/store/commands";
import { useRouge } from "@/lib/store/RougeContext";
import { signInWithGoogle, SOCIAL, startInstagram } from "@/lib/social/client";
import { GoogleIcon, InstagramIcon } from "@/components/ui/brand-icons";
import { Button } from "@/components/ui/button";

/**
 * "Continuar con Instagram / Google". Supabase: OAuth real (vuelve a /login y de ahí a su pantalla).
 * Modo Demo: simula una cuenta nueva y abre el onboarding (con Instagram conectado para importar fotos).
 */
export function SocialLoginButtons({ next, as = "attendee", instagram = true }: { next: string | null; as?: "attendee" | "staff"; instagram?: boolean }) {
  const { mode, startNewPersona, exec, notify } = useRouge();
  const router = useRouter();
  const [busy, setBusy] = useState<"google" | "instagram" | null>(null);
  const showIg = instagram && SOCIAL.instagram;
  if (!SOCIAL.google && !showIg) return null;
  const onboarding = `/onboarding${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  const google = async () => {
    if (mode === "demo") {
      startNewPersona();
      notify({ tone: "info", title: "Modo Demo: ingreso con Google simulado", description: "Con Supabase se abre la cuenta de Google real." });
      router.push(onboarding);
      return;
    }
    setBusy("google");
    const err = await signInWithGoogle({ next, as });
    if (err) {
      setBusy(null);
      notify({ tone: "error", title: err });
    }
  };

  const ig = async () => {
    if (mode === "demo") {
      const id = startNewPersona();
      await exec(C.linkInstagramDemo(id, `noche.${Math.floor(100 + Math.random() * 900)}`), { silent: true });
      notify({ tone: "rouge", title: "Modo Demo: Instagram conectado", description: "Podés importar fotos de tu feed en el paso de fotos." });
      router.push(onboarding);
      return;
    }
    setBusy("instagram");
    const err = await startInstagram("login", next);
    if (err) {
      setBusy(null);
      notify({ tone: "error", title: err });
    }
  };

  return (
    <div className="space-y-2">
      {showIg && (
        <Button block variant="glass" onClick={ig} disabled={!!busy} className="relative">
          <InstagramIcon className="text-rouge" /> {busy === "instagram" ? "Abriendo Instagram…" : "Continuar con Instagram"}
        </Button>
      )}
      {SOCIAL.google && (
        <Button block variant="glass" onClick={google} disabled={!!busy}>
          <GoogleIcon /> {busy === "google" ? "Abriendo Google…" : "Continuar con Google"}
        </Button>
      )}
    </div>
  );
}

export function OrDivider({ label = "o" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted" role="separator">
      <span className="h-px flex-1 bg-white/10" /> {label} <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}
