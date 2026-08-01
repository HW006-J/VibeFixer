import { RepositoryScanner } from "@/components/repository-scanner";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-black">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-16 sm:px-10">
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span className="text-xs font-semibold uppercase tracking-widest text-red-400">
              Live security demo
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
            Vibe Fixer
          </h1>
          <p className="text-sm font-medium text-zinc-300 sm:text-base">
            Security checks for AI-built applications.
          </p>
          <p className="max-w-xl text-sm leading-relaxed text-zinc-400 sm:text-base">
            Vibe Fixer scans repositories for common database, cloud-permission,
            secret-exposure and API-access mistakes. In an authorised environment, it can also
            prove, repair and retest one confirmed database finding live.
          </p>
        </header>

        <RepositoryScanner />
      </main>
    </div>
  );
}
