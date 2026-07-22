type AuthServiceUnavailableProps = {
  title?: string;
};

export function AuthServiceUnavailable({
  title = "登录服务暂时不可用"
}: AuthServiceUnavailableProps) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col items-center justify-center px-5 py-8 text-center sm:px-8 lg:px-12">
      <div className="max-w-md space-y-4 rounded-[32px] border border-slate-200/80 bg-white/88 px-8 py-10 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-600">
          Auth Service
        </p>
        <h1 className="text-2xl font-semibold text-slate-950">{title}</h1>
        <p className="text-sm leading-7 text-slate-500">
          认证数据库或会话配置暂时不可用，请稍后重试，或先检查 ECS 环境变量与 MySQL 连通性。
        </p>
      </div>
    </main>
  );
}
