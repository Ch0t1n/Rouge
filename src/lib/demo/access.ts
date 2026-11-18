/**
 * Visibilidad del Modo Demo. El sitio principal nunca muestra la demo (personas, cambio de persona,
 * links de prueba, badges): se habilita recién al entrar por /demo (o /demo/abrir, /demo/presentador)
 * y queda recordado en este navegador. Solo afecta lo que se VE: los datos siguen siendo los del demo.
 */
export const DEMO_ACCESS_KEY = "rouge:demo-access";

export const isDemoPath = (pathname: string) => pathname === "/demo" || pathname.startsWith("/demo/");

export function hasDemoAccess(): boolean {
  try {
    return localStorage.getItem(DEMO_ACCESS_KEY) === "1";
  } catch {
    return false;
  }
}

export function grantDemoAccess(): void {
  try {
    localStorage.setItem(DEMO_ACCESS_KEY, "1");
  } catch {
    /* navegación privada o storage bloqueado: vale solo mientras se navega desde /demo */
  }
}
