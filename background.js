// 最近使用的标签页历史记录
let recentTabHistory = [];
const MAX_HISTORY_SIZE = 10;
let isInitialized = false;
let historyLoadedPromise = null;

// 持久化存储相关函数
function saveHistory() {
  chrome.storage.session.set({ recentTabHistory }).catch(e => console.warn('Failed to save history:', e));
}

function loadHistory() {
  if (historyLoadedPromise) return historyLoadedPromise;
  
  historyLoadedPromise = chrome.storage.session.get('recentTabHistory').then(data => {
    if (data && data.recentTabHistory && Array.isArray(data.recentTabHistory)) {
      recentTabHistory = data.recentTabHistory;
      log('History loaded from session storage:', recentTabHistory);
    }
  }).catch(e => {
    console.warn('Failed to load history:', e);
  });
  return historyLoadedPromise;
}

// 会话状态管理
let switchingSession = {
  isActive: false,      // 是否正在进行切换会话
  timer: null,          // 延迟显示面板的计时器
  currentTabId: null,   // 触发切换时的当前 Tab
  targetIndex: 0,       // 当前选中的目标索引（在 MRU 列表中的索引）
  panelVisible: false,  // 面板是否已通知显示
  isDebug: false,       // 是否为调试模式
  cachedTabs: null,      // 缓存 Tabs 列表
  logBuffer: []          // 日志缓冲区
};

// 日志记录函数
function log(message, ...args) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message} ${args.map(a => JSON.stringify(a)).join(' ')}`;
  console.log(message, ...args);
  
  switchingSession.logBuffer.push(logEntry);
  if (switchingSession.logBuffer.length > 100) {
    switchingSession.logBuffer.shift();
  }
}

const PANEL_DELAY_MS = 200;

// 保持Service Worker活跃
function keepAlive() {
  setInterval(() => {
    chrome.runtime.sendMessage({ type: 'keepAlive' }).catch(() => {});
  }, 20000);
}

// 初始化函数
async function initialize() {
  if (isInitialized) return;
  try {
    log('Initializing recent tab switcher...');
    await loadHistory();
    if (recentTabHistory.length === 0) {
        await initializeTabHistory();
    }
    
    setupContextMenu();
    
    // 自动注入 Content Script 到所有已打开的标签页
    injectContentScriptsToExistingTabs();
    
    isInitialized = true;
    keepAlive();
  } catch (error) {
    console.error('Failed to initialize:', error);
  }
}

// 自动注入 Content Script
async function injectContentScriptsToExistingTabs() {
  log('Injecting content scripts to existing tabs...');
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    // 跳过受限页面
    if (isInternalPage(tab.url)) continue;
    // 跳过已注入的（这里只能简单通过 url 判断，实际上 executeScript 允许重复注入，
    // 我们在 content script 头部加了 window.hasTabSwitcher 判断来防止重复执行）
    
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['switcher.js'],
      });
      // switcher.css 通过 manifest 注入，或者这里也可以注入
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id, allFrames: true },
        files: ['switcher.css'],
      });
      log(`Injected content script into tab ${tab.id}`);
    } catch (e) {
      console.warn(`Failed to inject into tab ${tab.id}:`, e);
    }
  }
}

// 设置事件监听器
function setupEventListeners() {
  chrome.tabs.onActivated.addListener(handleTabActivated);
  chrome.tabs.onRemoved.addListener(handleTabRemoved);
  chrome.tabs.onUpdated.addListener(handleTabUpdated);
  chrome.commands.onCommand.addListener(handleCommand);
  chrome.contextMenus.onClicked.addListener(handleContextMenuClick);
  chrome.runtime.onStartup.addListener(initialize);
  chrome.runtime.onInstalled.addListener(initialize);
}

// 处理标签页激活事件
async function handleTabActivated(activeInfo) {
  try {
    await loadHistory(); // Ensure history is loaded
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (isInternalPage(tab.url)) return;

    // 只有在非切换会话期间，才更新历史记录
    // 或者，如果是用户主动点击切换（非我们的切换），才更新？
    // 我们的切换最终也会触发 onActivated。
    // 为了简单，我们只在 Session 不活跃时更新，或者 Session 结束时更新。
    // 但如果 Session 结束时才更新，中间过程可能丢失。
    // 策略：始终更新，但 Session 逻辑使用自己的索引。
    
    // 修正：MRU 列表应该反映“真实”的历史。
    recentTabHistory = recentTabHistory.filter(id => id !== activeInfo.tabId);
    recentTabHistory.unshift(activeInfo.tabId);
    if (recentTabHistory.length > MAX_HISTORY_SIZE) {
      recentTabHistory = recentTabHistory.slice(0, MAX_HISTORY_SIZE);
    }
    saveHistory();
  } catch (error) {
    console.error('Error updating tab history:', error);
  }
}

async function handleTabRemoved(tabId) {
  await loadHistory();
  recentTabHistory = recentTabHistory.filter(id => id !== tabId);
  saveHistory();
}

async function handleTabUpdated(tabId, changeInfo, tab) {
  if (changeInfo.url && isInternalPage(changeInfo.url)) {
    await loadHistory();
    recentTabHistory = recentTabHistory.filter(id => id !== tabId);
    saveHistory();
  }
}

// 获取所有标签页（带分组信息）并按 Window > Group > Index 排序
// 但返回给前端时，我们也需要提供一个 MRU 列表或者 target ID。
// 前端 UI 排序是前端的事，后台最好提供原始数据和“下一个要切谁”的建议。
async function getAllTabsData() {
  console.log('Fetching all tabs and groups data...');
  try {
    const tabs = await chrome.tabs.query({});
    console.log('Tabs fetched:', tabs.length);
    
    // 安全地调用 tabGroups，以防 API 不可用
    let groups = [];
    if (chrome.tabGroups) {
      try {
        groups = await chrome.tabGroups.query({});
        console.log('Groups fetched:', groups.length);
      } catch (e) {
        console.warn('Failed to fetch tab groups:', e);
      }
    } else {
      console.log('chrome.tabGroups API not available');
    }
    
    return { tabs, groups };
  } catch (e) {
    console.error('Error in getAllTabsData:', e);
    throw e;
  }
}

  // 核心逻辑：获取切换目标
// 逻辑：
// 1. 获取所有当前存在的 tabs。
// 2. 过滤掉 recentTabHistory 中不存在的（已关闭的）。
// 3. 将 recentTabHistory 中的 tabs 放在前面，其余 tabs 按默认顺序追加在后面。
// 4. 返回这个有序列表，以及当前 index 对应的 tabId。
async function getOrderedTabs() {
  // 1. 如果有缓存结果，直接返回
  if (switchingSession.isActive && Array.isArray(switchingSession.cachedTabs)) {
    return switchingSession.cachedTabs;
  }
  // 2. 如果正在 fetch (Promise)，等待并返回
  if (switchingSession.isActive && switchingSession.cachedTabs instanceof Promise) {
    try {
      const result = await switchingSession.cachedTabs;
      switchingSession.cachedTabs = result; // 确保缓存结果
      return result;
    } catch (e) {
      switchingSession.cachedTabs = null; // 失败清除
    }
  }

  // 3. 否则执行 fetch
  const promise = fetchOrderedTabs();
  if (switchingSession.isActive) {
    switchingSession.cachedTabs = promise;
  }
  
  try {
    const result = await promise;
    if (switchingSession.isActive) {
      switchingSession.cachedTabs = result;
    }
    return result;
  } catch (e) {
    if (switchingSession.isActive) {
      switchingSession.cachedTabs = null;
    }
    throw e;
  }
}

async function fetchOrderedTabs() {
  const start = Date.now();
  // console.log('Getting ordered tabs...');
  const tabs = await chrome.tabs.query({});
  // console.log('Total tabs:', tabs.length);
  const tabMap = new Map(tabs.map(t => [t.id, t]));
  
  // 构建有序列表：先 MRU，再其他
  const orderedTabs = [];
  const seenIds = new Set();

  // 1. 添加 MRU 中的 tabs
  for (const id of recentTabHistory) {
    if (tabMap.has(id)) {
      orderedTabs.push(tabMap.get(id));
      seenIds.add(id);
    }
  }

  // 2. 添加剩余 tabs
  for (const tab of tabs) {
    if (!seenIds.has(tab.id)) {
      orderedTabs.push(tab);
    }
  }
  console.log('Tabs fetch & sort took:', Date.now() - start, 'ms');
  return orderedTabs;
}

let isProcessingCommand = false;
let pendingAltRelease = false;

// 处理键盘命令
async function handleCommand(command) {
  if (command !== 'switch-recent-tabs') return;

  await loadHistory(); // Ensure history is loaded

  // 状态机逻辑
  if (!switchingSession.isActive) {
    // 强制重置之前的残留状态
    resetSession();
    switchingSession.isActive = true; // 立即标记为活跃

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) {
       log('No active tab found, resetting session');
       resetSession();
       return;
    }

    // 如果在受限页面，直接尝试盲切
    if (isInternalPage(activeTab.url)) {
      const ordered = await getOrderedTabs();
      if (ordered.length > 1) {
        chrome.tabs.update(ordered[1].id, { active: true });
      }
      resetSession();
      return;
    }

    // 新会话初始化
    switchingSession.currentTabId = activeTab.id;
    switchingSession.targetIndex = 1; // 默认下一个是 MRU[1]
    switchingSession.panelVisible = false;

    // 预加载 tabs 数据 (不 await)
    getOrderedTabs().catch(e => console.error('Preload failed:', e));
    
    // 立即显示面板
    showPanelInContent(activeTab.id);
    
  } else {
    // 会话进行中，用户再次按下 Q
    switchingSession.targetIndex++;
    
    // 如果面板已显示，通知更新高亮
    if (switchingSession.panelVisible) {
      updateSelectionInContent(switchingSession.currentTabId);
    }
  }
}

async function getShortcutKey() {
  try {
    const commands = await chrome.commands.getAll();
    const command = commands.find(c => c.name === 'switch-recent-tabs');
    const shortcut = command ? command.shortcut : '';
    console.log('Detected shortcut for switch-recent-tabs:', shortcut);
    return shortcut;
  } catch (e) {
    return '';
  }
}

async function showPanelInContent(tabId) {
  switchingSession.panelVisible = true;
  switchingSession.timer = null;

  try {
    const { tabs, groups } = await getAllTabsData();
    const orderedTabs = await getOrderedTabs();
    const shortcut = await getShortcutKey();
    
    // 修正 targetIndex 范围
    if (switchingSession.targetIndex >= orderedTabs.length) {
      switchingSession.targetIndex = 0; // 循环
    }
    const targetTabId = orderedTabs[switchingSession.targetIndex].id;

    // 发送数据给 Content Script
    log('Sending show_panel message to tab', tabId);
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'show_panel',
        data: {
          tabs: orderedTabs, // Send ordered tabs for rendering to match switching logic
          groups,
          selectedTabId: targetTabId,
          shortcut: shortcut
        }
      });
      return { success: true };
    } catch (e) {
      console.warn('SendMessage failed, trying to inject script and retry...', e);
      // 尝试补救：注入脚本并重试
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId, allFrames: true },
          files: ['switcher.js'],
        });
        await chrome.scripting.insertCSS({
          target: { tabId: tabId, allFrames: true },
          files: ['switcher.css'],
        });
        // 重试发送
        await chrome.tabs.sendMessage(tabId, {
          type: 'show_panel',
          data: {
            tabs: orderedTabs, // Send ordered tabs
            groups,
            selectedTabId: targetTabId,
            shortcut: shortcut
          }
        });
        return { success: true };
      } catch (retryError) {
        throw retryError; // 还是失败，抛出
      }
    }
  } catch (e) {
    log('Failed to show panel (maybe content script not ready):', e);
    // 如果显示失败（例如页面刷新了），可能需要终止会话或盲切
    // 这里暂且不做处理，依靠 Alt 松开时的逻辑兜底
    return { success: false, error: 'Content script error: ' + e.message + '. Try refreshing the page.' };
  }
}

async function updateSelectionInContent(tabId) {
  const orderedTabs = await getOrderedTabs();
  if (orderedTabs.length === 0) return;

  // 循环索引
  if (switchingSession.targetIndex >= orderedTabs.length) {
    switchingSession.targetIndex = 0;
  }

  const targetTabId = orderedTabs[switchingSession.targetIndex].id;

  chrome.tabs.sendMessage(tabId, {
    type: 'update_selection',
    selectedTabId: targetTabId
  }).catch(() => {});
}

// 消息监听
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'keepAlive') {
    sendResponse({ status: 'alive' });
  } 
  else if (message.type === 'getTabHistory') {
    sendResponse({ history: recentTabHistory });
  }
  else if (message.type === 'alt_released') {
    // Alt 松开：执行切换
    const now = Date.now();
    const latency = message.timestamp ? (now - message.timestamp) : 'N/A';
    console.log('Received alt_released message at:', now, 'Latency:', latency);
    handleAltRelease();
  }
  else if (message.type === 'switch_to_tab') {
    // 用户点击列表项直接切换
    finishSession(message.tabId);
  }
  else if (message.type === 'panel_closed_by_user') {
    // 用户点击遮罩关闭，不切换
    resetSession();
  }
  else if (message.type === 'debug_open_panel') {
    // 调试模式：直接打开面板
    debugOpenPanel().then(result => {
      sendResponse(result);
    });
    return true; // Keep channel open
  }
  else if (message.type === 'get_logs') {
    // Return current logs and clear them, so next time we only get new logs
    const logs = [...switchingSession.logBuffer];
    switchingSession.logBuffer = [];
    sendResponse({ logs: logs });
  }
  else if (message.type === 'log_from_content') {
    log('[Content Script]', message.message);
  }
  return true; // 保持通道（虽然大部分不需要）
});

async function debugOpenPanel() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) return { success: false, error: 'No active tab found.' };
    if (isInternalPage(activeTab.url)) return { success: false, error: 'Cannot run on internal chrome pages.' };

    // 强制开启会话
    resetSession();
    switchingSession.isActive = true;
    switchingSession.isDebug = true; // 标记为调试模式
    switchingSession.currentTabId = activeTab.id;
    switchingSession.targetIndex = 1; // 默认选中第二个
    switchingSession.panelVisible = true;

    // 直接显示面板，不带延迟
    console.log('Debug: Triggering showPanelInContent for tab', activeTab.id);
    return await showPanelInContent(activeTab.id);
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function handleAltRelease() {
  log('Handling Alt Release. Session active:', switchingSession.isActive);
  
  if (!switchingSession.isActive) {
    log('Session not active, ignoring Alt release.');
    return;
  }
  
  // 如果是调试模式，忽略 Alt 松开事件
  if (switchingSession.isDebug) {
    log('Debug mode active, but proceeding with Alt release for testing.');
    // return; // Allow release even in debug mode for diagnosis
  }

  // 清除 Timer（如果是快速切换）
  if (switchingSession.timer) {
    log('Clearing timer (fast switch detected)');
    clearTimeout(switchingSession.timer);
    switchingSession.timer = null;
  }

  // 计算最终目标
  const orderedTabs = await getOrderedTabs();
  if (orderedTabs.length > 0) {
    // 修正越界
    while (switchingSession.targetIndex >= orderedTabs.length) {
      switchingSession.targetIndex -= orderedTabs.length;
    }
    const targetTabId = orderedTabs[switchingSession.targetIndex].id;
    log('Target tab for switching:', targetTabId, 'Index:', switchingSession.targetIndex);
    
    // 如果面板开着，通知关闭
    if (switchingSession.panelVisible && switchingSession.currentTabId) {
      chrome.tabs.sendMessage(switchingSession.currentTabId, { type: 'hide_panel' }).catch(() => {});
    }

    finishSession(targetTabId);
  } else {
    log('No tabs found to switch to');
    resetSession();
  }
}

function finishSession(targetTabId) {
  log('Finishing session. Switching to tab:', targetTabId);
  resetSession(); // 先重置状态，防止后续事件干扰
  
  if (targetTabId) {
    // 立即执行切换
    chrome.tabs.get(targetTabId).then(tab => {
      // 如果目标在不同窗口，先聚焦窗口
      if (tab.windowId) {
        chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
      }
      return chrome.tabs.update(targetTabId, { active: true });
    }).catch(err => {
      console.error('Failed to switch tab:', err);
    });
  }
}

function resetSession() {
  // Preserve log buffer across sessions
  const existingLogs = switchingSession && switchingSession.logBuffer ? switchingSession.logBuffer : [];
  
  switchingSession = {
    isActive: false,
    timer: null,
    currentTabId: null,
    targetIndex: 0,
    panelVisible: false,
    isDebug: false,
    cachedTabs: null,
    logBuffer: existingLogs
  };
}

function isInternalPage(url) {
  if (!url) return false;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-devtools://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('file://') ||
    url.startsWith('view-source:')
  );
}

async function initializeTabHistory() {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const activeTab = tabs.find(tab => tab.active);
    if (activeTab && !isInternalPage(activeTab.url)) {
      recentTabHistory = [activeTab.id];
      saveHistory();
    }
  } catch (error) {}
}

// 立即初始化
setupEventListeners();
initialize();

function setupContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "set-as-tab-title",
      title: "设为标签页标题",
      contexts: ["selection"]
    });
  });
}

function handleContextMenuClick(info, tab) {
  if (info.menuItemId === "set-as-tab-title" && info.selectionText) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (title) => {
        document.title = title;
      },
      args: [info.selectionText]
    }).catch(err => {
      console.error('Failed to set tab title:', err);
    });
  }
}
