export default async function PublicNotePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <main className="p-8">Public note {slug} – coming soon</main>;
}
