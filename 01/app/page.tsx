import Counter from "./counter";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-semibold">Hello world!</h1>
      <Counter />
    </main>
  );
}
