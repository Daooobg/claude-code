import { requireUser } from "@/lib/auth";

export default async function NotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  return <main className="p-8">Note {id} – editor coming soon</main>;
}
