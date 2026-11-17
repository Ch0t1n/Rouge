"use client";

import * as C from "@/lib/store/commands";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ShieldCheck, UserPlus } from "lucide-react";
import { findInvite, inviteError, inviteStatus } from "@/lib/engine/security";
import { ROLE_META, roleHome } from "@/lib/engine/roles";
import { getProfile } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { useRequireProfile } from "@/lib/store/hooks";
import { TerminalPinPanel } from "@/components/admin/OrgStaffPanel";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Invitación de staff (link o QR de un solo uso, 2 h). Pide sesión y perfil; al aceptar, queda en el staff de la
 * organización con el rol, alcance y ventana horaria que eligió el dueño/a. Después puede fijar su PIN de terminal.
 */
export default function StaffInvitePage() {
  const me = useRequireProfile();
  if (!me) return null;
  return <Accept />;
}

function Accept() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { state, exec, mode } = useRouge();
  const [joined, setJoined] = useState<{ org: string; role: keyof typeof ROLE_META } | null>(null);
  // En Supabase el cliente nunca ve las invitaciones (solo su hash en el servidor): la validación la hace la RPC.
  const inv = mode === "demo" ? findInvite(state, token) : undefined;
  const status = mode === "demo" ? inviteStatus(inv) : "valid";
  const owner = inv ? getProfile(state, inv.organization_id) : undefined;

  const accept = async () => {
    const r = mode === "demo" ? await exec(C.acceptStaffInvite(token)) : await exec(C.acceptStaffInviteRemoteOnly(token));
    if (!r.ok) return;
    const data = r.data as { organization_id?: string; role?: keyof typeof ROLE_META };
    setJoined({ org: data.organization_id ?? inv?.organization_id ?? "", role: data.role ?? inv?.role ?? "attendee" });
  };

  if (joined) {
    return (
      <main className="safe-top mx-auto max-w-md space-y-5 px-5 py-10">
        <div className="text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-squad/15 text-squad shadow-glow-squad">
            <ShieldCheck className="size-8" />
          </span>
          <h1 className="mt-4 text-2xl">¡Ya sos parte del staff!</h1>
          <p className="mt-1 text-sm text-muted">Entraste como {ROLE_META[joined.role].emoji} {ROLE_META[joined.role].label}. Si tu rol es de puerta o barra, tus permisos se activan solos 2 h antes de cada evento.</p>
        </div>
        {joined.org && <TerminalPinPanel orgId={joined.org} />}
        <Button block size="lg" variant="vip" onClick={() => router.push(roleHome(joined.role))}>
          Ir a mi pantalla
        </Button>
      </main>
    );
  }

  return (
    <main className="safe-top mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="grid size-16 place-items-center rounded-2xl bg-vip/15 text-vip">
        <UserPlus className="size-8" />
      </span>
      {status === "valid" ? (
        <>
          <h1 className="text-2xl">Invitación al staff</h1>
          <p className="text-sm text-muted">
            {inv ? (
              <>
                {owner?.full_name ?? "Un organizador"} te invita como <b className="text-primary">{ROLE_META[inv.role].emoji} {ROLE_META[inv.role].label}</b>
                {inv.scope === "all_org_events" ? " en todos sus eventos." : ` en ${inv.event_ids.length} evento(s).`}
              </>
            ) : (
              "Al aceptar quedás en el staff de esta organización con el rol que te asignaron."
            )}
          </p>
          <p className="text-xs text-muted">El link sirve una sola vez y vence a las 2 horas de creado.</p>
          <Button block size="lg" variant="vip" onClick={accept}>
            Aceptar y sumarme
          </Button>
        </>
      ) : (
        <>
          <h1 className="text-2xl">No se puede usar este link</h1>
          <p className="text-sm text-muted">{inviteError(status)}</p>
          <Link href="/app" className={buttonVariants({ variant: "glass" })}>
            Volver
          </Link>
        </>
      )}
    </main>
  );
}
