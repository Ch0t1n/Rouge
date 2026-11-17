"use client";

import { SuperadminConsole } from "@/components/superadmin/SuperadminConsole";

/** Consola global de ROUGE: solo administradores globales (la regla la exige también el servidor). */
export default function SuperadminPage() {
  return <SuperadminConsole />;
}
