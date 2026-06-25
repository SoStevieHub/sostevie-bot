import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-neutral-950 text-neutral-100">
      <h1 className="text-2xl font-semibold">sostevie · Kick Chat Botu</h1>
      <p className="text-neutral-400 text-sm">Yönetim için admin paneline gidin.</p>
      <Link href="/admin" className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-5 py-2 font-medium">
        Admin Paneli
      </Link>
    </main>
  );
}
