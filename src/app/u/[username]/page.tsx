"use client";

import * as C from "@/lib/store/commands";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Ban, EyeOff, MoreHorizontal, UserX } from "lucide-react";
import { computeAffinity } from "@/lib/engine/affinity";
import { blockUser } from "@/lib/engine/actions";
import { getAttendee, isBlockedBetween } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { useRequireProfile } from "@/lib/store/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProfileView } from "@/components/profile/ProfileView";
import { ConnectActions } from "@/components/lobby/ConnectActions";
import { InviteToSquadButton } from "@/components/squad/InviteToSquadButton";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";

export default function UserProfilePage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const { state, exec, notify } = useRouge();
  const me = useRequireProfile();
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const handle = decodeURIComponent(username ?? "").replace(/^@/, "").toLowerCase();
  const isSelf = !!me && handle === me.username;
  useEffect(() => {
    if (isSelf) router.replace("/profile");
  }, [isSelf, router]);
  if (!me || isSelf) return null;

  const other = state.profiles.find((p) => p.username === handle);

  // Bloqueo o inexistente → mismo estado genérico (no se revela el bloqueo)
  if (!other || isBlockedBetween(state, me.id, other.id)) {
    return (
      <main>
        <PageHeader title="Perfil" />
        <div className="flex flex-col items-center gap-3 px-8 pt-24 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-white/5 text-muted">
            <UserX className="size-7" />
          </span>
          <h2 className="text-xl">Este perfil no está disponible</h2>
          <p className="text-sm text-muted">Puede que el usuario no exista o no esté visible para vos.</p>
        </div>
      </main>
    );
  }

  const eventId = state.active_event_id;
  const theirs = getAttendee(state, eventId, other.id);
  const mine = getAttendee(state, eventId, me.id);
  const affinity = theirs ? computeAffinity(me, mine, other, theirs) : null;

  const doBlock = async () => {
    const r = await exec(C.blockUser(me.id, other.id));
    if (r.ok) {
      setConfirm(false);
      notify({ tone: "info", title: "Usuario bloqueado", description: "Ya no se van a ver en ningún evento. Podés deshacerlo en Privacidad." });
      router.replace("/");
    }
  };

  return (
    <main className="pb-12">
      <PageHeader
        title={other.full_name.split(" ")[0]}
        subtitle={`@${other.username}`}
        action={
          <button type="button" onClick={() => setMenu(true)} aria-label="Más opciones" className="grid size-11 place-items-center rounded-full hover:bg-white/5">
            <MoreHorizontal className="size-5" />
          </button>
        }
      />
      <div className="px-4">
        <ProfileView profile={other} mood={theirs && !theirs.ghost_mode ? theirs.mood_tag : null} affinity={affinity} actions={
            <div className="space-y-2">
              <ConnectActions target={other} />
              <InviteToSquadButton target={other} />
            </div>
          } />
      </div>

      <BottomSheet open={menu} onClose={() => setMenu(false)} title={`@${other.username}`}>
        <Button
          variant="danger"
          block
          onClick={() => {
            setMenu(false);
            setConfirm(true);
          }}
        >
          <Ban /> Bloquear
        </Button>
      </BottomSheet>

      <BottomSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`¿Bloquear a ${other.full_name.split(" ")[0]}?`}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="glass" onClick={() => setConfirm(false)}>
              Cancelar
            </Button>
            <Button variant="rouge" onClick={doBlock}>
              Bloquear
            </Button>
          </div>
        }
      >
        <ul className="space-y-3 text-sm text-primary/90">
          <li className="flex gap-3">
            <EyeOff className="size-5 shrink-0 text-rouge" /> Ninguno de los dos va a ver al otro en grilla, búsquedas, squads ni plano.
          </li>
          <li className="flex gap-3">
            <UserX className="size-5 shrink-0 text-rouge" /> Se cancelan las solicitudes pendientes y se ocultan sus pines y su chat.
          </li>
          <li className="flex gap-3">
            <Ban className="size-5 shrink-0 text-rouge" /> No le avisamos. Podés deshacerlo en Privacidad.
          </li>
        </ul>
      </BottomSheet>
    </main>
  );
}
