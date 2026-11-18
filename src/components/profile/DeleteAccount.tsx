"use client";

import * as C from "@/lib/store/commands";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { getProfile } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";

/** Borrado REAL de la cuenta (no una desactivación): datos, fotos, chats, pines y la cuenta de acceso. */
export function DeleteAccount() {
  const { state, exec, signOut, notify, mode } = useRouge();
  const router = useRouter();
  const me = getProfile(state, state.current_user_id);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  if (!me) return null;
  const run = async () => {
    const r = await exec(C.deleteAccount(confirm));
    if (!r.ok) return;
    setOpen(false);
    notify({ tone: "info", title: "Tu cuenta fue borrada", description: "Borramos tus datos personales. Gracias por haber sido parte." });
    if (mode === "supabase") await signOut();
    router.replace("/");
  };
  return (
    <section className="rounded-3xl border border-rouge/30 bg-rouge/[0.04] p-4">
      <h2 className="text-base">Borrar mi cuenta</h2>
      <p className="mt-1 text-sm text-muted">Borra para siempre tu perfil, fotos, matches, chats, pines, Squads y cuentas conectadas. Los pedidos ya pagados quedan anónimos para la contabilidad del local.</p>
      <Button variant="danger" className="mt-3" onClick={() => setOpen(true)}>
        <Trash2 /> Borrar mi cuenta
      </Button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="¿Borrar tu cuenta para siempre?"
        description="No se puede deshacer."
        footer={
          <Button block size="lg" variant="danger" disabled={confirm.trim().replace(/^@/, "").toLowerCase() !== me.username} onClick={run}>
            <Trash2 /> Borrar definitivamente
          </Button>
        }
      >
        <label className="block">
          <span className="mb-1.5 block text-sm">
            Escribí <b>@{me.username}</b> para confirmar
          </span>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoCapitalize="none" autoCorrect="off" className="min-h-touch w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3" placeholder={`@${me.username}`} />
        </label>
      </BottomSheet>
    </section>
  );
}
