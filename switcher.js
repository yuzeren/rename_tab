(function() {
  // 防止重复注入
  if (window.hasTabSwitcher) return;
  window.hasTabSwitcher = true;

  let host = null;
  let shadowRoot = null;
  let panel = null;
  let listContainer = null;
  let isVisible = false;
  let tabElements = []; // 存储当前的 DOM 元素引用
  let selectedIndex = -1;
  let launcherMode = false;
  let allTabsData = { tabs: [], groups: [], shortcut: '' }; // 保存完整数据用于搜索
  let searchInput = null; // 搜索框引用
  let shortcutMap = {}; // 存储快捷键映射 code -> tabId
  
  // 快速切换配置
  let showTimestamp = 0;
  let showTimer = null;
  const QUICK_SWITCH_THRESHOLD = 300; // ms
  const PANEL_SHOW_DELAY = 200; // ms

  // 快捷键候选列表 (左手区域)
  const SHORTCUT_CANDIDATES = [
    'Digit1', 'Digit2', 'Digit3', 'Digit4',
    'KeyQ', 'KeyW', 'KeyE', 'KeyR',
    'KeyA', 'KeyS', 'KeyD', 'KeyF',
    'KeyZ', 'KeyX', 'KeyC', 'KeyV'
  ];

  // 初始化 DOM
  function initDOM() {
    if (host) return;

    host = document.createElement('div');
    host.id = 'tab-switcher-host';
    
    // 使用 Shadow DOM 隔离样式
    shadowRoot = host.attachShadow({ mode: 'closed' });
    
    // 注入样式
    // 方法1：直接注入 style 标签（更可靠，不依赖文件访问）
    const styleContent = `
      /* 样式隔离容器 */
      :host {
        all: initial;
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 2147483647; /* Max Z-index */
        pointer-events: none;
        display: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;

        /* Light Mode Variables */
        --bg-color: #ffffff;
        --text-primary: #333333;
        --text-secondary: #666666;
        --text-tertiary: #444444;
        --header-bg: #f8f9fa;
        --group-bg: #fafafa;
        --border-color: #eeeeee;
        --border-color-dark: #dddddd;
        --hover-bg: #f5f5f5;
        --selected-bg: #e3f2fd;
        --accent-color: #2196f3;
        --shadow-color: rgba(0, 0, 0, 0.2);
        --scrollbar-thumb: #dddddd;
        --scrollbar-thumb-hover: #cccccc;
        --overlay-bg: rgba(0, 0, 0, 0.2);
        --key-badge-bg: #ffffff;
        --key-badge-border: #dddddd;
        --key-badge-text: #333333;
        --search-bg: #ffffff;
        --search-border: #dddddd;
        --search-focus-border: #2196f3;
        --search-focus-shadow: rgba(33, 150, 243, 0.1);
      }

      @media (prefers-color-scheme: dark) {
        :host {
          --bg-color: #202124;
          --text-primary: #e8eaed;
          --text-secondary: #9aa0a6;
          --text-tertiary: #bdc1c6;
          --header-bg: #292a2d;
          --group-bg: #292a2d;
          --border-color: #3c4043;
          --border-color-dark: #5f6368;
          --hover-bg: #2d2e31;
          --selected-bg: #394457;
          --accent-color: #8ab4f8;
          --shadow-color: rgba(0, 0, 0, 0.5);
          --scrollbar-thumb: #5f6368;
          --scrollbar-thumb-hover: #80868b;
          --overlay-bg: rgba(0, 0, 0, 0.6);
          --key-badge-bg: #3c4043;
          --key-badge-border: #5f6368;
          --key-badge-text: #e8eaed;
          --search-bg: #202124;
          --search-border: #5f6368;
          --search-focus-border: #8ab4f8;
          --search-focus-shadow: rgba(138, 180, 248, 0.2);
        }
      }

      /* Avoid using base64 fonts which can trigger CSP errors */
      /* Use system fonts instead */

      :host(.visible) {
        display: block;
        pointer-events: auto;
      }

      /* 遮罩层 */
      .switcher-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: var(--overlay-bg);
        backdrop-filter: blur(2px);
      }

      /* 面板主体 */
      .switcher-panel {
        position: absolute;
        top: 20%; /* 改为顶部 20% 位置，避免输入搜索时高度变化导致跳动 */
        left: 50%;
        transform: translateX(-50%); /* 仅水平居中 */
        width: 600px;
        max-height: 80vh;
        background: var(--bg-color);
        border-radius: 12px;
        box-shadow: 0 8px 32px var(--shadow-color);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid var(--border-color);
        outline: none; /* Remove default focus outline */
      }

      /* 头部 */
      .switcher-header {
        padding: 16px;
        border-bottom: 1px solid var(--border-color);
        background: var(--header-bg);
        font-size: 14px;
        color: var(--text-secondary);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .key-hint {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      .key-hint-group {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .key-badge {
        background: var(--key-badge-bg);
        border: 1px solid var(--key-badge-border);
        border-radius: 4px;
        padding: 2px 6px;
        font-size: 12px;
        font-weight: 600;
        color: var(--key-badge-text);
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      }

      /* 搜索框容器 */
      .search-container {
        padding: 12px 16px;
        background: var(--search-bg);
        border-bottom: 1px solid var(--border-color);
        display: none; /* 默认隐藏，Launcher 模式下显示 */
      }
      
      .search-wrapper {
        position: relative;
        display: flex;
        align-items: center;
        width: 100%;
      }

      .search-input {
        width: 100%;
        padding: 8px 12px;
        padding-left: 40px; /* 留出左侧快捷键提示的空间 */
        font-size: 14px;
        background: var(--search-bg);
        color: var(--text-primary);
        border: 1px solid var(--search-border);
        border-radius: 6px;
        outline: none;
        box-sizing: border-box;
        transition: border-color 0.2s, box-shadow 0.2s;
        font-family: inherit;
      }
      
      .search-shortcut-badge {
        position: absolute;
        left: 12px;
        top: 50%;
        transform: translateY(-50%);
        pointer-events: none;
        
        /* 复用 key-badge 样式 */
        background: var(--key-badge-bg);
        border: 1px solid var(--key-badge-border);
        border-radius: 4px;
        padding: 2px 8px;
        font-size: 12px;
        font-weight: 600;
        color: var(--text-tertiary);
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        opacity: 0.8;
      }
      
      /* 当输入框聚焦时，隐藏快捷键提示 */
      /* .search-input:focus + .search-shortcut-badge {
        display: none;
      } */

      .search-input:focus {
        border-color: var(--search-focus-border);
        box-shadow: 0 0 0 2px var(--search-focus-shadow);
      }

      /* 列表容器 */
      .switcher-list {
        flex: 1;
        overflow-y: auto;
        padding: 8px 0;
        max-height: 60vh;
      }

      /* 分组标题 */
      .group-header {
        padding: 8px 16px;
        font-size: 12px;
        font-weight: 600;
        color: var(--text-secondary);
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--group-bg);
      }

      .group-badge-wrapper {
        max-width: 90px;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        margin-left: 8px;
        flex-shrink: 0;
      }

      .group-badge {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 11px;
        height: 20px;
        box-sizing: border-box;
        white-space: nowrap;
        max-width: 100%;
        flex-shrink: 0;
      }

      .group-name {
         overflow: hidden;
         text-overflow: ellipsis;
         font-weight: 500;
         color: var(--text-tertiary);
       }

      /* 标签页项 */
      .tab-item {
        padding: 10px 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        transition: background 0.1s;
        border-left: 3px solid transparent;
      }

      .tab-item:hover {
        background: var(--hover-bg);
      }

      .tab-item.selected {
        background: var(--selected-bg);
        border-left-color: var(--accent-color);
      }

      .tab-favicon {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        object-fit: contain;
      }

      .tab-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .tab-title {
        font-size: 14px;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .tab-url {
        font-size: 11px;
        color: var(--text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .tab-meta {
        font-size: 11px;
        color: var(--text-secondary);
        margin-left: 8px;
        flex-shrink: 0;
      }

      .tab-shortcut {
        margin-right: 12px;
        font-size: 11px;
        font-weight: 600;
        color: var(--text-tertiary);
        background: var(--key-badge-bg);
        border: 1px solid var(--key-badge-border);
        border-radius: 4px;
        padding: 2px 6px;
        min-width: 14px;
        text-align: center;
        box-shadow: 0 1px 1px rgba(0,0,0,0.05);
        flex-shrink: 0;
      }

      /* 滚动条美化 */
      .switcher-list::-webkit-scrollbar {
        width: 8px;
      }

      .switcher-list::-webkit-scrollbar-track {
        background: transparent;
      }

      .switcher-list::-webkit-scrollbar-thumb {
        background: var(--scrollbar-thumb);
        border-radius: 4px;
      }

      .switcher-list::-webkit-scrollbar-thumb:hover {
        background: var(--scrollbar-thumb-hover);
      }
    `;

    const styleElement = document.createElement('style');
    styleElement.textContent = styleContent;
    shadowRoot.appendChild(styleElement);

    // 方法2：保留 link 标签作为备份（如果上面的 style 注入太长或者想用缓存）
    // const style = document.createElement('link');
    // style.rel = 'stylesheet';
    // style.href = chrome.runtime.getURL('switcher.css');
    // shadowRoot.appendChild(style);

    // 构建结构
    const container = document.createElement('div');
    container.className = 'switcher-overlay';
    
    panel = document.createElement('div');
    panel.className = 'switcher-panel';
    panel.setAttribute('tabindex', '-1'); // Make focusable
    
    const header = document.createElement('div');
    header.className = 'switcher-header';
    header.innerHTML = `
      <span>标签页切换</span>
      <div class="key-hint">
        <span class="key-badge">Mod</span>
        <span>+</span>
        <span class="key-badge">Q</span>
        <span>切换</span>
        <span class="key-badge" style="margin-left: 8px">Mod</span>
        <span>松开确认</span>
      </div>
    `;

    // 搜索框区域
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    
    const searchWrapper = document.createElement('div');
    searchWrapper.className = 'search-wrapper';
    
    searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'search-input';
    searchInput.placeholder = '搜索标签页...';
    searchInput.autocomplete = 'off';
    
    // 快捷键提示
    const shortcutBadge = document.createElement('span');
    shortcutBadge.className = 'search-shortcut-badge';
    shortcutBadge.textContent = '/';
    
    // 阻止搜索框的 keydown 冒泡，防止与全局快捷键冲突，但要允许特定键
    searchInput.addEventListener('keydown', (e) => {
      // 允许 ESC 关闭（已由全局 handleKeyDown 统一处理）
      // if (e.key === 'Escape') return;

      // 上下键移动列表选中项
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        // 手动触发列表导航
        const direction = e.key === 'ArrowUp' ? -1 : 1;
        moveSelection(direction);
        return;
      }

      // Enter 键确认
      if (e.key === 'Enter') return; // 让它冒泡给 document 处理

      e.stopPropagation(); // 其他键（如输入文字）不冒泡
    });

    searchInput.addEventListener('input', (e) => {
      filterList(e.target.value);
    });

    // 注意：CSS选择器是 .search-input:focus + .search-shortcut-badge
    // 所以在 DOM 结构中，search-shortcut-badge 必须位于 searchInput 之后
    // 虽然视觉上它在左侧，但我们在 CSS 中使用了绝对定位 left: 12px
    searchWrapper.appendChild(searchInput);
    searchWrapper.appendChild(shortcutBadge);
    searchContainer.appendChild(searchWrapper);

    // 阻止右键菜单（防止 Ctrl+Click 触发右键菜单），并处理点击切换
    panel.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // 检查是否点击了标签项，如果是，则执行切换
      // 这解决了 Mac 上 Control+Click 被视为右键点击而不触发 click 事件的问题
      const tabItem = e.target.closest('.tab-item');
      if (tabItem) {
        const tabId = parseInt(tabItem.dataset.tabId);
        if (tabId) {
          safeSendMessage({ type: 'switch_to_tab', tabId: tabId });
          hidePanel();
        }
      }
    });

    listContainer = document.createElement('div');
    listContainer.className = 'switcher-list';
    
    // 自定义滚动逻辑：无视 Alt/Ctrl 键
    listContainer.addEventListener('wheel', (e) => {
      // 如果按下了 Alt 或 Ctrl 键，阻止默认行为并手动滚动
      if (e.altKey || e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        
        // 某些系统/浏览器组合下，按住修饰键可能会改变 delta 轴向或方向
        // 这里简单地假设用户想要垂直滚动，并使用 deltaY 或 deltaX 中较大的那个作为滚动量
        // 或者直接使用 deltaY，如果 deltaY 为 0 但 deltaX 有值（例如 Shift 转义），则使用 deltaX
        
        let delta = e.deltaY;
        if (delta === 0 && e.deltaX !== 0) {
            delta = e.deltaX;
        }
        
        // Fix: Mac 上按住 Control 滚动时，系统可能会反转滚动方向
        // 如果检测到是 Mac 且按下了 Control 键，则反转 delta
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        if (isMac && e.ctrlKey) {
          delta = -delta;
        }
        
        listContainer.scrollTop += delta;
      }
    }, { passive: false });

    panel.appendChild(header);
    panel.appendChild(searchContainer);
    panel.appendChild(listContainer);
    container.appendChild(panel);
    shadowRoot.appendChild(container);
    
    document.body.appendChild(host);

    // 点击遮罩关闭
    container.addEventListener('click', (e) => {
      if (e.target === container) {
        hidePanel();
        safeSendMessage({ type: 'panel_closed_by_user' });
      }
    });
  }

  // 移动选中项
  function moveSelection(direction) {
    if (!tabElements.length) return;

    // 找到当前选中项的索引
    let currentIndex = -1;
    const currentSelected = shadowRoot.querySelector('.tab-item.selected');
    if (currentSelected) {
      // 在当前的 tabElements 数组中查找，而不是依赖 dataset.tabId，因为 tabElements 对应当前显示的列表
      currentIndex = tabElements.indexOf(currentSelected);
    }

    let newIndex = currentIndex + direction;
    
    // 循环选择
    if (newIndex < 0) newIndex = tabElements.length - 1;
    if (newIndex >= tabElements.length) newIndex = 0;

    // 选中新项
    const newItem = tabElements[newIndex];
    if (newItem) {
      if (currentSelected) currentSelected.classList.remove('selected');
      newItem.classList.add('selected');
      newItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // 过滤列表
  function filterList(query) {
    const q = query.toLowerCase().trim();
    
    // 如果没有查询词，显示所有标签（或按初始逻辑）
    if (!q) {
        // 恢复完整列表，保持默认排序
        renderList(allTabsData.tabs, allTabsData.groups, -1, allTabsData.shortcut);
        // 如果是 Launcher 模式，可能默认不需要选中任何项，或者选中第一个
        if (launcherMode && tabElements.length > 0) {
           selectTabByIndex(0);
        } else {
           // 非 Launcher 模式下的默认选中逻辑通常由外部传入的 selectedTabId 决定，
           // 但这里 filterList 通常是在 Launcher 模式下手动触发的。
           // 如果清空搜索，恢复到默认选中状态比较复杂，简单选中第一个即可。
           selectTabByIndex(0);
        }
        return;
    }

    // 过滤
    const filteredTabs = allTabsData.tabs.filter(tab => {
      return (tab.title && tab.title.toLowerCase().includes(q)) || 
             (tab.url && tab.url.toLowerCase().includes(q));
    });

    // 渲染过滤后的列表
    renderList(filteredTabs, allTabsData.groups, -1, allTabsData.shortcut);
    
    // 默认选中第一项
    if (filteredTabs.length > 0) {
      selectTabByIndex(0);
    }
  }

  function selectTabByIndex(index) {
      if (index >= 0 && index < tabElements.length) {
          const item = tabElements[index];
          // 移除旧选中
          const old = shadowRoot.querySelector('.tab-item.selected');
          if (old) old.classList.remove('selected');
          
          item.classList.add('selected');
          item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
  }

  // 渲染列表
  function renderList(tabs, groups, initialIndex, shortcut) {
    if (!listContainer) return;
    
    // 计算需要排除的快捷键（激活键）
    let excludedCode = null;
    if (shortcut) {
        const parts = shortcut.split('+');
        const lastPart = parts[parts.length - 1].toUpperCase();
        // 简单映射常见键
        if (lastPart.length === 1) {
            if (lastPart >= '0' && lastPart <= '9') {
                excludedCode = 'Digit' + lastPart;
            } else if (lastPart >= 'A' && lastPart <= 'Z') {
                excludedCode = 'Key' + lastPart;
            }
        }
    }

    // 准备有效快捷键列表
    const validKeys = SHORTCUT_CANDIDATES.filter(code => code !== excludedCode);
    shortcutMap = {}; // 重置映射

    // 更新快捷键提示
    const headerKeyHint = shadowRoot.querySelector('.switcher-header .key-hint');
    if (headerKeyHint) {
        // 解析快捷键，例如 "Alt+Q" -> ["Alt", "Q"]
        // 或者 "Ctrl+Q" -> ["Ctrl", "Q"]
        // Mac 下 "Alt" 显示为 "Option" (或 ⌥)
        // Mac 下 "Ctrl" 显示为 "Control" (或 ⌃)
        // Mac 下 "Command" 显示为 "Command" (或 ⌘)
        
        console.log('Switcher: Received shortcut string:', shortcut);
        // 如果没有获取到快捷键，不要给默认值，以免误导用户
        // 可以显示为空，或者不显示 key-hint
        let displayShortcut = shortcut;
        if (!displayShortcut) {
            // 如果为空，尝试隐藏提示或显示通用文本
            if (headerKeyHint) headerKeyHint.innerHTML = ''; 
            return;
        }

        let parts = displayShortcut.split('+');
        
        // 简单的平台检测
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        
        if (isMac) {
            // 特殊处理：如果包含 MacCtrl (Control)，且同时包含 Alt (Option)
            // 在绝大多数情况下，用户设置 Control+Q 时，Chrome 可能会因为某些原因（如 Manifest 默认值干扰）
            // 返回 Alt+MacCtrl+Q。这里我们做一个启发式过滤：
            // 如果有 MacCtrl，我们优先信任它作为主修饰键，移除 Alt。
            // 除非用户真的是 Option+Control+Q (极少见)
            const hasControl = parts.includes('MacCtrl') || parts.includes('Ctrl');
            const hasAlt = parts.includes('Alt') || parts.includes('Option');
            
            if (hasControl && hasAlt) {
                console.log('Switcher: Detected both Control and Alt/Option, filtering out Alt/Option to fix potential display issue.');
                parts = parts.filter(p => p !== 'Alt' && p !== 'Option');
            }

            // 替换修饰键名称
            // Chrome Command API mapping on Mac:
            // Ctrl -> Command (⌘)
            // MacCtrl -> Control (⌃)
            // Alt -> Option (⌥)
            parts = parts.map(p => {
                if (p === 'Alt') return 'Option';
                if (p === 'Ctrl') return 'Command'; 
                if (p === 'MacCtrl') return 'Control';
                // Command usually stays Command
                return p;
            });
        }

        let modifiers = [];
        let key = 'Q';
        
        // Handle cases where parts might be empty or undefined
        if (parts.length > 1) {
            key = parts[parts.length - 1];
            modifiers = parts.slice(0, parts.length - 1);
        } else {
            // Fallback for unexpected format: No modifiers, just the key
            modifiers = [];
            if (parts.length === 1 && parts[0]) {
                key = parts[0];
            }
        }

        // Generate HTML for "Press" part: Modifier + ... + Key
        let pressHtml = '';
        modifiers.forEach((mod) => {
            pressHtml += `<span class="key-badge">${mod}</span><span>+</span>`;
        });
        pressHtml += `<span class="key-badge">${key}</span>`;

        // Generate HTML for "Release" part: Modifier + ...
        let releaseHtml = modifiers.map(mod => `<span class="key-badge">${mod}</span>`).join('<span>+</span>');

        headerKeyHint.innerHTML = `
            <div class="key-hint-group">
                ${pressHtml}
                <span>切换</span>
            </div>
            <div class="key-hint-group" style="margin-left: 8px">
                ${releaseHtml}
                <span>松开确认</span>
            </div>
        `;
    }
    
    // 使用 DocumentFragment 批量操作 DOM，减少重绘
    const fragment = document.createDocumentFragment();
    tabElements = []; // 清空引用，重新填充
    
    // 预处理分组映射
    const groupMap = new Map();
    if (groups) {
      groups.forEach(g => groupMap.set(g.id, g));
    }

    // 直接使用传入的 tabs (已经是 MRU 排序)，不再重新排序
    // const sortedTabs = tabs.sort((a, b) => { ... });

    tabs.forEach((tab, index) => {
      // 分配快捷键
      let shortcutHtml = '';
      if (index < validKeys.length) {
          const code = validKeys[index];
          shortcutMap[code] = tab.id;
          
          let displayKey = '';
          if (code.startsWith('Digit')) displayKey = code.replace('Digit', '');
          else if (code.startsWith('Key')) displayKey = code.replace('Key', '');
          
          if (displayKey) {
            shortcutHtml = `<div class="tab-shortcut">${displayKey}</div>`;
          }
      }

      // 标签项
      const item = document.createElement('div');
      item.className = 'tab-item';
      item.dataset.tabId = tab.id;
      // 优化：优先使用 API 返回的图标，如果没有则使用默认 emoji
      // 另外添加 onerror 处理加载失败的情况
      const defaultFavicon = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📄</text></svg>';
      const faviconSrc = tab.favIconUrl || defaultFavicon;
      
      // 获取分组颜色
      let groupBadgeHtml = '';
      if (tab.groupId !== -1 && groupMap.has(tab.groupId)) {
          const group = groupMap.get(tab.groupId);
          const colorMap = {
            grey: '#dadce0', blue: '#8ab4f8', red: '#f28b82', yellow: '#fdd663',
            green: '#81c995', pink: '#ff8bcb', purple: '#c58af9', cyan: '#78d9ec', orange: '#fcad70'
          };
          const baseColor = colorMap[group.color] || '#dadce0';
          // 使用 rgba 或简单的 hex + alpha 模拟浅色背景
          // 注意：这里假设 baseColor 是 6位 hex
          
          const title = group.title || 'Group';
          
          groupBadgeHtml = `
            <div class="group-badge-wrapper">
              <div class="group-badge" style="background-color: ${baseColor}40; border: 1px solid ${baseColor}80;">
                <span class="group-name">${escapeHtml(title)}</span>
              </div>
            </div>
          `;
      }

      item.innerHTML = `
        ${shortcutHtml}
        <img class="tab-favicon" src="${faviconSrc}">
        <div class="tab-info">
          <div class="tab-title">${escapeHtml(tab.title)}</div>
          <div class="tab-url">${escapeHtml(tab.url)}</div>
        </div>
        ${groupBadgeHtml}
      `;
      
      // 添加加载失败的回退处理
      const img = item.querySelector('.tab-favicon');
      if (img) {
        img.onerror = () => {
          img.onerror = null;
          img.src = defaultFavicon;
        };
      }
      
      item.addEventListener('click', () => {
        safeSendMessage({ type: 'switch_to_tab', tabId: tab.id });
        hidePanel();
      });

      fragment.appendChild(item);
      tabElements.push(item);
    });
    
    // 一次性清空并追加
    listContainer.innerHTML = '';
    listContainer.appendChild(fragment);
    // 重置滚动位置，防止保留上次的滚动状态
    listContainer.scrollTop = 0;
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function selectTab(tabId) {
    // 移除旧选中
    const old = shadowRoot.querySelector('.tab-item.selected');
    if (old) old.classList.remove('selected');

    // 查找新选中
    const target = tabElements.find(el => parseInt(el.dataset.tabId) === tabId);
    if (target) {
      target.classList.add('selected');
      // 滚动到可见
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function showPanel(data) {
    // 保存完整数据
    allTabsData = { tabs: data.tabs, groups: data.groups, shortcut: data.shortcut };

    // 读取 launcherMode 设置
    if (chrome.runtime?.id && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['launcherMode'], (result) => {
        launcherMode = result.launcherMode || false;
        performShowPanel(data);
      });
    } else {
        performShowPanel(data);
    }
  }

  function performShowPanel(data) {
    initDOM();
    updateSearchVisibility();
    
    // 重置搜索框
    if (searchInput) {
        searchInput.value = '';
    }

    renderList(data.tabs, data.groups, data.selectedTabId, data.shortcut);

    // 如果面板已经在显示中（例如用户按住 Alt 连续按 Q），则直接更新，不进行延迟逻辑
    if (isVisible) {
        if (showTimer) {
            clearTimeout(showTimer);
            showTimer = null;
        }
        selectTab(data.selectedTabId);
        focusPanel();
        return;
    }

    // 清除旧定时器
    if (showTimer) {
        clearTimeout(showTimer);
        showTimer = null;
    }

    if (launcherMode) {
        showTimestamp = Date.now();
        // 确保面板暂时隐藏
        host.classList.remove('visible');
        
        // 延迟显示
        showTimer = setTimeout(() => {
            host.classList.add('visible');
            selectTab(data.selectedTabId);
            isVisible = true;
            focusPanel();
            showTimer = null;
        }, PANEL_SHOW_DELAY);
    } else {
        host.classList.add('visible');
        selectTab(data.selectedTabId);
        isVisible = true;
        focusPanel();
    }
  }

  function focusPanel() {
    requestAnimationFrame(() => {
      if (panel) {
        panel.focus();
        logToBackground('Panel focused');
      }
    });
  }
  
  function updateSearchVisibility() {
      if (!shadowRoot) return;
      const container = shadowRoot.querySelector('.search-container');
      if (container) {
          container.style.display = launcherMode ? 'block' : 'none';
      }
  }

  function hidePanel() {
    if (host) host.classList.remove('visible');
    isVisible = false;
  }

  // 安全发送消息
  function safeSendMessage(message) {
    if (!chrome.runtime?.id) {
      // 扩展上下文失效，静默失败
      return Promise.resolve();
    }
    return chrome.runtime.sendMessage(message).catch(err => {
        // 忽略 context invalidated 错误
        if (err.message.includes('Extension context invalidated')) {
            return;
        }
        throw err;
    });
  }

  // 日志辅助函数
  function logToBackground(message, data) {
    try {
      safeSendMessage({
        type: 'log_from_content',
        message: message + (data ? ' ' + JSON.stringify(data) : '')
      }).catch(() => {});
    } catch (e) {}
  }

  // 判断是否为 Top Frame
  const isTopFrame = window.top === window.self;
  logToBackground('Switcher script loaded. isTopFrame:', isTopFrame);

  // 监听 Alt/Control/Meta 键松开
  function handleKeyUp(e) {
    // 记录所有 keyup 以便调试
    logToBackground('Keyup event:', { key: e.key, code: e.code, isTopFrame, isVisible });
    
    // 支持 Alt, Control, Meta (Command) 任意修饰键松开
    if (['Alt', 'Control', 'Meta'].includes(e.key) || 
        ['AltLeft', 'AltRight', 'ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight'].includes(e.code)) {
      
      const now = Date.now();
      logToBackground('Modifier key released detected.', { key: e.key, code: e.code });
      
      // Launcher 模式下，松开修饰键不隐藏面板，也不触发切换
      if (launcherMode) {
        const duration = Date.now() - showTimestamp;
        // 如果按键时间很短（快速切换），则执行切换
        if (duration < QUICK_SWITCH_THRESHOLD) {
            logToBackground('Quick switch detected in Launcher Mode. Duration:', duration);
            
            // 如果面板还没显示（还在延迟中），取消显示
            if (showTimer) {
                clearTimeout(showTimer);
                showTimer = null;
            }
            
            hidePanel();
            safeSendMessage({ type: 'alt_released', timestamp: now });
        } else {
            logToBackground('Launcher mode active & hold detected, keeping panel open.');
        }
        return;
      }

      safeSendMessage({ type: 'alt_released', timestamp: now });
      
      // 立即隐藏面板（仅 Top Frame 执行）
      if (isTopFrame && isVisible) {
        hidePanel();
      }
    }
  }

  // 监听按键按下（Escape 关闭，Enter 确认）
  function handleKeyDown(e) {
    if (!isVisible) return;

    // 如果用户按下了字母键或数字键，且当前没有按住修饰键，且搜索框没有聚焦
    // 则自动聚焦搜索框并填入该字符（类似于 macOS Spotlight 或 Alfred）
    // 注意：要排除我们定义的快捷键（1,2...Q,W...）
    // 如果是快捷键，优先由下面的 shortcutMap 逻辑处理
    // 但是 shortcutMap 逻辑只有在 (modifierHeld || !searchFocused) 时才生效
    // 这意味着如果 !searchFocused，快捷键会生效，而不会进入搜索框
    // 这是一个设计冲突：是优先作为快捷键跳转，还是优先作为搜索输入？
    // 根据用户之前的需求：按下快捷键直接切换。
    // 所以：
    // 1. 如果是快捷键 -> 切换
    // 2. 如果不是快捷键，但可是打印字符 -> 聚焦搜索框并输入

    // 处理标签页快捷键切换
    if (shortcutMap[e.code]) {
        // 用户场景：按住 Alt 不动的情况下按快捷键
        // 因此只要按住了 Alt/Ctrl/Meta，就优先作为快捷键处理
        // 如果没有按住修饰键，但焦点不在搜索框（例如已通过上下键移动焦点），也作为快捷键处理
        const isModifierHeld = e.altKey || e.ctrlKey || e.metaKey;
        const isSearchFocused = shadowRoot && shadowRoot.activeElement === searchInput;
        
        if (isModifierHeld || !isSearchFocused) {
            e.preventDefault();
            e.stopPropagation();
            
            const tabId = shortcutMap[e.code];
            safeSendMessage({ type: 'switch_to_tab', tabId: tabId });
            hidePanel();
            return;
        }
    }

    // 激活搜索框快捷键：/
    if (e.key === '/' && shadowRoot && shadowRoot.activeElement !== searchInput) {
        // 如果按下了修饰键，则不触发
        if (!e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            e.stopPropagation();

            if (searchInput) {
                // 确保搜索框可见（即使不在 Launcher 模式下）
                if (searchInput.parentElement) {
                    searchInput.parentElement.style.display = 'block';
                }
                searchInput.focus();
                searchInput.select();
            }
            return;
        }
    }

    // 自动聚焦搜索框逻辑
    // 只有当：
    // 1. 搜索框可见 (launcherMode)
    // 2. 搜索框未聚焦
    // 3. 没按修饰键
    // 4. 是单字符按键 (key.length === 1)
    // 5. 不是空格 (空格通常用于预览或确认，或者已经由 Enter 处理)
    if (launcherMode && searchInput && shadowRoot.activeElement !== searchInput && 
        !e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1 && e.key !== ' ') {
        searchInput.focus();
        // 不需要 preventDefault，让字符自然输入
        // 但由于 focus 可能会导致这次 keydown 不产生 input，需要测试
        // 通常在 keydown 里 focus，该事件的字符不会输入到 input 中
        // 所以可能需要手动追加
        // 或者不在这里 focus，而是让 input 捕获？
        // 简单做法：focus 后不 preventDefault，看浏览器行为
    }

    if (e.key === 'Escape') {
      // 如果搜索框聚焦，则只失焦，不关闭
      if (shadowRoot && shadowRoot.activeElement === searchInput) {
          e.preventDefault();
          e.stopPropagation();
          searchInput.blur();
          if (panel) panel.focus();
          return;
      }

      e.preventDefault();
      e.stopPropagation();
      hidePanel();
      safeSendMessage({ type: 'panel_closed_by_user' });
    } else if (e.key === 'Enter' || e.key === ' ') {
      // 如果是空格键且焦点在搜索框，则不处理（允许输入空格）
      if (e.key === ' ' && shadowRoot && shadowRoot.activeElement === searchInput) {
          return;
      }

      e.preventDefault();
      e.stopPropagation();
      // 获取当前选中的标签页
      const selected = shadowRoot.querySelector('.tab-item.selected');
      if (selected) {
        const tabId = parseInt(selected.dataset.tabId);
        if (tabId) {
          safeSendMessage({ type: 'switch_to_tab', tabId: tabId });
          hidePanel();
        }
      }
    }
  }

  // 包装事件监听器以处理上下文失效
  function safeEventHandler(handler) {
      return function(e) {
          if (!chrome.runtime?.id) {
              // 上下文失效，移除监听器
              window.removeEventListener('keyup', this, true);
              document.removeEventListener('keyup', this, true);
              window.removeEventListener('keydown', this, true);
              document.removeEventListener('keydown', this, true);
              return;
          }
          handler(e);
      };
  }
  
  const safeHandleKeyUp = safeEventHandler(handleKeyUp);
  const safeHandleKeyDown = safeEventHandler(handleKeyDown);

  // 使用 capture 模式监听，确保在 Shadow DOM 外部也能捕获
  window.addEventListener('keyup', safeHandleKeyUp, true);
  document.addEventListener('keyup', safeHandleKeyUp, true);
  window.addEventListener('keydown', safeHandleKeyDown, true);
  document.addEventListener('keydown', safeHandleKeyDown, true);

  // 监听后台消息
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // 检查上下文有效性
    if (!chrome.runtime?.id) return;
    
    // 只有 Top Frame 才负责渲染 UI
    if (!isTopFrame) return;
    
    console.log('Switcher received message:', msg.type, msg);
    if (msg.type === 'show_panel') {
      showPanel(msg.data);
    } else if (msg.type === 'update_selection') {
      selectTab(msg.selectedTabId);
    } else if (msg.type === 'hide_panel') {
      hidePanel();
    }
  });

})();
