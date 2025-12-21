document.addEventListener('DOMContentLoaded', function() {
  const titleInput = document.getElementById('titleInput');
  const changeButton = document.getElementById('changeTitle');
  const restoreTitleButton = document.getElementById('restoreTitle');
  const faviconInput = document.getElementById('faviconInput');
  const changeFaviconButton = document.getElementById('changeFavicon');
  const restoreFaviconButton = document.getElementById('restoreFavicon');
  const statusElement = document.getElementById('status');
  const emojiElements = document.querySelectorAll('.emoji');
  const shortcutHintElement = document.getElementById('shortcutHint');
  const debugSection = document.getElementById('debugSection');
  
  // Launcher Mode setting
  const launcherModeCheckbox = document.getElementById('launcherMode');
  if (launcherModeCheckbox) {
    // Load setting
    chrome.storage.local.get(['launcherMode'], (result) => {
      launcherModeCheckbox.checked = result.launcherMode || false;
    });

    // Save setting
    launcherModeCheckbox.addEventListener('change', () => {
      chrome.storage.local.set({ launcherMode: launcherModeCheckbox.checked });
    });
  }
  
  // 连续点击3次显示调试工具
  let clickCount = 0;
  let lastClickTime = 0;
  
  document.body.addEventListener('click', (e) => {
    // 忽略按钮和输入框的点击，避免误触
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.closest('.emoji')) {
      return;
    }

    const now = Date.now();
    // 如果两次点击间隔超过500ms，重置计数
    if (now - lastClickTime > 500) {
      clickCount = 0;
    }
    
    clickCount++;
    lastClickTime = now;

    if (clickCount >= 3) {
      if (debugSection) {
        const isHidden = debugSection.style.display === 'none';
        debugSection.style.display = isHidden ? 'block' : 'none';
        // 如果显示出来，可以滚动到底部让用户看到
        if (isHidden) {
          debugSection.scrollIntoView({ behavior: 'smooth' });
        }
      }
      clickCount = 0;
    }
  });
  
  let selectedEmoji = null;

  // 面板打开时，读取当前标签页标题并填充输入框，同时处理受限页面
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const tab = tabs && tabs[0];
      const url = (tab && tab.url) || '';
      const currentTitle = (tab && tab.title) || '';
      if (currentTitle) {
        titleInput.value = currentTitle;
        // 自动聚焦并全选文本，方便用户直接修改
        titleInput.focus();
        titleInput.select();
      }
      // 受限页面判断：chrome://、chrome-devtools://、chrome-extension://、edge://、about:
      if (
        url.startsWith('chrome://') ||
        url.startsWith('chrome-devtools://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('edge://') ||
        url.startsWith('about:')
      ) {
        statusElement.textContent = '当前页面为受限页面，无法修改标题或图标';
        statusElement.style.display = 'block';
        statusElement.className = 'status error';
        changeButton.disabled = true;
        changeFaviconButton.disabled = true;
        if (restoreTitleButton) restoreTitleButton.disabled = true;
        if (restoreFaviconButton) restoreFaviconButton.disabled = true;
      }
    });
  }

  // 当用户点击修改标题按钮时
  changeButton.addEventListener('click', function() {
    const newTitle = titleInput.value.trim();
    console.log('Change button clicked. New Title:', newTitle);
    if (newTitle) {
      // 使用chrome.scripting API在当前标签页执行脚本
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        console.log('Tabs query result:', tabs);
        const url = (tabs[0] && tabs[0].url) || '';
        if (
          url.startsWith('chrome://') ||
          url.startsWith('chrome-devtools://') ||
          url.startsWith('chrome-extension://') ||
          url.startsWith('edge://') ||
          url.startsWith('about:')
        ) {
          console.log('Restricted URL:', url);
          statusElement.textContent = '当前页面受限（chrome://），无法修改标题';
          statusElement.style.display = 'block';
          statusElement.className = 'status error';
          return;
        }
        console.log('Executing script on tab:', tabs[0].id);
        chrome.scripting.executeScript({
          target: {tabId: tabs[0].id},
          func: changeTabTitle,
          args: [newTitle]
        }).then(() => {
          console.log('Script execution successful');
          // 保存到 storage 实现持久化
          chrome.storage.local.get([url], (result) => {
            const data = result[url] || {};
            data.title = newTitle;
            chrome.storage.local.set({ [url]: data });
          });

          // 显示成功状态
          statusElement.textContent = '标题已修改！';
          statusElement.style.display = 'block';
          statusElement.className = 'status';
        }).catch(err => {
          console.error('Script execution failed:', err);
          // 处理 ExtensionsSettings 等策略导致的注入失败
          if (err.message.includes('ExtensionsSettings')) {
            statusElement.textContent = '企业策略限制，无法在此页面执行脚本';
          } else {
            statusElement.textContent = '脚本注入失败：' + err.message;
          }
          statusElement.style.display = 'block';
          statusElement.className = 'status error';
          // 防止未捕获异常继续冒泡
          return;
        });
      });
    } else {
        console.log('New title is empty');
    }
  });

  // 为每个emoji添加点击事件
  emojiElements.forEach(emoji => {
    emoji.addEventListener('click', function() {
      // 移除之前选中的emoji的选中状态
      emojiElements.forEach(e => e.classList.remove('selected'));
      // 添加当前emoji的选中状态
      this.classList.add('selected');
      selectedEmoji = this.getAttribute('data-emoji');
      
      // 直接触发表单提交（模拟点击修改按钮）
      changeFaviconButton.click();
    });
  });

  // 当用户点击修改图标按钮时
  changeFaviconButton.addEventListener('click', function() {
    const inputValue = faviconInput.value.trim();

    // 判定输入是否是URL（支持 http/https 以及 data:image）
    const isLikelyUrl = (str) => {
      if (!str) return false;
      if (str.startsWith('data:image')) return true;
      try {
        const u = new URL(str);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch (e) {
        return false;
      }
    };

    // 根据输入决定使用URL或emoji文本
    let faviconUrl = '';
    let emojiText = '';
    if (isLikelyUrl(inputValue)) {
      faviconUrl = inputValue;
    } else if (inputValue) {
      // 输入为非URL文本，按emoji处理（支持自定义emoji）
      emojiText = inputValue;
    } else if (selectedEmoji) {
      emojiText = selectedEmoji;
    }

    // 使用URL或选中的/输入的emoji
    if (faviconUrl || emojiText) {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const url = (tabs[0] && tabs[0].url) || '';
        if (
          url.startsWith('chrome://') ||
          url.startsWith('chrome-devtools://') ||
          url.startsWith('chrome-extension://') ||
          url.startsWith('edge://') ||
          url.startsWith('about:')
        ) {
          statusElement.textContent = '当前页面受限（chrome://），无法修改图标';
          statusElement.style.display = 'block';
          statusElement.className = 'status error';
          return;
        }
        chrome.scripting.executeScript({
          target: {tabId: tabs[0].id},
          func: changeTabFavicon,
          args: [faviconUrl, emojiText]
        }).then(() => {
          // 显示成功状态
          statusElement.textContent = '图标已修改！';
          statusElement.style.display = 'block';
          statusElement.className = 'status';
        }).catch(err => {
          // 处理 ExtensionsSettings 等策略导致的注入失败
          if (err.message.includes('ExtensionsSettings')) {
            statusElement.textContent = '企业策略限制，无法在此页面执行脚本';
          } else {
            statusElement.textContent = '脚本注入失败：' + err.message;
          }
          statusElement.style.display = 'block';
          statusElement.className = 'status error';
          // 防止未捕获异常继续冒泡
          return;
        });
      });
    }
  });

  // 按下Enter键也可以提交标题修改
  titleInput.addEventListener('keydown', function(e) {
    console.log('Title Keydown:', e.key, 'isComposing:', e.isComposing, 'Value:', titleInput.value);
    if (e.key === 'Enter' && !e.isComposing) {
      console.log('Enter pressed, triggering click');
      e.preventDefault();
      changeButton.click();
    }
  });

  // 按下Enter键也可以提交图标修改
  faviconInput.addEventListener('keydown', function(e) {
    console.log('Favicon Keydown:', e.key, 'isComposing:', e.isComposing, 'Value:', faviconInput.value);
    if (e.key === 'Enter' && !e.isComposing) {
      console.log('Enter pressed (favicon), triggering click');
      e.preventDefault();
      changeFaviconButton.click();
    }
  });

  // 恢复默认标题
  restoreTitleButton.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const url = (tabs[0] && tabs[0].url) || '';
      if (
        url.startsWith('chrome://') ||
        url.startsWith('chrome-devtools://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('edge://') ||
        url.startsWith('about:')
      ) {
        statusElement.textContent = '当前页面受限（chrome://），无法恢复标题';
        statusElement.style.display = 'block';
        statusElement.className = 'status error';
        return;
      }
      chrome.scripting.executeScript({
        target: {tabId: tabs[0].id},
        func: restoreDefaultTitle
      }).then(() => {
        // 从 storage 中移除标题设置
        chrome.storage.local.get([url], (result) => {
          const data = result[url];
          if (data) {
            delete data.title;
            if (Object.keys(data).length === 0) {
              chrome.storage.local.remove(url);
            } else {
              chrome.storage.local.set({ [url]: data });
            }
          }
        });

        // 显示成功状态
        statusElement.textContent = '已恢复默认标题！';
        statusElement.style.display = 'block';
        statusElement.className = 'status';
      }).catch(err => {
        // 处理 ExtensionsSettings 等策略导致的注入失败
        if (err.message.includes('ExtensionsSettings')) {
          statusElement.textContent = '企业策略限制，无法在此页面执行脚本';
        } else {
          statusElement.textContent = '脚本注入失败：' + err.message;
        }
        statusElement.style.display = 'block';
        statusElement.className = 'status error';
      });
    });
  });

  // 恢复默认图标
  restoreFaviconButton.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const url = (tabs[0] && tabs[0].url) || '';
      if (
        url.startsWith('chrome://') ||
        url.startsWith('chrome-devtools://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('edge://') ||
        url.startsWith('about:')
      ) {
        statusElement.textContent = '当前页面受限（chrome://），无法恢复图标';
        statusElement.style.display = 'block';
        statusElement.className = 'status error';
        return;
      }
      chrome.scripting.executeScript({
        target: {tabId: tabs[0].id},
        func: restoreDefaultFavicon
      }).then(() => {
        // 从 storage 中移除图标设置
        chrome.storage.local.get([url], (result) => {
          const data = result[url];
          if (data) {
            delete data.faviconUrl;
            delete data.emojiText;
            if (Object.keys(data).length === 0) {
              chrome.storage.local.remove(url);
            } else {
              chrome.storage.local.set({ [url]: data });
            }
          }
        });

        // 显示成功状态
        statusElement.textContent = '已恢复默认图标！';
        statusElement.style.display = 'block';
        statusElement.className = 'status';
      }).catch(err => {
        // 处理 ExtensionsSettings 等策略导致的注入失败
        if (err.message.includes('ExtensionsSettings')) {
          statusElement.textContent = '企业策略限制，无法在此页面执行脚本';
        } else {
          statusElement.textContent = '脚本注入失败：' + err.message;
        }
        statusElement.style.display = 'block';
        statusElement.className = 'status error';
      });
    });
  });

  // 调试按钮：打开切换面板
  const debugOpenPanelBtn = document.getElementById('debugOpenPanel');
  if (debugOpenPanelBtn) {
    debugOpenPanelBtn.addEventListener('click', function() {
      // 清除之前的状态
      statusElement.style.display = 'none';
      statusElement.textContent = '';
      
      const timeoutId = setTimeout(() => {
        statusElement.textContent = 'Error: Request timeout. Background script may be unresponsive.';
        statusElement.style.display = 'block';
        statusElement.className = 'status error';
      }, 5000);

      chrome.runtime.sendMessage({ type: 'debug_open_panel' }, (response) => {
        clearTimeout(timeoutId);
        
        // 检查是否有运行时错误
        if (chrome.runtime.lastError) {
          statusElement.textContent = 'Error: ' + chrome.runtime.lastError.message;
          statusElement.style.display = 'block';
          statusElement.className = 'status error';
          return;
        }

        // 检查业务逻辑错误
        if (response && response.success) {
           // 成功则关闭当前的 popup
           window.close();
        } else {
           // 失败则显示错误信息
           statusElement.textContent = 'Debug Error: ' + (response ? response.error : 'Unknown error');
           statusElement.style.display = 'block';
           statusElement.className = 'status error';
        }
      });
    });
  }

  // 复制调试日志按钮
  const copyDebugLogsBtn = document.getElementById('copyDebugLogs');
  if (copyDebugLogsBtn) {
    copyDebugLogsBtn.addEventListener('click', function() {
      statusElement.style.display = 'none';
      statusElement.textContent = '';

      chrome.runtime.sendMessage({ type: 'get_logs' }, (response) => {
        if (chrome.runtime.lastError) {
          statusElement.textContent = 'Error: ' + chrome.runtime.lastError.message;
          statusElement.style.display = 'block';
          statusElement.className = 'status error';
          return;
        }

        if (response && response.logs) {
          const logsText = response.logs.join('\n');
          navigator.clipboard.writeText(logsText).then(() => {
            statusElement.textContent = '日志已复制到剪贴板！';
            statusElement.style.display = 'block';
            statusElement.className = 'status';
          }).catch(err => {
            statusElement.textContent = '复制失败: ' + err;
            statusElement.style.display = 'block';
            statusElement.className = 'status error';
          });
        } else {
          statusElement.textContent = '没有可用的日志';
          statusElement.style.display = 'block';
          statusElement.className = 'status info';
        }
      });
    });
  }

  // 自动聚焦到标题输入框
  titleInput.focus();

  // 显示快捷键提示
  const showShortcutHint = (key) => {
    if (!shortcutHintElement) return;
    shortcutHintElement.textContent = `最近标签页切换快捷键：${key}（可在扩展快捷键中更改）`;
    shortcutHintElement.style.display = 'block';
  };

  if (typeof chrome !== 'undefined' && chrome.commands && typeof chrome.commands.getAll === 'function') {
    try {
      chrome.commands.getAll((commands) => {
        const cmd = (commands || []).find(c => c.name === 'switch-recent-tabs');
        const key = (cmd && cmd.shortcut) ? cmd.shortcut : 'Alt+Q';
        showShortcutHint(key);
      });
    } catch (e) {
      showShortcutHint('Alt+Q');
    }
  } else {
    showShortcutHint('Alt+Q');
  }
});

// 在标签页中执行的函数 - 修改标题
function changeTabTitle(newTitle) {
  // 发送日志到后台
  try {
    chrome.runtime.sendMessage({
      type: 'log_from_content',
      message: 'Manual changeTabTitle triggered: ' + newTitle
    }).catch(() => {});
  } catch (e) {}

  console.log('Tab PowerToy: Changing title to', newTitle);

  // 如果存在 content.js 创建的观察者，先断开连接，防止它将标题改回去
  if (window.titleObserver) {
    window.titleObserver.disconnect();
  }

  // 保存原始标题，用于恢复
  if (typeof window.originalTitle === 'undefined') {
    window.originalTitle = document.title;
    console.log('Tab PowerToy: Saved original title:', window.originalTitle);
  } else {
    console.log('Tab PowerToy: Original title already saved:', window.originalTitle);
  }
  document.title = newTitle;
}

// 在标签页中执行的函数 - 修改favicon
function changeTabFavicon(faviconUrl, emojiText) {
  // 如果存在 content.js 创建的观察者，先断开连接，防止它将图标改回去
  if (window.faviconObserver) {
    window.faviconObserver.disconnect();
  }
  // 清除 content.js 的定时器
  if (window.faviconTimer) {
      clearInterval(window.faviconTimer);
  }

  // 保存原始favicon链接，用于恢复
  if (!window.originalFavicon) {
    const existingFavicons = document.querySelectorAll('link[rel*="icon"]');
    if (existingFavicons.length > 0) {
      window.originalFavicon = existingFavicons[0].href;
    }
  }

  // 移除现有的favicon
  const existingFavicons = document.querySelectorAll('link[rel*="icon"]');
  existingFavicons.forEach(favicon => {
    favicon.parentNode.removeChild(favicon);
  });

  // 创建新的favicon元素

  const link = document.createElement('link');
  link.rel = 'icon';
  
  if (faviconUrl) {
    // 如果提供了URL，直接使用
    link.href = faviconUrl;
    document.head.appendChild(link);
  } else if (emojiText) {
    // 使用emoji创建favicon
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    
    // 设置背景为透明
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 绘制emoji
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emojiText, canvas.width / 2, canvas.height / 2);
    
    // 转换为图片URL
    link.href = canvas.toDataURL('image/png');
    document.head.appendChild(link);
  }
}

// 恢复默认标题
function restoreDefaultTitle() {
  // 发送日志到后台
  try {
    chrome.runtime.sendMessage({
      type: 'log_from_content',
      message: 'Manual restoreDefaultTitle triggered. Current: ' + document.title + ', Original: ' + window.originalTitle
    }).catch(() => {});
  } catch (e) {}

  console.log('Tab PowerToy: Restoring default title. Current:', document.title, 'Original:', window.originalTitle);

  // 停止观察，防止它将标题改回去
  if (window.titleObserver) {
    window.titleObserver.disconnect();
    window.titleObserver = null;
  }

  // 如果保存了原始标题，则恢复
  if (typeof window.originalTitle !== 'undefined') {
    document.title = window.originalTitle;
    console.log('Tab PowerToy: Restored to original title');
  } else {
    // 尝试从页面中获取原始标题
    const metaTitleElement = document.querySelector('meta[property="og:title"]');
    if (metaTitleElement) {
      document.title = metaTitleElement.getAttribute('content');
      console.log('Tab PowerToy: Restored from meta og:title');
    } else {
      console.log('Tab PowerToy: No original title found');
    }
  }
}

// 恢复默认图标
function restoreDefaultFavicon() {
  // 移除当前的favicon
  const existingFavicons = document.querySelectorAll('link[rel*="icon"]');
  existingFavicons.forEach(favicon => {
    favicon.parentNode.removeChild(favicon);
  });

  // 如果保存了原始favicon，则恢复
  if (window.originalFavicon) {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = window.originalFavicon;
    document.head.appendChild(link);
  }
}