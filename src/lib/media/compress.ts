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
    // El worker importa la librería: desde nuestro dominio (la CSP bloquea el CDN por defecto, jsdelivr).
    libURL: new URL("/vendor/browser-image-compression.js", window.location.origin).href,
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

/** Color promedio de una imagen (placeholder mientras carga con señal saturada). */
export async function averageColor(blob: Blob): Promise<string> {
  try {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = c.height = 8;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0, 8, 8);
    bmp.close();
    const d = ctx.getImageData(0, 0, 8, 8).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
    }
    const n = d.length / 4;
    // Oscurecido para que el placeholder no "encandile" en la pista
    const hex = (v: number) => Math.round((v / n) * 0.45).toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  } catch {
    return "#121216";
  }
}

export async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  try {
    const bmp = await createImageBitmap(blob);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    return size;
  } catch {
    return { width: 0, height: 0 };
  }
}

export interface LoopVideoResult {
  file: Blob;
  duration: number;
  /** false si el navegador no permite re-codificar y se usó el archivo original */
  transcoded: boolean;
  posterDataUrl: string | null;
}

export const MAX_LOOP_VIDEO_INPUT_MB = 40;

/**
 * Procesa el "loop" del perfil (máx 5 s):
 *  1. valida duración,
 *  2. lo re-codifica dibujándolo en un <canvas> a ≤540 px y lo graba con
 *     MediaRecorder → elimina el AUDIO de verdad y baja el peso (~400 KB),
 *  3. genera un póster del primer frame.
 * Si MediaRecorder no está disponible, devuelve el original (se reproduce muted).
 */
export async function processLoopVideo(file: File, onProgress?: (p: number) => void): Promise<LoopVideoResult> {
  if (!file.type.startsWith("video/")) throw new Error("El archivo no es un video.");
  if (file.size > MAX_LOOP_VIDEO_INPUT_MB * 1024 * 1024) throw new Error(`El video es muy pesado (máx ${MAX_LOOP_VIDEO_INPUT_MB} MB).`);

  const srcUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = srcUrl;

  try {
    await new Promise<void>((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error("No se pudo leer el video."));
    });
    // Algunos navegadores reportan Infinity en webm grabados: forzar cálculo
    if (!Number.isFinite(video.duration)) {
      video.currentTime = 1e6;
      await new Promise((r) => (video.onseeked = r));
      video.currentTime = 0;
      await new Promise((r) => (video.onseeked = r));
    }
    const duration = video.duration;
    if (duration > MAX_LOOP_VIDEO_SECONDS + 0.3) throw new Error(`El loop puede durar hasta ${MAX_LOOP_VIDEO_SECONDS} segundos (el tuyo dura ${duration.toFixed(1)} s).`);

    const scale = Math.min(1, 540 / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.max(2, Math.round((video.videoWidth * scale) / 2) * 2);
    const h = Math.max(2, Math.round((video.videoHeight * scale) / 2) * 2);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;

    await new Promise<void>((res) => {
      if (video.readyState >= 2) res();
      else video.onloadeddata = () => res();
    });
    ctx.drawImage(video, 0, 0, w, h);
    const posterDataUrl = canvas.toDataURL("image/webp", 0.6);

    const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find(
      (m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m),
    );
    if (!mime || typeof canvas.captureStream !== "function") {
      return { file, duration, transcoded: false, posterDataUrl };
    }

    const stream = canvas.captureStream(30); // sin pista de audio
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 900_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((r) => (recorder.onstop = () => r()));

    let raf = 0;
    const draw = () => {
      ctx.drawImage(video, 0, 0, w, h);
      onProgress?.(Math.min(1, video.currentTime / duration));
      if (!video.ended) raf = requestAnimationFrame(draw);
    };
    recorder.start(250);
    video.currentTime = 0;
    await video.play();
    draw();
    await new Promise<void>((r) => (video.onended = () => r()));
    cancelAnimationFrame(raf);
    recorder.stop();
    await done;
    stream.getTracks().forEach((t) => t.stop());
    onProgress?.(1);

    const out = new Blob(chunks, { type: mime.split(";")[0] });
    // Si por algún motivo salió más pesado, nos quedamos con el original
    return out.size > 0 && out.size < file.size ? { file: out, duration, transcoded: true, posterDataUrl } : { file, duration, transcoded: false, posterDataUrl };
  } finally {
    URL.revokeObjectURL(srcUrl);
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
