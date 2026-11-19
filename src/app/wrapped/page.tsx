"use client";

import { Suspense } from "react";
import { useRequireProfile } from "@/lib/store/hooks";
import { WrappedCard } from "@/components/monetization/WrappedCard";

/** Rouge Wrapped: resumen de la noche en una tarjeta 9:16 para Instagram Stories. */
export default function WrappedPage() {
  const me = useRequireProfile();
  if (!me) return null;
  return (
    <Suspense>
      <WrappedCard />
    </Suspense>
  );
}
