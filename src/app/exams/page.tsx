import { ExamDashboard } from "@/features/academic/exam-dashboard";
import { Suspense } from "react";
export default function Page() { return <Suspense fallback={null}><ExamDashboard /></Suspense>; }
