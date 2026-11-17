/**
 * Recorte de fotos de perfil: SIEMPRE verticales 3:4. La app nunca recorta sola: la persona elige el encuadre al
 * subir (`PhotoCropper`) y acá se aplica ese recorte en un canvas. Después la foto pasa por `compressImage`.
 */

/** Proporción de las fotos de perfil (ancho / alto): vertical 3:4, la forma de la tarjeta. */
export const PHOTO_ASPECT = 3 / 4;

/** Área elegida, en píxeles de la foto original (ya orientada según EXIF). */
export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Alto máximo del recorte antes de comprimir (la compresión lo baja a 1080). */
export const CROP_MAX_HEIGHT = 1440;

/**
 * Tamaño de salida del recorte: 3:4 exacto (alto múltiplo de 4), nunca agranda la foto original y respeta el máximo.
 */
export function cropOutputSize(area: Pick<CropArea, "height">, maxHeight = CROP_MAX_HEIGHT): { width: number; height: number } {
  const h = Math.max(4, Math.min(Math.round(area.height), maxHeight));
  const height = h - (h % 4);
  return { width: (height / 4) * 3, height };
}

/** true si la foto ya es vertical 3:4 (con tolerancia por redondeos de la compresión). */
export function isPortraitPhoto(width: number, height: number, tolerance = 0.02): boolean {
  return width > 0 && height > 0 && Math.abs(width / height - PHOTO_ASPECT) <= tolerance;
}

/** Aplica el recorte elegido y devuelve un JPEG de alta calidad (se comprime a WebP después). Solo navegador. */
export async function cropImage(file: Blob, area: CropArea, name = "foto"): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { width, height } = cropOutputSize(area);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo recortar la foto.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, area.x, area.y, area.width, area.height, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) throw new Error("No se pudo recortar la foto.");
    return new File([blob], `${name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}
