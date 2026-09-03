import { notFound } from "next/navigation";

export default async function QaLocalCloudMigrationPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const { QaLocalCloudMigrationPanel } = await import("@/components/qa-local-cloud-migration-panel");
  return <QaLocalCloudMigrationPanel />;
}
