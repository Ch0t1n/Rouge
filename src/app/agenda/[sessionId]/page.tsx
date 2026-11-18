"use client";

import { useParams } from "next/navigation";
import { SessionDetail } from "@/components/pro/SessionDetail";
import { useRequireProfile } from "@/lib/store/hooks";

export default function AgendaSessionPage() {
  const me = useRequireProfile();
  const { sessionId } = useParams<{ sessionId: string }>();
  if (!me) return null;
  return <SessionDetail sessionId={sessionId} />;
}
