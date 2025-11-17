// 最近使用的标签页历史记录
let recentTabHistory = [];
const MAX_HISTORY_SIZE = 10;

// 监听标签页激活事件，更新最近使用的标签页历史
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    
    // 避免记录chrome内部页面
    if (tab.url && (
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('chrome-devtools://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('edge://') ||
      tab.url.startsWith('about:')
    )) {
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
});

// 监听标签页关闭事件，从历史记录中移除
chrome.tabs.onRemoved.addListener((tabId) => {
  recentTabHistory = recentTabHistory.filter(id => id !== tabId);
  console.log('Tab removed from history, current history:', recentTabHistory);
});

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
        if (targetTab) {
          // 激活目标标签页
          await chrome.tabs.update(targetTabId, { active: true });
          console.log('Switched to tab:', targetTabId);
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

// 监听键盘命令
chrome.commands.onCommand.addListener((command) => {
  console.log('Command received:', command);
  
  if (command === 'switch-recent-tabs') {
    switchBetweenRecentTabs();
  }
});

// 初始化时获取当前窗口的所有标签页，建立初始历史记录
chrome.runtime.onStartup.addListener(() => {
  initializeTabHistory();
});

chrome.runtime.onInstalled.addListener(() => {
  initializeTabHistory();
});

async function initializeTabHistory() {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const activeTab = tabs.find(tab => tab.active);
    
    if (activeTab) {
      recentTabHistory = [activeTab.id];
      console.log('Initialized tab history with active tab:', recentTabHistory);
    }
  } catch (error) {
    console.error('Error initializing tab history:', error);
  }
}