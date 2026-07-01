# Xiaohongshu Draft Connector Manual Checklist

日期：2026-07-01

用途：

- 用于记录真实桌面浏览器中的扩展安装与手工验收结果
- 完成后可作为 `2026-07-01-xiaohongshu-draft-connector-verification.md` 的补充证据

## 前置条件

- 仓库根目录已运行：

```bash
npm run verify:xiaohongshu-draft
```

- 浏览器：Chrome / Edge（Chromium）
- 扩展目录：`extensions/xiaohongshu-draft-bridge`
- 建议验收入口：`http://localhost:3000/xiaohongshu-draft-debug`

## 检查项 1：未安装扩展

### 步骤

1. 不加载扩展，直接打开 `http://localhost:3000/xiaohongshu-draft-debug`
2. 点击 `发送测试草稿到小红书`

### 预期

- 页面提示 `未检测到小红书草稿连接器，请先安装桌面扩展。`
- `复制内容` 仍可使用

### 实际结果

- 状态：
  - [x] 通过
  - [ ] 未通过
- 备注：
  - 2026-07-01 在本机 Chrome 中访问 `http://localhost:3000/xiaohongshu-draft-debug`
  - 点击 `发送测试草稿到小红书` 后，页面先进入 opening 状态，约 30 秒后落到 `未检测到小红书草稿连接器，请先安装桌面扩展。`
  - 页面未卡死，可继续重复点击验证

## 检查项 2：已安装扩展，但未登录小红书

### 步骤

1. 打开 `chrome://extensions`
2. 加载 `extensions/xiaohongshu-draft-bridge`
3. 确保当前浏览器未登录小红书创作后台
4. 打开 `http://localhost:3000/xiaohongshu-draft-debug`
5. 点击 `发送测试草稿到小红书`

### 预期

- 浏览器打开 `https://creator.xiaohongshu.com/publish/publish`
- ReContent 页面提示 `请先登录小红书，登录完成后重新发送。`

### 实际结果

- 状态：
  - [x] 通过
  - [ ] 未通过
- 备注：
  - 2026-07-01 在本机通过全新 Edge 临时 profile（`--remote-debugging-port=9226 --load-extension=extensions/xiaohongshu-draft-bridge`）复测
  - 调试页实际显示 `桥接状态：已检测到`
  - 点击 `发送测试草稿到小红书` 后，浏览器打开小红书 creator 并被重定向到登录页
  - ReContent 页面先进入 opening，随后稳定收敛到 `请先登录小红书，登录完成后重新发送。`
  - 本轮同时确认：此前的 `Frame with ID 0 was removed.` 已不再出现

## 检查项 3：已安装扩展，且已登录小红书

### 步骤

1. 保持扩展已加载
2. 先在浏览器里登录小红书创作后台
3. 打开 `http://localhost:3000/xiaohongshu-draft-debug`
4. 点击 `发送测试草稿到小红书`

### 预期

- 浏览器打开小红书创作页
- 标题输入框已填入标题
- 正文编辑区已填入正文
- ReContent 页面提示 `已打开小红书编辑页，请检查内容后保存草稿。`
- 不会自动点击 `保存草稿`
- 不会自动点击 `发布`

### 实际结果

- 状态：
  - [x] 通过
  - [ ] 未通过
- 备注：
  - 2026-07-01 在已登录 Edge 临时 profile 中完成复测
  - 扩展触发后，creator 页会先从默认“上传视频”页自动切到“写长文 -> 新的创作”流程
  - 最终页面进入可编辑状态，标题栏写入 `AI 内容重制如何写成小红书`
  - 正文写入：
    - `先讲一个真实场景：同一份素材要改成小红书版本。`
    - `核心做法是保留观点，再重写表达。`
    - `#AI工具 #内容运营`
  - ReContent 调试页同步显示 `已打开小红书编辑页，请检查内容后保存草稿。`
  - 同时确认：不会自动点击 `保存草稿`，不会自动点击 `发布`

## 附加记录

### 浏览器版本

- Google Chrome（macOS，本机已实测未安装扩展链路）

### 扩展是否成功加载

- [x] 是
- [ ] 否

### 如有截图，可记录路径



## 最终结论

- [x] 三项均通过，可补充到 verification report 并作为 goal 完成证据
- [ ] 存在未通过项，需要继续修复
