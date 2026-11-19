"use client";

import { useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Check, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { cropImage, PHOTO_ASPECT } from "@/lib/media/crop";

/**
 * Encuadre de una foto de perfil al subirla: la persona elige qué parte queda dentro del marco vertical 3:4
 * (arrastrar para mover, pellizcar o usar la barra para acercar). La app nunca recorta por su cuenta.
 */
export function PhotoCropper({
  file,
  position,
  total,
  onDone,
  onCancel,
}: {
  file: File | null;
  /** Número de esta foto en la tanda (1 de 3) y total, para cuando se suben varias juntas. */
  position: number;
  total: number;
  onDone: (cropped: File) => void;
  onCancel: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
    setError(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const confirm = async () => {
    if (!file || !area) return;
    setSaving(true);
    setError(null);
    try {
      onDone(await cropImage(file, area, file.name));
    } catch {
      setError("No pudimos recortar esta foto. Probá con otra.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open={!!file}
      onClose={onCancel}
      title={total > 1 ? `Encuadrá tu foto (${position} de ${total})` : "Encuadrá tu foto"}
      description="Las fotos van en vertical. Arrastrá para elegir qué se ve y acercá con dos dedos o con la barra."
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onCancel} disabled={saving}>
            {total > 1 ? "Saltear" : "Cancelar"}
          </Button>
          <Button className="flex-1" onClick={confirm} disabled={!area || saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Check />} Usar foto
          </Button>
        </div>
      }
    >
      <div className="relative h-[55vh] max-h-[520px] min-h-[300px] overflow-hidden rounded-2xl bg-black" data-testid="photo-cropper">
        {src && (
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            minZoom={1}
            maxZoom={4}
            aspect={PHOTO_ASPECT}
            showGrid
            zoomSpeed={0.4}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setArea(pixels)}
            style={{ cropAreaStyle: { border: "2px solid rgba(248,250,252,.9)", borderRadius: 16 } }}
          />
        )}
      </div>
      <label className="mt-4 flex items-center gap-3 text-muted">
        <ZoomOut className="size-5 shrink-0" aria-hidden />
        <input
          type="range"
          min={1}
          max={4}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label="Acercar o alejar la foto"
          className="h-11 w-full accent-rouge"
        />
        <ZoomIn className="size-5 shrink-0" aria-hidden />
      </label>
      {error && <p className="mt-2 text-sm text-sos">{error}</p>}
    </BottomSheet>
  );
}
