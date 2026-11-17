"use client";

import * as C from "@/lib/store/commands";
import { useState } from "react";
import { Send, Zap } from "lucide-react";
import type { Profile } from "@/lib/types";
import { GIFTABLE_CATEGORIES, ICEBREAKER_MAX, sendIcebreaker } from "@/lib/engine/actions";
import { useRouge } from "@/lib/store/RougeContext";
import { cn, formatMoney } from "@/lib/utils";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Avatar } from "@/components/ui/avatar";
import { verticalOf } from "@/lib/engine/verticals";

const OPENERS = ["Te vi en la pista y tenía que decirte algo 🔥", "¿Qué tema le pedirías al DJ ahora?", "Tu energía en la pista es otra cosa ✨", "¿Barra o pista? Te debo un trago 🍸"];
/** Corporativo: la "Presentación" (1 por evento) para pedir una charla o una reunión. */
const PRO_OPENERS = ["¿Tomamos un café en el coffee break?", "Me interesa lo que ofrecés, ¿5 minutos en la ronda de negocios?", "Creo que podemos trabajar juntos, ¿hablamos?", "Te vi en la charla, ¿te puedo hacer una consulta?"];

/** La bala única de la noche: mensaje directo sin match previo (+ trago QR opcional). */
export function IcebreakerComposer({ open, onClose, target, eventId }: { open: boolean; onClose: () => void; target: Profile; eventId: string }) {
  const { state, exec, notify } = useRouge();
  const [text, setText] = useState("");
  const [gift, setGift] = useState(false);
  const [drink, setDrink] = useState<string | null>(null);
  const drinks = state.bar_menu.filter((i) => i.is_available && GIFTABLE_CATEGORIES.includes(i.category));
  const first = target.full_name.split(" ")[0];
  const v = verticalOf(state, eventId);
  const pro = v.kind === "corporate";
  const name = v.copy.icebreaker;

  const send = async () => {
    const r = await exec(C.sendIcebreaker(eventId, state.current_user_id, target.id, { message: text, giftDrinkItemId: gift && drink ? drink : undefined }));
    if (r.ok) {
      onClose();
      setText("");
      notify({
        tone: "rouge",
        title: pro ? "⚡ Presentación enviada" : "⚡ Rompehielos enviado",
        description: r.data.attached_drink_qr_id ? `Aparece fijado arriba en la bandeja de ${first}, con tu trago de regalo.` : `Aparece fijado arriba en la bandeja de ${first}.`,
      });
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Zap className="size-5 fill-rouge text-rouge" /> {name} para {first}
        </span>
      }
      description={pro ? "Tenés 1 sola por evento. Le llega directo y queda fijada arriba de su bandeja, sin necesidad de ser contactos." : "Tenés 1 sola bala esta noche. Le llega directo, sin necesidad de match."}
      footer={
        <Button block size="lg" onClick={send} disabled={!text.trim() || (gift && !drink)}>
          <Send /> {pro ? "Enviar presentación" : "Disparar Rompehielos"} {gift && drink ? `· ${formatMoney(drinks.find((d) => d.id === drink)!.price)}` : ""}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <Avatar profile={target} size={40} ring="rouge" />
          <div className="relative flex-1">
            <textarea
              autoFocus
              value={text}
              maxLength={ICEBREAKER_MAX}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Decile algo a ${first}…`}
              aria-label="Mensaje rompehielos"
              className="min-h-[96px] w-full resize-none rounded-2xl rounded-tl-md border border-rouge/40 bg-rouge/[0.07] px-4 py-3 text-[15px] placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-rouge/40"
            />
            <span className={cn("absolute bottom-2 right-3 text-[11px] tabular-nums", text.length >= ICEBREAKER_MAX ? "text-rouge" : "text-muted")}>
              {text.length}/{ICEBREAKER_MAX}
            </span>
          </div>
        </div>
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
          {(pro ? PRO_OPENERS : OPENERS).map((o) => (
            <button key={o} type="button" onClick={() => setText(o)} className="glass-pill shrink-0 whitespace-nowrap py-2 text-xs">
              {o}
            </button>
          ))}
        </div>

        {v.features.icebreakerGift && (
        <div className="rounded-2xl border border-vip/30 bg-vip/[0.06] p-3">
          <Switch tone="vip" checked={gift} onCheckedChange={setGift} label="🍸 Adjuntar Trago Rompehielos" description="Le llega un QR para retirar en la barra. Se paga ahora." id="gift-drink" />
          {gift && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {drinks.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={drink === d.id}
                  onClick={() => setDrink(d.id)}
                  className={cn(
                    "flex min-h-touch items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs transition",
                    drink === d.id ? "border-vip bg-vip/15 text-primary shadow-glow-vip" : "border-white/10 bg-white/[0.03] text-primary/85",
                  )}
                >
                  <span className="text-lg">{d.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{d.name}</span>
                    <span className="metric text-vip">{formatMoney(d.price)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        )}
      </div>
    </BottomSheet>
  );
}
