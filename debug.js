// 调试工具 - 用于检查和修复插件状态
(function() {
  'use strict';
  
  // 检查后台脚本状态
  async function checkBackgroundScript() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'keepAlive' });
      console.log('Background script status:', response);
      return response && response.status === 'alive';
    } catch (error) {
      console.error('Background script not responding:', error);
      return false;
    }
  }
  
  // 获取当前快捷键配置
  async function getShortcutConfig() {
    try {
      const commands = await chrome.commands.getAll();
      console.log('Current commands:', commands);
      return commands;
    } catch (error) {
      console.error('Failed to get commands:', error);
      return null;
    }
  }
  
  // 检查标签页历史
  async function getTabHistory() {
    try {
      // 通过后台脚本获取历史记录
      const response = await chrome.runtime.sendMessage({ type: 'getTabHistory' });
      console.log('Tab history:', response);
      return response;
    } catch (error) {
      console.error('Failed to get tab history:', error);
      return null;
    }
  }
  
  // 测试快捷键功能
  async function testShortcut() {
    try {
      console.log('Testing shortcut...');
      // 模拟快捷键命令
      await chrome.runtime.sendMessage({ type: 'testCommand', command: 'switch-recent-tabs' });
      console.log('Shortcut test command sent');
    } catch (error) {
      console.error('Failed to test shortcut:', error);
    }
  }
  
  // 完整的诊断报告
  async function runDiagnostics() {
    console.log('=== Chrome Tab Switcher Diagnostics ===');
    console.log('Time:', new Date().toLocaleString());
    
    // 检查后台脚本
    const bgStatus = await checkBackgroundScript();
    console.log('Background Script Status:', bgStatus ? '✅ Active' : '❌ Inactive');
    
    // 检查快捷键配置
    const commands = await getShortcutConfig();
    if (commands) {
      const switchCommand = commands.find(cmd => cmd.name === 'switch-recent-tabs');
      console.log('Switch Command Config:', switchCommand);
      if (switchCommand) {
        console.log('Shortcut:', switchCommand.shortcut || 'Not set');
        console.log('Description:', switchCommand.description);
      }
    }
    
    // 检查标签页历史
    const history = await getTabHistory();
    console.log('Tab History:', history || 'Unable to retrieve');
    
    // 获取当前标签页信息
    try {
      const currentTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log('Current Active Tab:', currentTabs[0]);
    } catch (error) {
      console.error('Failed to get current tab:', error);
    }
    
    console.log('=== End Diagnostics ===');
  }
  
  // 添加到全局对象
  window.TabSwitcherDebug = {
    checkBackgroundScript,
    getShortcutConfig,
    getTabHistory,
    testShortcut,
    runDiagnostics
  };
  
  console.log('Tab Switcher Debug tools loaded. Use TabSwitcherDebug.runDiagnostics() to check status.');
})();