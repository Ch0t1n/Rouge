"use client";

import * as C from "@/lib/store/commands";
import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import type { ProfilePersona } from "@/lib/types";
import { useRouge } from "@/lib/store/RougeContext";
import { cn } from "@/lib/utils";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { CorporateProfileFields, draftFrom, draftToInput, draftValid, type CorporateDraft } from "./CorporateProfileFields";
import { proFontVars } from "./fonts";

/**
 * Panel rápido para crear o editar la ficha ejecutiva sin salir de donde estás (p. ej. la primera vez que entrás a un
 * evento corporativo). Guarda un perfil profesional (`profile_personas`, kind corporate) con `C.upsertPersona`.
 */
export function CorporateProfileSheet({
  open,
  onClose,
  persona,
  onSaved,
  title,
}: {
  open: boolean;
  onClose: () => void;
  /** Si viene, la edita; si no, crea una ficha nueva. */
  persona?: ProfilePersona | null;
  onSaved?: (p: ProfilePersona) => void;
  title?: string;
}) {
  const { state, exec, notify } = useRouge();
  const me = state.profiles.find((p) => p.id === state.current_user_id);
  const [draft, setDraft] = useState<CorporateDraft>(() => draftFrom(persona, me?.full_name ?? ""));
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const valid = draftValid(draft);

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const r = await exec(C.upsertPersona(me.id, draftToInput(draft, persona?.id)));
    setBusy(false);
    if (!r.ok) return;
    notify({ tone: "squad", title: persona ? "Ficha actualizada ✓" : "Ficha ejecutiva creada ✓", description: persona ? undefined : "Es la que ven en los eventos corporativos. Nunca se mezcla con tu perfil de la noche." });
    onSaved?.(r.data);
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      className={cn(proFontVars, "border-pro-line bg-pro-slate font-pro text-white")}
      title={<span className="font-pro font-bold tracking-[-0.02em]">{title ?? (persona ? "Editar mi ficha ejecutiva" : "Tu ficha ejecutiva")}</span>}
      description={<span className="text-pro-mist">Cargo, empresa y qué buscás u ofrecés. Te toma 1 minuto.</span>}
      footer={
        <button
          type="button"
          onClick={save}
          disabled={!valid || busy}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-pro-cobalt font-pro font-semibold text-white shadow-[0_10px_40px_rgba(29,78,216,0.35)] transition hover:bg-pro-sapphire disabled:opacity-50"
          data-testid="save-corporate-profile"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {persona ? "Guardar cambios" : "Crear mi ficha"}
        </button>
      }
    >
      <div className="pt-2">
        <CorporateProfileFields value={draft} onChange={setDraft} compact={!persona} />
      </div>
    </BottomSheet>
  );
}
