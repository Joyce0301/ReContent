export function RecontentHeader() {
  return (
    <header className="flex flex-col gap-3 border-b border-slate-900/80 pb-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
        Content Tool
      </p>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
        ReContent
      </h1>
      <p className="max-w-2xl text-sm leading-7 text-slate-400">
        把长内容整理成适合不同平台发布的版本，在一块更安静、也更适合阅读的桌面上完成改写与收束。
      </p>
    </header>
  );
}
