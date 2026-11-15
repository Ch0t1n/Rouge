"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Unlink } from "lucide-react";
import * as C from "@/lib/store/commands";
import { useRouge } from "@/lib/store/RougeContext";
import { igErrorMessage, SOCIAL, startInstagram } from "@/lib/social/client";
import { parseInstagram } from "@/lib/engine/profile";
import { InstagramIcon } from "@/components/ui/brand-icons";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";

/**
 * Instagram en el editor de perfil:
 *  - Conectado (OAuth): muestra el @ verificado, permite desconectar.
 *  - Sin conectar: botón "Conectar Instagram" y, como alternativa, escribir el @ a mano (queda "sin verificar").
 * `value`/`onChange` es el @ manual del formulario (solo se guarda si NO hay cuenta conectada).
 */
export function InstagramField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { state, mode, exec, notify } = useRouge();
  const me = state.current_user_id;
  const link = state.instagram_links.find((l) => l.user_id === me);
  const [busy, setBusy] = useState(false);
  const invalid = value.trim() && !parseInstagram(value) ? "Ese @ de Instagram no es válido." : null;

  const connect = async () => {
    if (mode === "demo") {
      const suggestion = parseInstagram(value) ?? state.profiles.find((p) => p.id === me)?.username ?? "noche.demo";
      const r = await exec(C.linkInstagramDemo(me, suggestion));
      if (r.ok) notify({ tone: "rouge", title: `Instagram conectado · @${r.data.username}`, description: "Modo Demo: con Supabase se abre Instagram para autorizar." });
      return;
    }
    setBusy(true);
    const err = await startInstagram("link", "/profile/edit");
    if (err) {
      setBusy(false);
      notify({ tone: "error", title: err });
    }
  };

  const disconnect = async () => {
    setBusy(true);
    const r = await exec(C.unlinkInstagram(me));
    setBusy(false);
    if (r.ok) {
      onChange("");
      notify({ tone: "info", title: "Instagram desconectado", description: "Borramos el acceso y sacamos el @ de tu perfil." });
    }
  };

  if (link)
    return (
      <div className="glass flex items-center gap-3 rounded-2xl p-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-rouge/12">
          <InstagramIcon className="size-5 text-rouge" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate font-display font-semibold">
            @{link.username} <BadgeCheck className="size-4 text-squad" aria-label="Verificado" />
          </p>
          <p className="text-xs text-muted">Conectado · aparece en tu perfil y podés importar fotos</p>
        </div>
        <Button size="sm" variant="ghost" onClick={disconnect} disabled={busy} aria-label="Desconectar Instagram">
          <Unlink /> Quitar
        </Button>
      </div>
    );

  return (
    <div className="space-y-3">
      {SOCIAL.instagram && (
        <Button block variant="glass" onClick={connect} disabled={busy}>
          <InstagramIcon className="text-rouge" /> {busy ? "Abriendo Instagram…" : "Conectar Instagram"}
        </Button>
      )}
      <TextField
        label={SOCIAL.instagram ? "O escribí tu @ (queda sin verificar)" : "Tu @ de Instagram"}
        prefix={<InstagramIcon className="size-4" />}
        className="pl-10"
        placeholder="tu.usuario"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        error={invalid}
        hint="Opcional. Se muestra en tu perfil para que te sigan."
      />
    </div>
  );
}

/** Lee ?instagram=connected / ?ig_error=… al volver del OAuth, avisa y limpia la URL. */
export function useInstagramReturn() {
  const { notify } = useRouge();
  useEffect(() => {
    const url = new URL(window.location.href);
    const err = igErrorMessage(url.searchParams.get("ig_error"));
    const ok = url.searchParams.get("instagram") === "connected";
    if (!err && !ok) return;
    if (err) notify({ tone: "error", title: err });
    else notify({ tone: "rouge", title: "Instagram conectado ✓", description: "Ya podés importar fotos de tu feed." });
    url.searchParams.delete("ig_error");
    url.searchParams.delete("instagram");
    window.history.replaceState(null, "", url.pathname + (url.search ? url.search : "") + url.hash);
  }, [notify]);
}
