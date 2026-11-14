/**
 * Compresión de imágenes en el cliente ANTES de subir a Supabase Storage.
 * En una discoteca la señal 4G/5G está saturada: una foto de 4 MB tarda
 * 30 s+, una de 180 KB en WebP sale al instante.
 */
export const IMAGE_PRESETS = {
  /** Fotos de perfil (tarjeta 3:4 a sangre) */
  profile: { maxSizeMB: 0.25, maxWidthOrHeight: 1080 },
  /** Fotos enviadas por chat */
  chat: { maxSizeMB: 0.18, maxWidthOrHeight: 1280 },
  /** Plano de la discoteca (admin) — necesita más detalle */
  venueMap: { maxSizeMB: 0.6, maxWidthOrHeight: 2400 },
} as const;

export type ImagePreset = keyof typeof IMAGE_PRESETS;

export async function compressImage(file: File, preset: ImagePreset = "profile"): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("El archivo no es una imagen.");
  // Import dinámico: la librería solo se descarga cuando el usuario sube algo.
  const { default: imageCompression } = await import("browser-image-compression");
  const compressed = await imageCompression(file, {
    ...IMAGE_PRESETS[preset],
    useWebWorker: true,
    fileType: "image/webp",
    initialQuality: 0.82,
  });
  const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
  return new File([compressed], name, { type: "image/webp", lastModified: Date.now() });
}

/** Lee un archivo como data URL (persistencia en Modo Demo sin backend). */
export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const MAX_LOOP_VIDEO_SECONDS = 5;

/** Valida el video loop del perfil (máx 5 s). Devuelve la duración. */
export function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(v.duration);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer el video."));
    };
    v.src = url;
  });
}
