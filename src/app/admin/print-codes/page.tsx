import { Suspense } from "react";
import { PrintCodes } from "@/components/admin/PrintCodes";

export default function PrintCodesPage() {
  return (
    <Suspense>
      <PrintCodes />
    </Suspense>
  );
}
