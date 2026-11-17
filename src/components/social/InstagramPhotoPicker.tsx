"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { fetchInstagramPhotos, importInstagramPhoto, type IgPhoto } from "@/lib/social/client";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { InstagramIcon } from "@/components/ui/brand-icons";
import { cn } from "@/lib/utils";

/**
 * Elegí fotos de tu feed de Instagram. Devuelve Files (mismo origen) que después pasan por
 * compressImage → uploadMedia como cualquier foto: nunca guardamos links del CDN de Instagram (vencen).
 */
export function InstagramPhotoPicker({ open, onClose, max, username, onPicked }: { open: boolean; onClose: () => void; max: number; username?: string | null; onPicked: (files: File[]) => void }) {
  const [items, setItems] = useState<IgPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected([]);
    setError(null);
    setItems(null);
    fetchInstagramPhotos().then((r) => ("error" in r ? setError(r.error) : setItems(r.items)));
  }, [open]);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < max ? [...s, id] : s));

  const confirm = async () => {
    if (!items) return;
    setImporting(true);
    try {
      const files = await Promise.all(selected.map((id) => importInstagramPhoto(items.find((i) => i.id === id)!)));
      onPicked(files);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos traer esas fotos.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <InstagramIcon className="size-5 text-rouge" /> Fotos de {username ? `@${username}` : "tu Instagram"}
        </span>
      }
      description={max > 0 ? `Elegí hasta ${max}. Las optimizamos para la pista antes de subirlas.` : "Ya tenés las 4 fotos. Borrá alguna para sumar otra."}
      footer={
        <Button block onClick={confirm} disabled={!selected.length || importing}>
          {importing ? <Loader2 className="animate-spin" /> : <InstagramIcon />} {importing ? "Importando…" : selected.length ? `Agregar ${selected.length} foto${selected.length > 1 ? "s" : ""}` : "Elegí fotos"}
        </Button>
      }
    >
      {error && <p className="mb-3 rounded-2xl border border-rouge/40 bg-rouge/10 p-3 text-sm text-rouge">{error}</p>}
      {!items && !error && (
        <div className="grid grid-cols-3 gap-1.5" aria-busy="true">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-xl bg-white/[0.06]" />
          ))}
        </div>
      )}
      {items && items.length === 0 && <p className="py-6 text-center text-sm text-muted">No encontramos fotos en tu feed.</p>}
      {items && items.length > 0 && (
        <ul className="grid grid-cols-3 gap-1.5">
          {items.map((p) => {
            const idx = selected.indexOf(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => toggle(p.id)}
                  aria-pressed={idx >= 0}
                  aria-label={`Foto de Instagram ${p.id}${idx >= 0 ? " (elegida)" : ""}`}
                  className={cn("relative block aspect-square w-full overflow-hidden rounded-xl", idx >= 0 && "ring-2 ring-rouge")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full bg-black/40 object-contain" />
                  {idx >= 0 && (
                    <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-rouge font-display text-xs font-bold text-white shadow-glow-rouge">
                      {max > 1 ? idx + 1 : <Check className="size-3.5" />}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </BottomSheet>
  );
}
