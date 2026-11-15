import { Suspense } from "react";
import { DemoOpen } from "@/components/demo/DemoOpen";

export default function DemoOpenPage() {
  return (
    <Suspense>
      <DemoOpen />
    </Suspense>
  );
}
