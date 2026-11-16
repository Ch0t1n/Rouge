import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/** Imagen para compartir (WhatsApp, Instagram, X, buscadores): 1200×630, se genera en el build. */
export const alt = "ROUGE — La app de tu fiesta: conocé gente, no pierdas a tu grupo y pedí sin filas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  // Space Grotesk Bold (OFL), la tipografía display de la marca. Satori no lee woff2: va el .ttf local.
  const display = await readFile(join(process.cwd(), "src/app/_og/SpaceGrotesk-Bold.ttf"));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#070709", color: "#F8FAFC", fontFamily: "Space Grotesk" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 30, letterSpacing: 6, color: "#94A3B8" }}>
          <div style={{ width: 18, height: 18, borderRadius: 9, background: "#FF1E56", boxShadow: "0 0 30px #FF1E56" }} />
          APP PARA FIESTAS Y BOLICHES · +18
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 112, fontWeight: 700, lineHeight: 0.9, letterSpacing: -5 }}>
          <span>NO VAYAS A CIEGAS.</span>
          <span style={{ color: "#FF1E56" }}>DOMINÁ LA NOCHE.</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 30 }}>
          <div style={{ display: "flex", gap: 14, color: "#94A3B8" }}>
            <span>Conocé gente ·</span>
            <span style={{ color: "#00F0FF" }}>tu grupo en el plano ·</span>
            <span style={{ color: "#FFB800" }}>tragos sin fila</span>
          </div>
          <span style={{ fontSize: 56, fontWeight: 700, letterSpacing: -2, color: "#FF1E56" }}>ROUGE</span>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Space Grotesk", data: display, weight: 700, style: "normal" }] },
  );
}
