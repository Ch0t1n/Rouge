import { Suspense } from "react";
import { PrintTicket } from "@/components/admin/PrintTicket";

export default function PrintTicketPage() {
  return (
    <Suspense>
      <PrintTicket />
    </Suspense>
  );
}
