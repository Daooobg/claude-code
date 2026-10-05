import { requireUser } from "@/lib/auth";

export default async function DashboardPage() {
  await requireUser();
  return <main className="p-8">Dashboard - coming soon</main>;
}
