/**
 * Fotos reales del demo (WebP 600×800 en public/demo/avatars, `blur_color` = color medio de cada foto).
 * El resto de las personas sigue con los retratos vectoriales `-1.svg` / `-2.svg`.
 */
export const DEMO_PHOTOS: Record<string, { url: string; blur_color: string }[]> = {
  "sofi.noche": [{ url: "/demo/avatars/sofi.noche-1.webp", blur_color: "#272325" }],
  "cami.beats": [{ url: "/demo/avatars/cami.beats-1.webp", blur_color: "#505353" }],
  "juli.rkt": [{ url: "/demo/avatars/juli.rkt-1.webp", blur_color: "#53382E" }],
  "mateo.techno": [{ url: "/demo/avatars/mateo.techno-1.webp", blur_color: "#3E3E40" }],
  "vale.pop": [{ url: "/demo/avatars/vale.pop-1.webp", blur_color: "#4B322C" }],
};

/** Foto principal de una persona del demo (la usa también la maqueta de la landing). */
export const demoAvatar = (username: string) => DEMO_PHOTOS[username]?.[0]?.url ?? `/demo/avatars/${username}-1.svg`;
