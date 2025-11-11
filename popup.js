document.addEventListener('DOMContentLoaded', function() {
  const titleInput = document.getElementById('titleInput');
  const changeButton = document.getElementById('changeTitle');
  const restoreTitleButton = document.getElementById('restoreTitle');
  const faviconInput = document.getElementById('faviconInput');
  const changeFaviconButton = document.getElementById('changeFavicon');
  const restoreFaviconButton = document.getElementById('restoreFavicon');
  const statusElement = document.getElementById('status');
  const emojiElements = document.querySelectorAll('.emoji');
  
  let selectedEmoji = null;

  // 面板打开时，读取当前标签页标题并填充输入框，同时处理受限页面
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const tab = tabs && tabs[0];
      const url = (tab && tab.url) || '';
      const currentTitle = (tab && tab.title) || '';
      if (currentTitle) {
        titleInput.value = currentTitle;
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
        statusElement.style.color = '#d93025';
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
    if (newTitle) {
      // 使用chrome.scripting API在当前标签页执行脚本
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const url = (tabs[0] && tabs[0].url) || '';
        if (
          url.startsWith('chrome://') ||
          url.startsWith('chrome-devtools://') ||
          url.startsWith('chrome-extension://') ||
          url.startsWith('edge://') ||
          url.startsWith('about:')
        ) {
          statusElement.textContent = '当前页面受限（chrome://），无法修改标题';
          statusElement.style.display = 'block';
          statusElement.style.color = '#d93025';
          return;
        }
        chrome.scripting.executeScript({
          target: {tabId: tabs[0].id},
          func: changeTabTitle,
          args: [newTitle]
        });
        
        // 显示成功状态
        statusElement.textContent = '标题已修改！';
        statusElement.style.display = 'block';
        setTimeout(() => {
          window.close(); // 2秒后关闭弹窗
        }, 2000);
      });
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
          statusElement.style.color = '#d93025';
          return;
        }
        chrome.scripting.executeScript({
          target: {tabId: tabs[0].id},
          func: changeTabFavicon,
          args: [faviconUrl, emojiText]
        });
        
        // 显示成功状态
        statusElement.textContent = '图标已修改！';
        statusElement.style.display = 'block';
        setTimeout(() => {
          window.close(); // 2秒后关闭弹窗
        }, 2000);
      });
    }
  });

  // 按下Enter键也可以提交标题修改
  titleInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      changeButton.click();
    }
  });

  // 按下Enter键也可以提交图标修改
  faviconInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
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
        statusElement.style.color = '#d93025';
        return;
      }
      chrome.scripting.executeScript({
        target: {tabId: tabs[0].id},
        func: restoreDefaultTitle
      });
      
      // 显示成功状态
      statusElement.textContent = '已恢复默认标题！';
      statusElement.style.display = 'block';
      setTimeout(() => {
        window.close(); // 2秒后关闭弹窗
      }, 2000);
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
        statusElement.style.color = '#d93025';
        return;
      }
      chrome.scripting.executeScript({
        target: {tabId: tabs[0].id},
        func: restoreDefaultFavicon
      });
      
      // 显示成功状态
      statusElement.textContent = '已恢复默认图标！';
      statusElement.style.display = 'block';
      setTimeout(() => {
        window.close(); // 2秒后关闭弹窗
      }, 2000);
    });
  });

  // 自动聚焦到标题输入框
  titleInput.focus();
});

// 在标签页中执行的函数 - 修改标题
function changeTabTitle(newTitle) {
  // 保存原始标题，用于恢复
  if (!window.originalTitle) {
    window.originalTitle = document.title;
  }
  document.title = newTitle;
}

// 在标签页中执行的函数 - 修改favicon
function changeTabFavicon(faviconUrl, emojiText) {
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
  // 如果保存了原始标题，则恢复
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