import { describe, expect, it } from "vitest";
import { cropOutputSize, isPortraitPhoto, PHOTO_ASPECT } from "./crop";

describe("recorte de fotos de perfil (3:4 vertical)", () => {
  it("la salida es siempre 3:4 exacto", () => {
    for (const h of [801, 1000, 1080, 1337, 3024]) {
      const { width, height } = cropOutputSize({ height: h });
      expect(width / height).toBe(PHOTO_ASPECT);
      expect(Number.isInteger(width)).toBe(true);
    }
  });

  it("no agranda una foto chica y limita una grande", () => {
    expect(cropOutputSize({ height: 640 })).toEqual({ width: 480, height: 640 });
    expect(cropOutputSize({ height: 4032 })).toEqual({ width: 1080, height: 1440 });
  });

  it("reconoce fotos verticales 3:4 (con el redondeo de la compresión)", () => {
    expect(isPortraitPhoto(810, 1080)).toBe(true);
    expect(isPortraitPhoto(811, 1080)).toBe(true);
    expect(isPortraitPhoto(1080, 1080)).toBe(false);
    expect(isPortraitPhoto(1600, 900)).toBe(false);
    expect(isPortraitPhoto(0, 0)).toBe(false);
  });
});
