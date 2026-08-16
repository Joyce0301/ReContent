type AuthServiceUnavailableProps = {
  title?: string;
};

export function AuthServiceUnavailable({
  title = "登录服务暂时不可用"
}: AuthServiceUnavailableProps) {
  return (
    <main className="poster-shell flex min-h-screen items-center justify-center px-5 py-8 text-center sm:px-8 lg:px-12">
      <div className="poster-frame max-w-xl rounded-[34px] px-8 py-10">
        <p className="poster-kicker text-[var(--accent-deep)]">Auth Service</p>
        <h1 className="poster-display mt-4 text-[3rem] text-[var(--ink)] sm:text-[4rem]">
          Hold please.
        </h1>
        <h2 className="mt-3 text-xl font-semibold text-[var(--ink)]">{title}</h2>
        <p className="mt-4 text-sm leading-7 text-[var(--ink-soft)]">
          认证服务暂时不可用，请稍后再试。
        </p>
        <div className="poster-marquee mt-6" aria-hidden="true">
          <div className="poster-marquee-track">
            {Array.from({ length: 5 }).map((_, index) => (
              <span key={index}>
                Check ECS secrets • Check MySQL reachability • Retry deployment •
              </span>
            ))}
          </div>
        </div>
        <p className="mt-5 text-xs leading-6 text-[var(--ink-soft)]">
          如果这个问题持续出现，请联系维护者检查服务状态。
        </p>
      </div>
    </main>
  );
}
