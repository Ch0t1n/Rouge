"use client";

import * as C from "@/lib/store/commands";
import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import type { BarMenuItem } from "@/lib/types";
import { MENU_CATEGORIES, MENU_NAME_MAX, type MenuItemInput } from "@/lib/engine/eventAdmin";
import { activeEvent } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { cn, formatMoney } from "@/lib/utils";
import { AdminHeader, Panel } from "@/components/admin/AdminChrome";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

const EMPTY: MenuItemInput = { name: "", category: "trago", price: 0, emoji: "🍸" };

/**
 * Menú de la Barra Express del evento: precios (siempre los del servidor), "Agotado" en un toque, alta y baja.
 * Los pedidos ya hechos conservan su nombre y precio aunque el ítem cambie o se borre.
 */
export function MenuEditor() {
  const { state, exec, notify } = useRouge();
  const event = activeEvent(state)!;
  const [editing, setEditing] = useState<string | "new" | null>(null);

  const save = async (input: MenuItemInput) => {
    const r = await exec(C.upsertMenuItem(event.id, input));
    if (!r.ok) return false;
    notify({ tone: "squad", title: input.id ? "Ítem actualizado" : "Ítem agregado", description: `${r.data.emoji} ${r.data.name} · ${formatMoney(r.data.price)}`, duration: 2500 });
    setEditing(null);
    return true;
  };

  const soldOut = state.bar_menu.filter((i) => !i.is_available).length;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-5 py-6 lg:px-10 lg:py-10">
      <AdminHeader
        title="Menú de la barra"
        subtitle={`${state.bar_menu.length} ítems${soldOut ? ` · ${soldOut} agotados` : ""} · los precios que ve el público son siempre estos.`}
        actions={
          <Button variant="vip" onClick={() => setEditing("new")}>
            <Plus /> Agregar ítem
          </Button>
        }
      />
      {editing === "new" && (
        <Panel title="Nuevo ítem">
          <ItemForm initial={EMPTY} onCancel={() => setEditing(null)} onSave={save} />
        </Panel>
      )}
      {MENU_CATEGORIES.map((cat) => {
        const items = state.bar_menu.filter((i) => i.category === cat.id);
        if (!items.length) return null;
        return (
          <Panel key={cat.id} title={cat.label}>
            <ul className="divide-y divide-white/5">
              {items.map((i) =>
                editing === i.id ? (
                  <li key={i.id} className="py-3">
                    <ItemForm initial={i} onCancel={() => setEditing(null)} onSave={save} />
                  </li>
                ) : (
                  <li key={i.id} className={cn("flex flex-wrap items-center gap-3 py-3", !i.is_available && "opacity-60")} data-testid="menu-item">
                    <span className="text-2xl" aria-hidden>{i.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{i.name}</p>
                      <p className="metric text-sm text-vip">{formatMoney(i.price)}</p>
                    </div>
                    <Switch
                      tone="vip"
                      checked={i.is_available}
                      onCheckedChange={(v) => void exec(C.upsertMenuItem(event.id, { ...i, is_available: v }))}
                      label={i.is_available ? "Disponible" : "Agotado"}
                      className="w-40"
                    />
                    <Button size="icon" variant="ghost" aria-label={`Editar ${i.name}`} onClick={() => setEditing(i.id)}>
                      <Pencil />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Borrar ${i.name}`}
                      onClick={() => {
                        if (window.confirm(`¿Sacar "${i.name}" del menú?`)) void exec(C.deleteMenuItem(event.id, i.id));
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ),
              )}
            </ul>
          </Panel>
        );
      })}
    </main>
  );
}

function ItemForm({ initial, onSave, onCancel }: { initial: MenuItemInput | BarMenuItem; onSave: (i: MenuItemInput) => Promise<boolean>; onCancel: () => void }) {
  const [name, setName] = useState(initial.name);
  const [emoji, setEmoji] = useState(initial.emoji ?? "🍸");
  const [category, setCategory] = useState<BarMenuItem["category"]>(initial.category);
  const [price, setPrice] = useState(initial.price ? String(initial.price) : "");
  const value = Number(price.replace(/\./g, "").replace(",", "."));
  const input = "min-h-touch rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-primary focus:border-vip/50 focus:outline-none";
  return (
    <form
      className="grid gap-3 sm:grid-cols-[64px_minmax(0,1fr)_160px_140px_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({ id: "id" in initial ? initial.id : undefined, name, emoji, category, price: value, is_available: "is_available" in initial ? initial.is_available : true });
      }}
    >
      <input aria-label="Emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} className={cn(input, "text-center text-xl")} />
      <input aria-label="Nombre" value={name} onChange={(e) => setName(e.target.value)} maxLength={MENU_NAME_MAX} placeholder="Ej: Gin Tonic" className={input} />
      <select aria-label="Categoría" value={category} onChange={(e) => setCategory(e.target.value as BarMenuItem["category"])} className={input}>
        {MENU_CATEGORIES.map((c) => (
          <option key={c.id} value={c.id} className="bg-surface">
            {c.label}
          </option>
        ))}
      </select>
      <input aria-label="Precio" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="Precio" className={input} />
      <div className="flex gap-2">
        <Button type="submit" variant="vip" disabled={name.trim().length < 2 || !(value >= 0) || price === ""}>
          <Check /> Guardar
        </Button>
        <Button type="button" size="icon" variant="ghost" aria-label="Cancelar" onClick={onCancel}>
          <X />
        </Button>
      </div>
    </form>
  );
}
