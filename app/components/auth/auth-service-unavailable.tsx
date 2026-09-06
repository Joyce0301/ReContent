import Image from "next/image";
import Link from "next/link";
import "../../auth/auth.css";

type AuthServiceUnavailableProps = { title?: string };

export function AuthServiceUnavailable({ title = "登录服务暂时不可用" }: AuthServiceUnavailableProps) {
  return (
    <div className="account-page">
      <header className="account-header"><Link href="/" className="account-brand">ReContent 账户</Link></header>
      <main className="account-main">
        <div className="account-intro">
          <Image src="/branding/recontent-symbol-512.png" alt="" width={104} height={104} />
          <h1>{title}</h1>
          <p>认证服务暂时不可用，请稍后再试。</p>
        </div>
        <p className="account-switch">如果这个问题持续出现，请联系维护者检查服务状态。</p>
        <Link href="/" className="account-return">返回首页</Link>
      </main>
    </div>
  );
}
