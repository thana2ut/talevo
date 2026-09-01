import { AddClassPage } from "@/features/schedule/schedule-pages";
import { Suspense } from "react";

export default function Page() {
  return <Suspense fallback={null}><AddClassPage /></Suspense>;
}
