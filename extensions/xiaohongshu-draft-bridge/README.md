# Xiaohongshu Draft Bridge

本扩展用于把 ReContent 中生成的小红书成稿，直接送进你本机浏览器里的小红书创作页。

## 安装方式

1. 打开 Chrome 或 Edge
2. 访问 `chrome://extensions`
3. 开启右上角 `开发者模式`
4. 点击 `加载已解压的扩展程序`
5. 选择当前目录：`extensions/xiaohongshu-draft-bridge`

## 使用方式

1. 保持浏览器中已经登录小红书创作后台
2. 在 ReContent 生成一条小红书结果
3. 点击 `发送到小红书草稿`
4. 扩展会打开 `https://creator.xiaohongshu.com/publish/publish`
5. 如果页面结构匹配，会自动填入标题和正文

## 当前限制

- 仅支持桌面 Chromium 浏览器
- 当前仅对 `localhost` / `127.0.0.1` 本地开发环境，以及 `*.pages.dev` 域名注入桥接脚本
- 当前只填充标题与正文
- 标签会附加到正文末尾
- 不自动点击 `保存草稿`
- 不自动点击 `发布`
- 不接管账号密码，也不托管登录态

## 手工验收清单

在进入下面的浏览器实测前，建议先在仓库根目录运行：

```bash
npm run verify:xiaohongshu-draft
```

确认代码、测试和构建都已经通过，再做浏览器级验收。

如果你只是想验收桥接能力，不想先走一遍完整生成链路，建议直接打开：

- `http://localhost:3000/xiaohongshu-draft-debug`

这个页面会发送固定的小红书测试草稿，适合重复验证扩展安装、登录态和自动填充。

### 1. 未安装扩展

1. 不加载本扩展，直接打开 `http://localhost:3000/xiaohongshu-draft-debug`
2. 点击 `发送测试草稿到小红书`
4. 预期结果：
   - 页面提示 `未检测到小红书草稿连接器，请先安装桌面扩展。`
   - 页面不会卡死，仍可重复点击再次测试

### 2. 已安装扩展，但未登录小红书

1. 加载本扩展
2. 确保浏览器当前未登录小红书创作后台
3. 打开 `http://localhost:3000/xiaohongshu-draft-debug`
4. 点击 `发送测试草稿到小红书`
5. 预期结果：
   - 浏览器打开 `https://creator.xiaohongshu.com/publish/publish`
   - 页面提示 `请先登录小红书，登录完成后重新发送。`

### 3. 已安装扩展，且已登录小红书

1. 加载本扩展
2. 先在浏览器里登录小红书创作后台
3. 打开 `http://localhost:3000/xiaohongshu-draft-debug`
4. 点击 `发送测试草稿到小红书`
5. 预期结果：
   - 浏览器打开创作页
   - 标题输入框已带入标题
   - 正文编辑区已带入正文
   - 页面提示 `已打开小红书编辑页，请检查内容后保存草稿。`
   - 不会自动点击 `保存草稿` 或 `发布`
