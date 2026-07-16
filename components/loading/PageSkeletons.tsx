/** @jsxImportSource react */

import { Skeleton } from "@/components/ui/Skeleton";

function LoadingRegion({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <main role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">Loading page</span>
      {children}
    </main>
  );
}

function HeaderSkeleton() {
  return (
    <div className="mb-7 flex items-start justify-between gap-4 border-b-2 border-ink pb-4">
      <Skeleton className="h-16 w-40" />
      <Skeleton className="mt-2 h-5 w-52 max-w-[48vw]" />
    </div>
  );
}

function ListCards({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="min-h-28 border-2 border-ink bg-surface p-4 shadow-[3px_3px_0_var(--color-ink)]">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-14" />
          </div>
          <Skeleton className="mt-4 h-3 w-1/2" />
          <Skeleton className="mt-2 h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function LeaderboardSkeleton() {
  return (
    <LoadingRegion className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-10 pt-5 sm:px-6">
      <HeaderSkeleton />
      <Skeleton className="mb-7 h-24 w-full border-2 border-ink" />
      <Skeleton className="mb-3 h-4 w-32" />
      <div className="mb-6 flex items-end justify-between gap-4"><Skeleton className="h-10 w-56" /><Skeleton className="h-4 w-40" /></div>
      <ListCards count={4} />
    </LoadingRegion>
  );
}

export function AuthFormSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-5">
      <span className="sr-only">Loading form</span>
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-[70px] w-full" />
      <Skeleton className="h-[70px] w-full" />
      <Skeleton className="h-[58px] w-full border-2 border-ink" />
      <Skeleton className="mx-auto h-4 w-44" />
    </div>
  );
}

export function CompactListSkeleton() {
  return (
    <LoadingRegion className="mx-auto w-full max-w-lg flex-1 px-6 py-10">
      <div className="mb-6 flex items-center justify-between"><Skeleton className="h-8 w-40" /><Skeleton className="h-4 w-20" /></div>
      <ListCards count={4} />
    </LoadingRegion>
  );
}

export function FormPageSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <LoadingRegion className={`mx-auto w-full flex-1 px-6 py-10 ${wide ? "max-w-2xl" : "max-w-md"}`}>
      <div className="mb-7 flex justify-between border-b-2 border-ink pb-4"><Skeleton className="h-10 w-52" /><Skeleton className="h-4 w-20" /></div>
      <section className="border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_var(--color-ink)] sm:p-7">
        <Skeleton className="h-[70px] w-full" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2"><Skeleton className="h-[70px] w-full" /><Skeleton className="h-[70px] w-full" /></div>
        <Skeleton className="mt-4 h-[70px] w-full" />
        <Skeleton className="mt-6 h-14 w-full border-2 border-ink" />
      </section>
    </LoadingRegion>
  );
}

export function ProfileSkeleton() {
  return (
    <LoadingRegion className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <Skeleton className="h-5 w-24" />
      <section className="mt-5 min-h-52 border-2 border-ink bg-ink p-6 shadow-[4px_4px_0_var(--color-green)]">
        <div className="flex gap-5"><Skeleton className="h-20 w-20 rounded-full bg-muted-dark" /><div className="flex-1"><Skeleton className="h-8 w-52 bg-muted-dark" /><Skeleton className="mt-3 h-4 w-32 bg-muted-dark" /><Skeleton className="mt-7 h-10 w-full max-w-sm bg-muted-dark" /></div></div>
      </section>
      <div className="mt-7 grid gap-7 lg:grid-cols-2"><ListCards count={3} /><ListCards count={3} /></div>
    </LoadingRegion>
  );
}

export function ProfileSettingsSkeleton() {
  return (
    <LoadingRegion className="mx-auto w-full max-w-3xl flex-1 px-4 pb-12 pt-5 sm:px-6">
      <HeaderSkeleton />
      <Skeleton className="mb-3 h-4 w-28" />
      <Skeleton className="mb-7 h-10 w-56" />
      <div className="grid gap-7">
        <section className="h-44 border-2 border-ink bg-surface p-5"><Skeleton className="h-28 w-28 rounded-full" /></section>
        <section className="h-64 border-2 border-ink bg-surface p-5"><Skeleton className="h-12 w-full" /><Skeleton className="mt-6 h-5 w-48" /><Skeleton className="mt-4 h-5 w-40" /></section>
        <Skeleton className="h-14 w-full border-2 border-ink" />
      </div>
    </LoadingRegion>
  );
}

export function ProfileTabSkeleton({ cards = 3 }: { cards?: number }) {
  return <section role="status" aria-live="polite" aria-busy="true"><span className="sr-only">Loading profile</span><Skeleton className="mb-5 h-12 w-full border-2 border-ink" /><div className="grid gap-4">{Array.from({ length: cards }, (_, index) => <Skeleton key={index} className="h-32 w-full border-2 border-ink" />)}</div></section>;
}

export function TournamentListSkeleton() {
  return (
    <LoadingRegion className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-12 pt-5 sm:px-6">
      <HeaderSkeleton />
      <div className="mb-6 flex justify-between"><Skeleton className="h-10 w-52" /><Skeleton className="h-10 w-24" /></div>
      <Skeleton className="mb-3 h-7 w-40" />
      <div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: 2 }, (_, index) => <div key={index} className="h-36 border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_var(--color-ink)]"><Skeleton className="h-6 w-2/3" /><Skeleton className="mt-8 h-4 w-3/4" /><Skeleton className="mt-2 h-4 w-1/2" /></div>)}</div>
      <div className="my-10"><div className="mb-4 flex justify-between"><Skeleton className="h-9 w-44"/><Skeleton className="h-4 w-24"/></div><div className="h-[430px] rounded-[12px] border-[3px] border-ink bg-crust p-5 shadow-[5px_5px_0_var(--color-ink)]"><Skeleton className="mx-auto h-7 w-40 bg-crust-top"/><div className="mt-5 h-[340px] border-[3px] border-ink bg-ink p-5"><div className="grid h-1/2 grid-cols-2 items-end gap-5 border-b-[12px] border-crust"><Skeleton className="mx-auto h-28 w-20 bg-muted-dark"/><Skeleton className="mx-auto h-28 w-20 bg-muted-dark"/></div><div className="grid h-1/2 grid-cols-2 items-end gap-5 border-b-[12px] border-crust"><Skeleton className="mx-auto h-24 w-20 bg-muted-dark"/><Skeleton className="mx-auto h-24 w-20 bg-muted-dark"/></div></div></div></div>
    </LoadingRegion>
  );
}

export function TournamentBoardSkeleton({ admin = false }: { admin?: boolean }) {
  return (
    <LoadingRegion className={`mx-auto w-full flex-1 px-4 pb-12 pt-5 sm:px-6 ${admin ? "max-w-6xl" : "max-w-5xl"}`}>
      {!admin && <HeaderSkeleton />}
      <Skeleton className="mb-8 h-52 w-full border-2 border-ink" />
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div><Skeleton className="mb-4 h-9 w-40" /><div className="border-2 border-ink bg-surface p-3"><Skeleton className="h-9 w-full bg-ink" />{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="mt-2 h-14 w-full" />)}</div></div>
        <div><Skeleton className="mb-4 h-9 w-36" />{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className={`mb-4 w-full border-2 border-ink ${admin ? "h-64" : "h-32"}`} />)}</div>
      </div>
    </LoadingRegion>
  );
}

export function TrophyViewerSkeleton(){return <LoadingRegion className="min-h-dvh bg-ink px-4 py-5 text-cream"><div className="mx-auto flex w-full max-w-6xl items-center justify-between"><div><Skeleton className="h-3 w-36 bg-muted-dark"/><Skeleton className="mt-3 h-10 w-52 bg-muted-dark"/></div><Skeleton className="h-11 w-11 rounded-full bg-muted-dark"/></div><div className="mx-auto mt-5 grid w-full max-w-6xl gap-4 md:grid-cols-[minmax(0,1.55fr)_minmax(19rem,.8fr)]"><Skeleton className="min-h-[65dvh] border-2 border-muted bg-muted-dark"/><div className="border-2 border-muted p-5"><Skeleton className="h-8 w-3/4 bg-muted-dark"/><Skeleton className="mt-5 h-24 w-full bg-muted-dark"/><Skeleton className="mt-3 h-24 w-full bg-muted-dark"/></div></div></LoadingRegion>}
