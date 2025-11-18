# 变更日志

所有显著变更将记录在此文件中。

## v0.1.1 - 2025-11-11

新增：支持在输入框直接输入自定义 emoji 生成 favicon。

- 弹窗输入框支持 `emoji` 文本，自动渲染为 32×32 PNG 并设置为 favicon
- 输入判定优化：识别 `http/https` 与 `data:image` URL，其他文本按 emoji 渲染
- 文档与测试：更新占位文案与新增测试用例 F-008.1
- 保持受限页面防护逻辑不变

## v0.1.0 - 2025-10-29

初次发布（Chrome 扩展：Tab PowerToy）。

- 支持修改当前标签页标题
- 支持修改网页图标（favicon），可使用图片 URL 或 emoji
- 弹窗 UI：标题输入、favicon 输入与 emoji 快选、恢复默认按钮
- 键盘操作：Enter 提交标题修改
- 受限页面识别：在 `chrome://`、`chrome-devtools://`、`chrome-extension://`、`edge://`、`about:` 页面避免脚本注入并禁用相关操作
- 默认标题填充：打开弹窗时自动显示当前标签页标题
- 文档完善：PRD、DEV_DESIGN、ROADMAP、TEST_CASES 更新