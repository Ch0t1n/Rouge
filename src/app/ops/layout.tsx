import type { Metadata } from "next";
import type { ReactNode } from "react";
import { OpsChrome } from "@/components/ops/OpsChrome";

export const metadata: Metadata = { title: "ROUGE Ops", robots: { index: false, follow: false } };

export default function OpsLayout({ children }: { children: ReactNode }) {
  return <OpsChrome>{children}</OpsChrome>;
}
