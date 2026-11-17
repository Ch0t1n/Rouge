import { ImageResponse } from "next/og";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";

/** Imagen al compartir el sitio (WhatsApp, Instagram, X…) y en resultados enriquecidos. */
export const alt = `${APP_NAME} — ${APP_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          background: "radial-gradient(circle at 18% 20%, rgba(255,30,86,0.45), transparent 55%), radial-gradient(circle at 85% 85%, rgba(0,240,255,0.25), transparent 50%), #070709",
          color: "#F8FAFC",
        }}
      >
        <div style={{ display: "flex", fontSize: 132, fontWeight: 800, letterSpacing: -4, lineHeight: 1 }}>
          <span style={{ color: "#FF1E56" }}>ROUGE</span>
          <span style={{ marginLeft: 28 }}>PASS</span>
        </div>
        <div style={{ marginTop: 36, fontSize: 52, fontWeight: 600 }}>{APP_TAGLINE}</div>
        <div style={{ marginTop: 20, fontSize: 32, color: "#94A3B8", maxWidth: 900 }}>
          Conectá con gente afín, no pierdas a tu Squad y pedí en la barra sin filas.
        </div>
      </div>
    ),
    size,
  );
}
