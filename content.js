// 内容脚本 - 注入调试工具
(function() {
  'use strict';
  
  // 只在需要时注入调试工具
  if (window.location.href.includes('debug=tabswitcher')) {
    // 创建调试面板
    const debugPanel = document.createElement('div');
    debugPanel.id = 'tab-switcher-debug';
    debugPanel.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 15px;
      border-radius: 5px;
      font-family: monospace;
      font-size: 12px;
      z-index: 10000;
      max-width: 300px;
      max-height: 400px;
      overflow-y: auto;
    `;
    
    debugPanel.innerHTML = `
      <h3>Tab Switcher Debug Panel</h3>
      <button id="check-status">Check Status</button>
      <button id="test-switch">Test Switch</button>
      <button id="clear-history">Clear History</button>
      <button id="close-panel" style="float: right;">×</button>
      <div id="debug-output" style="margin-top: 10px; font-size: 11px;"></div>
    `;
    
    document.body.appendChild(debugPanel);
    
    // 添加事件监听器
    document.getElementById('close-panel').onclick = () => debugPanel.remove();
    
    document.getElementById('check-status').onclick = async () => {
      const output = document.getElementById('debug-output');
      try {
        const response = await chrome.runtime.sendMessage({ type: 'getTabHistory' });
        output.innerHTML = `<strong>Status Check:</strong><br>History: ${JSON.stringify(response?.history || [], null, 2)}<br>Time: ${new Date().toLocaleTimeString()}`;
      } catch (error) {
        output.innerHTML = `<strong>Error:</strong> ${error.message}`;
      }
    };
    
    document.getElementById('test-switch').onclick = async () => {
      const output = document.getElementById('debug-output');
      try {
        await chrome.runtime.sendMessage({ type: 'testCommand', command: 'switch-recent-tabs' });
        output.innerHTML = `<strong>Test Switch:</strong> Command sent successfully<br>Time: ${new Date().toLocaleTimeString()}`;
      } catch (error) {
        output.innerHTML = `<strong>Error:</strong> ${error.message}`;
      }
    };
    
    document.getElementById('clear-history').onclick = async () => {
      const output = document.getElementById('debug-output');
      try {
        await chrome.runtime.sendMessage({ type: 'clearHistory' });
        output.innerHTML = `<strong>History:</strong> Cleared successfully<br>Time: ${new Date().toLocaleTimeString()}`;
      } catch (error) {
        output.innerHTML = `<strong>Error:</strong> ${error.message}`;
      }
    };
    
    console.log('Tab Switcher Debug Panel loaded. Use the buttons to test functionality.');
  }
})();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'watchAltRelease') {
    let done = false;
    const handler = (e) => {
      if (e.key === 'Alt') {
        if (!done) {
          done = true;
          try {
            chrome.runtime.sendMessage({ type: 'altReleased' });
          } catch (err) {}
          window.removeEventListener('keyup', handler, true);
        }
      }
    };
    window.addEventListener('keyup', handler, true);
    setTimeout(() => {
      if (!done) {
        window.removeEventListener('keyup', handler, true);
      }
    }, 1000);
    sendResponse({ status: 'watching' });
    return true;
  }
});

// 持久化逻辑：页面加载时应用保存的标题和图标
(function() {
  // 只在顶层 frame 执行
  if (window.top !== window.self) return;

  const currentUrl = window.location.href;

  // 安全发送消息
  function safeSendMessage(message) {
    if (!chrome.runtime?.id) {
      // 扩展上下文失效，静默失败
      return Promise.reject(new Error('Extension context invalidated'));
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

  function applyTitle(newTitle) {
    logToBackground('Applying title:', newTitle);
    // 保存原始标题
    if (!window.originalTitle) {
      window.originalTitle = document.title;
    }

    if (document.title !== newTitle) {
      document.title = newTitle;
    }
    
    // 使用 MutationObserver 强制保持标题（可选，防止页面JS改回去）
    // 注意：这可能会与某些应用的逻辑冲突，但为了"持久化"通常是必要的
    if (!window.titleObserver) {
      const target = document.querySelector('title');
      if (target) {
        window.titleObserver = new MutationObserver(() => {
          if (document.title !== newTitle) {
            logToBackground('Title changed by page, reverting...');
            // 暂时断开观察以避免循环
            window.titleObserver.disconnect();
            document.title = newTitle;
            // 重新观察
            window.titleObserver.observe(target, { childList: true });
          }
        });
        window.titleObserver.observe(target, { childList: true });
      }
    }
  }

  function applyFavicon(faviconUrl, emojiText) {
      logToBackground('Applying favicon:', { faviconUrl, emojiText });
      // 保存原始favicon
      if (!window.originalFavicon) {
        const existingFavicons = document.querySelectorAll('link[rel*="icon"]');
        if (existingFavicons.length > 0) {
          window.originalFavicon = existingFavicons[0].href;
        }
      }

      const updateFavicon = () => {
        // 标记我们自己的 favicon，防止被自己删除或误判
        const MY_FAVICON_CLASS = 'tab-power-toy-favicon';
        
        // 查找是否已经存在我们的 favicon
        let currentMyFavicon = document.querySelector(`link.${MY_FAVICON_CLASS}`);
        
        // 移除其他所有 icon link
        const allIcons = document.querySelectorAll('link[rel*="icon"]');
        let needRecreate = true;

        allIcons.forEach(icon => {
          if (icon.classList.contains(MY_FAVICON_CLASS)) {
             // 如果是我们自己的，检查是否是 head 的最后一个子元素
             // 某些网站会通过 appendChild 添加 icon，导致我们在前面被覆盖
             // 所以如果我们在，但不是最后一个，最好也重新插入到最后
             if (icon === document.head.lastElementChild) {
                 needRecreate = false;
             } else {
                 // 不是最后一个，移除它，准备重新创建（或者直接移动它）
                 logToBackground('My favicon is not last, removing to recreate');
                 icon.parentNode.removeChild(icon);
                 currentMyFavicon = null; // 标记为已移除
             }
          } else {
             // 别人的 icon，移除
             logToBackground('Removing other favicon:', icon.href);
             icon.parentNode.removeChild(icon);
          }
        });

        // 如果我们的被移除了，或者需要更新，则重新创建
        if (needRecreate || !currentMyFavicon) {
            logToBackground('Creating new favicon element');
            const link = document.createElement('link');
            link.rel = 'icon';
            link.classList.add(MY_FAVICON_CLASS);

            if (faviconUrl) {
                link.href = faviconUrl;
            } else if (emojiText) {
                const canvas = document.createElement('canvas');
                canvas.width = 32;
                canvas.height = 32;
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.font = '24px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(emojiText, canvas.width / 2, canvas.height / 2);
                link.href = canvas.toDataURL('image/png');
            }
            
            document.head.appendChild(link);
        }
      };

      // 立即执行一次
      updateFavicon();

      // 使用 MutationObserver 监听 head 变化，防止页面 JS 覆盖
      if (!window.faviconObserver) {
          const target = document.head;
          if (target) {
              window.faviconObserver = new MutationObserver((mutations) => {
                  let shouldUpdate = false;
                  for (const mutation of mutations) {
                      if (mutation.type === 'childList') {
                          // 检查是否有新的 link rel=icon 被添加
                          mutation.addedNodes.forEach(node => {
                              if (node.tagName === 'LINK' && 
                                  node.rel && node.rel.includes('icon') && 
                                  !node.classList.contains('tab-power-toy-favicon')) {
                                  logToBackground('New favicon added by page:', node.href);
                                  shouldUpdate = true;
                              }
                          });
                      } else if (mutation.type === 'attributes') {
                          // 检查是否有现有 link 的 href 被修改
                          const node = mutation.target;
                          if (node.tagName === 'LINK' && 
                              node.rel && node.rel.includes('icon') && 
                              !node.classList.contains('tab-power-toy-favicon')) {
                              logToBackground('Favicon attribute changed by page:', node.href);
                              shouldUpdate = true;
                          }
                      }
                  }
                  
                  if (shouldUpdate) {
                      logToBackground('Observer detected change, updating favicon...');
                      // 暂时断开以避免死循环（虽然我们检查了 class，但为了安全）
                      window.faviconObserver.disconnect();
                      updateFavicon();
                      window.faviconObserver.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'rel'] });
                  }
              });
              window.faviconObserver.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'rel'] });
          }
      }
      
      // 定时检查兜底（防止 Observer 漏网或页面脚本在 Observer 之后执行）
      if (!window.faviconTimer) {
          window.faviconTimer = setInterval(() => {
              // 检查当前显示的 icon 是否正确
              const icons = document.querySelectorAll('link[rel*="icon"]');
              let isCorrect = false;
              if (icons.length === 1 && icons[0].classList.contains('tab-power-toy-favicon')) {
                  // 只有一个 icon 且是我们的，还要检查是否在最后（可选，但推荐）
                  // isCorrect = true; 
                  // 简化判断：只要存在且没有别人的
                  isCorrect = true;
              }
              
              if (!isCorrect) {
                  logToBackground('Timer check failed, updating favicon...');
                  if (window.faviconObserver) window.faviconObserver.disconnect();
                  updateFavicon();
                  if (window.faviconObserver) {
                      const target = document.head;
                      window.faviconObserver.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'rel'] });
                  }
              }
          }, 1000); // 每秒检查一次
      }
  }

  function restoreTitle() {
    logToBackground('Restoring default title');
    // 停止观察
    if (window.titleObserver) {
      window.titleObserver.disconnect();
      window.titleObserver = null;
    }
    
    // 恢复标题
    if (window.originalTitle) {
      document.title = window.originalTitle;
    } else {
      // 尝试从页面中获取原始标题
      const metaTitleElement = document.querySelector('meta[property="og:title"]');
      if (metaTitleElement) {
        document.title = metaTitleElement.getAttribute('content');
      }
    }
  }

  function restoreFavicon() {
    logToBackground('Restoring default favicon');
    // 停止观察
    if (window.faviconObserver) {
      window.faviconObserver.disconnect();
      window.faviconObserver = null;
    }
    // 停止定时器
    if (window.faviconTimer) {
        clearInterval(window.faviconTimer);
        window.faviconTimer = null;
    }

    // 移除我们的 favicon
    const myFavicons = document.querySelectorAll('link.tab-power-toy-favicon');
    myFavicons.forEach(el => el.parentNode.removeChild(el));

    // 恢复原始 favicon
    if (window.originalFavicon) {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = window.originalFavicon;
      document.head.appendChild(link);
    }
  }

  // 检查 storage 并应用（支持模糊匹配）
  const checkAndApply = () => {
      logToBackground('Checking storage for URL:', currentUrl);
      chrome.storage.local.get(null, (result) => {
        // 1. 尝试精确匹配
        let data = result[currentUrl];
        
        // 2. 如果没有，尝试忽略 Query 参数匹配
        if (!data) {
            const currentUrlNoQuery = currentUrl.split('?')[0];
            const currentUrlNoHash = currentUrl.split('#')[0];
            
            // 遍历所有 key 寻找匹配
            for (const key in result) {
                if (key === currentUrlNoQuery || key.split('?')[0] === currentUrlNoQuery) {
                    data = result[key];
                    logToBackground('Fuzzy match found (NoQuery):', key);
                    break;
                }
                if (key === currentUrlNoHash || key.split('#')[0] === currentUrlNoHash) {
                    data = result[key];
                    logToBackground('Fuzzy match found (NoHash):', key);
                    break;
                }
            }
        }

        if (data) {
          logToBackground('Applied data from storage:', data);
          if (data.title) {
            applyTitle(data.title);
          } else {
            // 如果数据存在但没有 title（可能被单独删除了），尝试恢复
            restoreTitle();
          }

          if (data.faviconUrl || data.emojiText) {
            applyFavicon(data.faviconUrl, data.emojiText);
          } else {
             // 同理，如果 favicon 配置没了，恢复默认
             restoreFavicon();
          }
        } else {
            logToBackground('No data found in storage for this URL, restoring defaults');
            // 如果完全没有数据了，说明用户点击了恢复默认（且清除了所有设置）
            restoreTitle();
            restoreFavicon();
        }
      });
  };

  checkAndApply();

  // 在页面加载的不同阶段再次强制检查，防止被覆盖
  window.addEventListener('load', checkAndApply);
  document.addEventListener('DOMContentLoaded', checkAndApply);
  
  // 监听 storage 变化（支持多窗口/标签页同步更新）
  try {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      // 检查上下文有效性
      if (!chrome.runtime?.id) return;
      
      if (namespace === 'local') {
          // 这里的变更可能是针对某个 URL 的，我们需要判断这个 URL 是否匹配当前页面
          // 简单起见，重新运行一次 checkAndApply
          checkAndApply();
      }
    });
  } catch (e) {
    // 忽略监听器添加失败
  }
})();
