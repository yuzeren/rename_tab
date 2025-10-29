# 变更日志

所有显著变更将记录在此文件中。

## v0.1.0 - 2025-10-29

初次发布（Chrome 扩展：标签页标题修改器）。

- 支持修改当前标签页标题
- 支持修改网页图标（favicon），可使用图片 URL 或 emoji
- 弹窗 UI：标题输入、favicon 输入与 emoji 快选、恢复默认按钮
- 键盘操作：Enter 提交标题修改
- 受限页面识别：在 `chrome://`、`chrome-devtools://`、`chrome-extension://`、`edge://`、`about:` 页面避免脚本注入并禁用相关操作
- 默认标题填充：打开弹窗时自动显示当前标签页标题
- 文档完善：PRD、DEV_DESIGN、ROADMAP、TEST_CASES 更新