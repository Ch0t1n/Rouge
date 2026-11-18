/**
 * Rutas internas seguras para redirigir (`?next=`, vuelta del OAuth). Evita open redirects.
 *
 * No alcanza con "empieza con / y no con //": los navegadores tratan `\` como `/`, así que
 * `/\evil.com` termina en `https://evil.com`. Por eso además se rechazan barras invertidas y
 * caracteres de control, y se verifica que la URL resuelta siga en nuestro origen.
 */
const PROBE_ORIGIN = "https://rouge.invalid";

export function isSafeInternalPath(n: string | null | undefined): n is string {
  return !!n && checkPath(n);
}

function checkPath(n: string): boolean {
  if (n.length > 512 || !n.startsWith("/") || n.startsWith("//")) return false;
  if (/[\\\u0000-\u001f\u007f]/.test(n)) return false;
  try {
    return new URL(n, PROBE_ORIGIN).origin === PROBE_ORIGIN;
  } catch {
    return false;
  }
}

export const safeInternalPath = (n: string | null | undefined): string | null => (isSafeInternalPath(n) ? n : null);

/**
 * Links de un Text Blast / Flash Promo: ruta interna segura o https absoluto (nunca `javascript:`,
 * `data:` ni http plano). Espejo del check de `send_blast` en schema.sql.
 */
export function isSafeCtaLink(n: string | null | undefined): n is string {
  if (!n) return false;
  if (checkPath(n)) return true;
  if (n.length > 512 || /[\s\\]/.test(n)) return false;
  try {
    return new URL(n).protocol === "https:";
  } catch {
    return false;
  }
}
