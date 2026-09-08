// popup.js - 弹窗逻辑

(function() {
  'use strict';
  
  let config = null;
  let messageListener = null;
  
  // 初始化
  async function init() {
    
    // 加载配置
    config = await loadConfig();
    updateUI();
    
    // 监听配置更新
    messageListener = chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'UPDATE_CONFIG') {
        config = message.config;
        updateUI();
        return true; // 异步响应
      }
      
      if (message.type === 'GET_CONFIG') {
        sendResponse({ config });
        return true;
      }
    });
  }
  
  // 加载配置
  async function loadConfig() {
    try {
      const result = await chrome.storage.local.get('hideBiliFixedDanmaku');
      const data = result['hideBiliFixedDanmaku'] || {};
      
      // 修复：如果没有任何数据，直接返回默认配置
      if (Object.keys(data).length === 0) {
        return getDefaultConfig();
      }
      
      // 修复：明确转换布尔值，避免 undefined
      const config = {
        enabled: data.enabled !== false && data.enabled !== null,
        topType: data.topType !== false && data.topType !== null,
        bottomType: data.bottomType !== false && data.bottomType !== null,
        interval: Number(data.interval) || 300,
        stats: data.stats || { total: 0, top: 0, bottom: 0 },
        record: data.record || []
      };
      
      return config;
    } catch (e) {
      console.error('加载配置失败:', e);
      return getDefaultConfig();
    }
  }
  
  // 保存配置
  async function saveConfig(config) {
    try {
      await chrome.storage.local.set({
        'hideBiliFixedDanmaku': config
      });
      console.log('配置已保存:', config);
    } catch (e) {
      console.error('保存配置失败:', e);
    }
  }
  
  // 更新 UI
  async function updateUI() {
    // 更新启用屏蔽总开关
    const chkEnabled = document.getElementById('chk-enabled');
    if (chkEnabled) chkEnabled.checked = config.enabled;
    else console.warn('未找到 chk-enabled 元素');
    
    // 更新复选框
    const chkTop = document.getElementById('chk-top');
    const chkBottom = document.getElementById('chk-bottom');
    
    if (chkTop) chkTop.checked = config.topType;
    else console.warn('未找到 chk-top 元素');
    
    if (chkBottom) chkBottom.checked = config.bottomType;
    else console.warn('未找到 chk-bottom 元素');
    
    // 更新间隔输入框
    const inpInterval = document.getElementById('inp-interval');
    if (inpInterval) inpInterval.value = config.interval;
    else console.warn('未找到 inp-interval 元素');
    
    // 获取 content.js 内存中的最新统计和记录
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      console.warn('未找到活动标签页');
      return;
    }
    
    let response = null;
    console.log('📨 发送 GET_STATS 消息到 tab:', tab.id);
    
    chrome.tabs.sendMessage(tab.id, { type: 'GET_STATS' }, (msg) => {
      if (chrome.runtime.lastError) {
        console.warn('❌ 发送失败:', chrome.runtime.lastError.message);
        return;
      }
      console.log('📨 收到消息:', msg);
      response = msg;
    });
    
    // 等待消息返回（给 content.js 一点时间处理）
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('📊 用户点击图标，此时统计信息:', {
      stats: response && response.stats ? response.stats : 'undefined',
      recordsList: response && response.recordsList ? response.recordsList : 'undefined'
    });

    // 更新统计
    const statTotal = document.getElementById('stat-total');
    const statTop = document.getElementById('stat-top');
    const statBottom = document.getElementById('stat-bottom');
    
    if (statTotal) statTotal.textContent = formatNumber(response && response.stats ? response.stats.total : 0);
    if (statTop) statTop.textContent = formatNumber(response && response.stats ? response.stats.top : 0);
    if (statBottom) statBottom.textContent = formatNumber(response && response.stats ? response.stats.bottom : 0);
    
    // 更新记录列表
    const recordList = document.getElementById('record-list');
    if (recordList) {
      const recentRecords = response && response.recordsList ? response.recordsList.slice(-10) : [];
      if (recentRecords.length === 0) {
        recordList.innerHTML = '<div class="empty-msg">暂无记录</div>';
      } else {
        const items = recentRecords.map(record => {
          const className = record.type === 'top' ? 'record-top' : 'record-bottom';
          return `<div class="record ${className}">[${record.type}] ${escapeHtml(record.text)}</div>`;
        }).join('');
        recordList.innerHTML = items;
      }
    }
  }
  
  // 事件监听
  document.addEventListener('DOMContentLoaded', init);
  
  // 复选框 change 事件
  const chkEnabled = document.getElementById('chk-enabled');
  const chkTop = document.getElementById('chk-top');
  const chkBottom = document.getElementById('chk-bottom');
  const inpInterval = document.getElementById('inp-interval');
  
  const updateAll = () => ({
    enabled: chkEnabled.checked,
    topType: chkTop.checked,
    bottomType: chkBottom.checked,
    interval: inpInterval ? Number(inpInterval.value) || 300 : 300
  });
  
  if (chkEnabled) {
    chkEnabled.addEventListener('change', async () => {
      await saveConfig(updateAll());
      console.log('配置已保存：enabled =', chkEnabled.checked);
    });
  }
  
  if (chkTop) {
    chkTop.addEventListener('change', async () => {
      await saveConfig(updateAll());
      console.log('配置已保存：topType =', chkTop.checked);
    });
  }
  
  if (chkBottom) {
    chkBottom.addEventListener('change', async () => {
      await saveConfig(updateAll());
      console.log('配置已保存：bottomType =', chkBottom.checked);
    });
  }
  
  if (inpInterval) {
    inpInterval.addEventListener('change', async () => {
      const newInterval = Number(inpInterval.value) || 300;
      if (newInterval < 200) inpInterval.value = 200;
      if (newInterval > 1000) inpInterval.value = 1000;
      await saveConfig({ interval: newInterval });
      console.log('配置已保存：interval =', newInterval, 'ms');
    });
  }
  
  // 页面卸载时清理
  window.addEventListener('unload', () => {
    if (messageListener) {
      chrome.runtime.onMessage.removeListener(messageListener);
    }
  });
  
  // 工具函数
  function formatNumber(num) {
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + '万';
    }
    return num.toString();
  }
  
  function getDefaultConfig() {
    return {
      enabled: true,
      topType: true,
      bottomType: true,
      interval: 300, // 检测间隔（毫秒），默认 300
      stats: { total: 0, top: 0, bottom: 0 },
      record: []
    };
  }
  
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
