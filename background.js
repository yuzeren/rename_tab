// 最近使用的标签页历史记录
let recentTabHistory = [];
const MAX_HISTORY_SIZE = 10;
let isInitialized = false;

// 保持Service Worker活跃
function keepAlive() {
  // 定期发送消息保持活跃
  setInterval(() => {
    chrome.runtime.sendMessage({ type: 'keepAlive' }).catch(() => {
      // 忽略错误，只是保持活跃
    });
  }, 20000); // 每20秒一次
}

// 初始化函数
async function initialize() {
  if (isInitialized) return;
  
  try {
    console.log('Initializing recent tab switcher...');
    
    // 初始化标签页历史
    await initializeTabHistory();
    
    // 设置事件监听器
    setupEventListeners();
    
    isInitialized = true;
    console.log('Recent tab switcher initialized successfully');
    
    // 开始保持活跃
    keepAlive();
  } catch (error) {
    console.error('Failed to initialize:', error);
  }
}

// 设置事件监听器
function setupEventListeners() {
  // 监听标签页激活事件
  chrome.tabs.onActivated.addListener(handleTabActivated);
  
  // 监听标签页关闭事件
  chrome.tabs.onRemoved.addListener(handleTabRemoved);
  
  // 监听标签页更新事件（URL变化）
  chrome.tabs.onUpdated.addListener(handleTabUpdated);
  
  // 监听键盘命令
  chrome.commands.onCommand.addListener(handleCommand);
  
  // 监听扩展启动/安装
  chrome.runtime.onStartup.addListener(() => {
    console.log('Extension startup');
    initialize();
  });
  
  chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed/updated');
    initialize();
  });
}

// 处理标签页激活事件
async function handleTabActivated(activeInfo) {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    
    // 避免记录chrome内部页面
    if (isInternalPage(tab.url)) {
      return;
    }

    // 从历史中移除当前标签页（如果存在）
    recentTabHistory = recentTabHistory.filter(id => id !== activeInfo.tabId);
    
    // 将当前标签页添加到历史记录开头
    recentTabHistory.unshift(activeInfo.tabId);
    
    // 限制历史记录大小
    if (recentTabHistory.length > MAX_HISTORY_SIZE) {
      recentTabHistory = recentTabHistory.slice(0, MAX_HISTORY_SIZE);
    }
    
    console.log('Updated recent tab history:', recentTabHistory);
  } catch (error) {
    console.error('Error updating tab history:', error);
  }
}

// 处理标签页关闭事件
function handleTabRemoved(tabId) {
  recentTabHistory = recentTabHistory.filter(id => id !== tabId);
  console.log('Tab removed from history, current history:', recentTabHistory);
}

// 处理标签页更新事件
function handleTabUpdated(tabId, changeInfo, tab) {
  // 如果URL变化了，重新检查是否是内部页面
  if (changeInfo.url) {
    if (isInternalPage(changeInfo.url)) {
      // 从历史中移除内部页面
      recentTabHistory = recentTabHistory.filter(id => id !== tabId);
      console.log('Removed internal page from history:', tabId);
    }
  }
}

// 处理键盘命令
function handleCommand(command) {
  console.log('Command received:', command);
  
  if (command === 'switch-recent-tabs') {
    switchBetweenRecentTabs();
  }
}

// 检查是否为内部页面
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

// 清除标签页历史
function clearTabHistory() {
  recentTabHistory = [];
  console.log('Tab history cleared');
}

// 在最近使用的标签页之间切换
async function switchBetweenRecentTabs() {
  try {
    console.log('Current tab history:', recentTabHistory);
    
    if (recentTabHistory.length < 2) {
      console.log('Not enough tabs in history for switching');
      return;
    }
    
    // 获取当前活动标签页
    const currentTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTabId = currentTabs[0]?.id;
    
    if (!currentTabId) {
      console.error('Cannot get current tab ID');
      return;
    }
    
    // 找到最近使用的另一个标签页
    let targetTabId = null;
    
    if (recentTabHistory[0] === currentTabId && recentTabHistory.length >= 2) {
      // 如果当前标签页是最近使用的，切换到第二个最近使用的
      targetTabId = recentTabHistory[1];
    } else {
      // 否则切换到最近使用的标签页
      targetTabId = recentTabHistory[0];
    }
    
    if (targetTabId) {
      // 检查目标标签页是否存在
      try {
        const targetTab = await chrome.tabs.get(targetTabId);
        if (targetTab && !targetTab.discarded) {
          // 激活目标标签页
          await chrome.tabs.update(targetTabId, { active: true });
          console.log('Switched to tab:', targetTabId);
        } else {
          console.log('Target tab is discarded or invalid, removing from history');
          // 从历史记录中移除无效的标签页
          recentTabHistory = recentTabHistory.filter(id => id !== targetTabId);
        }
      } catch (error) {
        console.error('Target tab no longer exists:', error);
        // 从历史记录中移除不存在的标签页
        recentTabHistory = recentTabHistory.filter(id => id !== targetTabId);
      }
    }
  } catch (error) {
    console.error('Error switching between recent tabs:', error);
  }
}

// 初始化标签页历史
async function initializeTabHistory() {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const activeTab = tabs.find(tab => tab.active);
    
    if (activeTab && !isInternalPage(activeTab.url)) {
      recentTabHistory = [activeTab.id];
      console.log('Initialized tab history with active tab:', recentTabHistory);
    } else {
      console.log('No valid active tab found for initialization');
    }
  } catch (error) {
    console.error('Error initializing tab history:', error);
  }
}

// 添加定期健康检查
function healthCheck() {
  setInterval(async () => {
    try {
      // 检查事件监听器是否仍然有效
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log('Health check passed, current active tab:', tabs[0]?.id);
    } catch (error) {
      console.error('Health check failed:', error);
      // 如果健康检查失败，重新初始化
      isInitialized = false;
      initialize();
    }
  }, 30000); // 每30秒检查一次
}

// 监听来自内容脚本的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'keepAlive') {
    // 保持活跃响应
    sendResponse({ status: 'alive' });
  } else if (message.type === 'getTabHistory') {
    // 返回标签页历史
    sendResponse({ history: recentTabHistory });
  } else if (message.type === 'clearHistory') {
    // 清除历史记录
    clearTabHistory();
    sendResponse({ status: 'history cleared' });
  } else if (message.type === 'testCommand' && message.command === 'switch-recent-tabs') {
    // 测试命令
    switchBetweenRecentTabs();
    sendResponse({ status: 'command executed' });
  }
  return true;
});

// 立即初始化
initialize();

// 启动健康检查
healthCheck();

// 导出函数供测试使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    switchBetweenRecentTabs,
    isInternalPage,
    recentTabHistory
  };
}