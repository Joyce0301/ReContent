type XiaohongshuBridgeInstallGuideProps = {
  className?: string;
};

export function XiaohongshuBridgeInstallGuide({
  className = ""
}: XiaohongshuBridgeInstallGuideProps) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/90 bg-white/70 p-3 text-[11px] leading-5 text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ${className}`.trim()}
    >
      <p className="font-medium text-slate-700">
        该功能目前仅支持 Chrome / Edge 桌面版，用于帮你打开小红书创作页并自动填入内容。
      </p>
      <p className="mt-2 text-slate-700">安装方式</p>
      <ol className="mt-1 space-y-1">
        <li>1. 打开 chrome://extensions</li>
        <li>2. 开启右上角“开发者模式”</li>
        <li>3. 加载 extensions/xiaohongshu-draft-bridge 目录</li>
      </ol>
    </div>
  );
}
