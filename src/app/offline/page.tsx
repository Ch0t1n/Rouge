import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata = { title: "Sin conexión" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-rouge/15 text-rouge shadow-glow-rouge">
        <WifiOff className="size-7" />
      </span>
      <h1 className="text-2xl">Sin señal en la pista</h1>
      <p className="text-sm text-muted">
        Tu Squad, tus matches y tus QRs guardados siguen en el teléfono. Acercate a la entrada o al patio para recuperar señal.
      </p>
      <Link href="/" className="mt-2 inline-flex min-h-touch items-center rounded-2xl bg-rouge px-5 font-display font-semibold text-white shadow-glow-rouge">
        Reintentar
      </Link>
    </main>
  );
}
