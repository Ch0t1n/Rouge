import type { ReactNode } from "react";
import { AdminChrome } from "@/components/admin/AdminChrome";

export const metadata = { title: "Panel del Organizador" };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminChrome>{children}</AdminChrome>;
}
