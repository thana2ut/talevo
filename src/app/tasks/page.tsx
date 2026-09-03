import { Suspense } from "react";
import { TasksPage } from "@/features/tasks/task-pages";

export default function Page() {
  return (
    <Suspense fallback={<div className="page tasks-page" />}>
      <TasksPage />
    </Suspense>
  );
}
