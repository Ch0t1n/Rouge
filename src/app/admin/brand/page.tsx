"use client";

import { Suspense } from "react";
import { BrandStudio } from "@/components/admin/BrandStudio";

export default function AdminBrandPage() {
  return (
    <Suspense>
      <BrandStudio />
    </Suspense>
  );
}
