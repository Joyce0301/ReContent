export function RecontentHeader() {
  return (
    <header className="flex flex-col gap-2 border-b border-slate-900/80 pb-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
        Content Tool
      </p>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
        ReContent
      </h1>
      <p className="max-w-2xl text-sm leading-6 text-slate-400">
        将长内容整理成适合不同平台发布的版本，在更安静、更专注的工作台中完成改写与整理。
      </p>
    </header>
  );
}
