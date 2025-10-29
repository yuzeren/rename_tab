# 标签页标题修改器 - 开发设计文档

## 1. 技术架构

### 1.1 技术栈
- **前端**：HTML, CSS, JavaScript
- **浏览器API**：Chrome Extension API
- **主要API**：chrome.tabs, chrome.scripting

### 1.2 文件结构
```
rename_tab/
├── manifest.json      # 插件配置文件
├── popup.html         # 弹出窗口界面
├── popup.js           # 弹出窗口逻辑
└── images/            # 图标资源
    ├── icon16.svg     # 16px图标
    ├── icon48.svg     # 48px图标
    └── icon128.svg    # 128px图标
```

## 2. 核心模块设计

### 2.1 配置模块 (manifest.json)
- **功能**：定义插件的基本信息、权限和资源
- **关键配置**：
  - manifest_version: 3 (使用最新的Chrome插件规范)
  - permissions: ["activeTab", "scripting"] (最小权限原则)
  - action.default_popup: 定义点击图标时显示的页面
  - action.default_icon: 定义插件图标

### 2.2 用户界面模块 (popup.html)
- **功能**：提供用户输入新标题和修改favicon的界面
- **组件**：
  - 标题文本
  - 标题输入框 (id="titleInput")
  - 标题确定按钮 (id="changeTitle")
  - Favicon输入框 (id="faviconInput")
  - Emoji选择列表 (class="emoji-list")
  - 修改图标按钮 (id="changeFaviconButton")
  - 状态提示 (id="status")
- **样式设计**：
  - 宽度固定为300px
  - 使用flex布局实现垂直排列
  - 蓝色主题按钮，悬停效果
  - 绿色成功提示文本
  - Emoji列表使用grid布局，支持悬停和选中效果

### 2.3 逻辑控制模块 (popup.js)
- **功能**：处理用户输入并执行标题和favicon修改
- **主要流程**：
  1. 监听DOM加载完成事件
  2. 获取页面元素引用
  3. 面板初始化时读取当前标签页标题并填充输入框作为缺省文本
  4. 为标题修改按钮添加点击事件监听器
  5. 为favicon修改按钮添加点击事件监听器
  6. 为emoji元素添加点击事件监听器

- **初始化填充实现**：
  - 使用`chrome.tabs.query`获取当前活动标签页
  - 使用`chrome.scripting.executeScript`在页面中读取`document.title`
  - 将返回结果回填到`titleInput.value`，用于作为缺省文本
  - 在非扩展环境下（如预览），进行API存在性判断以避免报错

### 2.4 Favicon修改模块
- **功能**：修改当前标签页的网站图标
- **实现方式**：
  1. 通过chrome.scripting.executeScript注入脚本到当前页面
  2. 移除页面中现有的favicon链接
  3. 创建新的favicon链接元素并添加到页面head中
- **支持类型**：
  1. 图片URL：直接设置为favicon的href属性
  2. Emoji图标：使用Canvas将emoji转换为图片数据URL

### 2.5 恢复默认功能模块
- **功能**：恢复当前标签页的原始标题和favicon
- **实现方式**：
  1. 在修改标题或favicon时，先缓存原始值
  2. 提供恢复按钮，点击后执行恢复操作
  3. 通过chrome.scripting.executeScript注入恢复脚本
- **恢复流程**：
  1. 标题恢复：将document.title设置回原始值
  2. Favicon恢复：移除自定义favicon，恢复原始favicon链接
  4. 为输入框添加回车键监听器
  5. 执行标题修改逻辑
  6. 显示成功状态并自动关闭

## 3. 关键算法与实现

### 3.1 标题修改实现
```javascript
// 在标签页中执行的函数
function changeTabTitle(newTitle) {
  document.title = newTitle;
}

// 调用执行脚本API
chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
  chrome.scripting.executeScript({
    target: {tabId: tabs[0].id},
    func: changeTabTitle,
    args: [newTitle]
  });
});
```

### 3.2 用户体验优化
- **自动聚焦**：页面加载后自动聚焦到输入框
  ```javascript
  titleInput.focus();
  ```
- **键盘支持**：支持Enter键提交
  ```javascript
  titleInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      changeButton.click();
    }
  });
  ```
- **自动关闭**：成功后自动关闭弹窗
  ```javascript
  setTimeout(() => {
    window.close();
  }, 2000);
  ```

## 4. 安全性考虑

### 4.1 权限最小化
- 仅请求必要的权限：
  - activeTab: 只访问当前活动标签页
  - scripting: 允许在标签页中执行脚本

### 4.2 输入验证
- 使用trim()去除输入文本的首尾空格
- 验证输入不为空后才执行修改操作

## 5. 性能优化

### 5.1 资源优化
- 使用SVG格式图标，减小文件体积
- 内联CSS样式，减少HTTP请求

### 5.2 代码优化
- 使用事件委托减少事件监听器数量
- 避免不必要的DOM操作
- 使用简洁的JavaScript代码，减少执行时间

## 6. 扩展性设计

### 6.1 模块化结构
- 将UI和逻辑分离，便于未来功能扩展
- 使用函数封装核心功能，便于重用

### 6.2 未来功能支持
- 预留状态元素，便于添加历史记录功能
- 代码结构支持添加模板和批量修改功能