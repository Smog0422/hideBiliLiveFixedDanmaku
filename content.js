// content.js - 极简版弹幕屏蔽
// 核心逻辑：获取 → 过滤 → 判断 → 隐藏 → 记录

(function () {
  'use strict';

  // ========== 全局变量 ==========
  let currentConfig = null;
  let processTimer = null;
  let isProcessing = false;
  let isContextInvalid = false; // 上下文失效标记

  // ========== 统计与记录 ==========
  let stats = { total: 0, top: 0, bottom: 0 };
  let recordsList = [];

  // ========== 配置管理 ==========
  async function loadConfig() {
    try {
      const data = await chrome.storage.local.get('hideBiliFixedDanmaku');
      const config = data['hideBiliFixedDanmaku'] || {};
      return {
        enabled: config.enabled,
        topType: config.topType,
        bottomType: config.bottomType,
        interval: config.interval || 300
      };
    } catch (e) {
      // 上下文失效 → 标记全局，终止所有逻辑
      if (e.message && e.message.includes('Extension context invalidated')) {
        isContextInvalid = true;
        console.log('[context] 上下文失效，终止所有逻辑');
      }
      console.error('[config] 读取失败:', e);
      return {
        enabled: true,
        topType: true,
        bottomType: true,
        interval: 300
      };
    }
  }

  async function checkConfigAndLocation() {
    // 上下文失效 → 直接返回
    if (isContextInvalid) return false;
    const config = await loadConfig();
    if (!config.enabled) {
      console.log('🛡️ 插件未启用');
      return false;
    }

    const isLive = window.location.hostname === 'live.bilibili.com' &&
      window.location.pathname.length > 1 && /^\d+$/.test(window.location.pathname.replace(/^\//, ''));

    if (!isLive) {
      console.log('🌐 不在 B 站直播间，静默');
      return false;
    }

    console.log('✅ 已启用，在直播间，启动检测');
    return true;
  }

  async function startDetection() {
    // 上下文失效 → 直接终止
    if (isContextInvalid) return;

    try {
      const interval = currentConfig.interval || 300;
      if (processTimer) {
        clearTimeout(processTimer);
        processTimer = null;
      }

      processTimer = setTimeout(() => {
        processDanmakus();
        startDetection();
      }, interval);
    } catch (e) {
      // 上下文失效 → 终止
      if (isContextInvalid) return;
      console.error('[start] 启动检测失败:', e);
      if (processTimer) {
        clearTimeout(processTimer);
        processTimer = null;
      }
      setTimeout(startDetection, 500);
    }
  }


  // ========== 核心弹幕处理 ==========
  function processDanmakus() {
    if (isProcessing) return;
    isProcessing = true;

    try {
      const danmakus = document.querySelectorAll('.bili-danmaku-x-dm');
      const container = document.querySelector('.web-player-danmaku');

      if (!container) {
        console.log('⏳ 等待弹幕容器...');
        return;
      }

      const containerHeight = container.offsetHeight;

      danmakus.forEach(danmaku => {
        // 1. 检查 --translateY
        const style = getComputedStyle(danmaku);
        const translateY = style.getPropertyValue('--translateY');
        if (!translateY) return;

        // 2. 检查是否已隐藏
        if (danmaku.style.display === 'none') return;

        // 3. 解析 translateY 数值
        const translateYNum = parseFloat(translateY);
        if (isNaN(translateYNum)) return;

        // 4. 判断位置：translateY ≤ 容器高度的一半 → 顶部
        const isTop = translateYNum <= containerHeight / 2;

        // 5. 检查配置决定是否屏蔽
        const shouldShield = isTop ? currentConfig.topType : currentConfig.bottomType;
        if (!shouldShield) return;

        // 6. 粗暴隐藏
        danmaku.style.display = 'none';

        // 7. 更新统计
        stats.total++;
        if (isTop) stats.top++;
        else stats.bottom++;

        // 8. 记录弹幕
        recordsList.push({ type: isTop ? 'top' : 'bottom', text: danmaku.textContent });
        if (recordsList.length > 100) recordsList = recordsList.slice(-100);

        // 9. 打印记录
        console.log(`[位置:${isTop ? 'top' : 'bottom'}] ${danmaku.textContent}`);
      });
    } finally {
      isProcessing = false;
    }
  }

  // ========== 生命周期 ==========
  let hasStarted = false;

  async function init() {
    // 上下文失效 → 直接返回
    if (isContextInvalid) return;
    console.log('🛡️ Hide Bilibili Live Fixed Danmaku 已加载');

    // 读取配置并赋值给 currentConfig
    const config = await loadConfig();
    currentConfig = config;

    // 只打印一次启动信息
    if (!hasStarted) {
      hasStarted = true;
      const shouldRun = await checkConfigAndLocation();
      if (shouldRun) {
        const container = document.querySelector('.web-player-danmaku');
        if (container) {
          const containerHeight = container.offsetHeight;
          console.log(`[直播间：是] [弹幕容器：正常] [canvas 高度：${containerHeight}px]`);
          startDetection();
        }
      }
    }

    // 监听 popup 请求获取 stats 和 records
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // 上下文失效 → 不再监听
      if (isContextInvalid) return false;
      if (message.type === 'GET_STATS') {
        sendResponse({ stats, recordsList });
        // 同步回包，不需要 return true
      }
      return false;
    });
  }

  // ========== 启动 ==========
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 监听页面激活（tab 切换回来）
  let isFocusActive = false;

  async function onPageActivate() {
    if (isFocusActive) return;
    isFocusActive = true;

    // 先检查是否仍在直播间
    const shouldRun = await checkConfigAndLocation();
    if (!shouldRun) {
      isFocusActive = false;
      return;
    }

    const container = document.querySelector('.web-player-danmaku');
    if (!container) {
      console.log('⏳ 等待弹幕容器...');
      return;
    }

    // 立即检测一次
    processDanmakus();
  }

  async function onPageDeactivate() {
    if (!isFocusActive) return;
    isFocusActive = false;

    if (processTimer) {
      clearTimeout(processTimer);
      processTimer = null;
      console.log('⏸ 页面失活，已暂停');
    }
  }

  // 页面卸载时清理
  async function onPageUnload() {
    if (processTimer) {
      clearTimeout(processTimer);
      processTimer = null;
    }
  }

  // ========== 启动 ==========
  // 移除失活监听，失活后继续执行

})();
