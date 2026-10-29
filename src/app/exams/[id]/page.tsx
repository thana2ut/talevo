import { ExamDetailPage } from "@/features/academic/academic-pages";
import { Suspense } from "react";
export default function Page() { return <Suspense fallback={null}><ExamDetailPage /></Suspense>; }
