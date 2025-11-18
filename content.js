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