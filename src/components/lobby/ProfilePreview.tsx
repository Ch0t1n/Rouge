"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { computeAffinity } from "@/lib/engine/affinity";
import { getAttendee, getProfile, isBlockedBetween } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { ProfileView } from "@/components/profile/ProfileView";
import { ConnectActions } from "@/components/lobby/ConnectActions";
import { InviteToSquadButton } from "@/components/squad/InviteToSquadButton";
import { Drawer } from "@/components/ui/drawer";
import { ReportUserButton } from "@/components/profile/ReportUserButton";

/** Vista previa del perfil en un panel derecho (PC): conectar, Rompehielos y Squad sin salir de la grilla. */
export function ProfilePreview({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const { state } = useRouge();
  const meId = state.current_user_id;
  const me = getProfile(state, meId);
  const other = getProfile(state, userId);
  const visible = !!me && !!other && !isBlockedBetween(state, meId, other.id);
  const eventId = state.active_event_id;
  const theirs = other ? getAttendee(state, eventId, other.id) : undefined;
  const affinity = visible && theirs ? computeAffinity(me!, getAttendee(state, eventId, meId), other!, theirs) : null;
  return (
    <Drawer open={!!userId} onClose={onClose} title={visible ? `${other!.full_name.split(" ")[0]} · @${other!.username}` : "Perfil"}>
      {visible ? (
        <div className="space-y-3">
          <ProfileView
            profile={other!}
            mood={theirs && !theirs.ghost_mode ? theirs.mood_tag : null}
            affinity={affinity}
            actions={
              <div className="space-y-2">
                <ConnectActions target={other!} />
                <InviteToSquadButton target={other!} />
              </div>
            }
          />
          <div className="flex items-center justify-between gap-2 pt-2">
            <Link href={`/u/${other!.username}`} className="inline-flex min-h-touch items-center gap-1.5 text-sm text-muted hover:text-primary">
              <ExternalLink className="size-4" /> Abrir perfil completo
            </Link>
            <ReportUserButton target={other!} onDone={onClose} />
          </div>
        </div>
      ) : (
        <p className="pt-10 text-center text-sm text-muted">Este perfil no está disponible.</p>
      )}
    </Drawer>
  );
}
