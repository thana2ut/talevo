import { SchedulePage } from "@/features/schedule/schedule-pages";
import { Suspense } from "react";

export default function Page() { return <Suspense fallback={null}><SchedulePage /></Suspense>; }
