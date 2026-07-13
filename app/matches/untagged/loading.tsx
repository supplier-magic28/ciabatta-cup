export default function UntaggedLoading(){return <main className="mx-auto max-w-3xl p-6"><div className="h-28 animate-pulse border-2 border-hairline bg-surface"/><div className="mt-6 grid gap-4">{[1,2,3].map(item=><div key={item} className="h-64 animate-pulse border-2 border-hairline bg-surface"/>)}</div></main>}

