// content.js - 极简版弹幕屏蔽
// 核心逻辑：获取 → 过滤 → 判断 → 隐藏 → 记录

(function () {
  'use strict';
  // ========== 容器查找（多版本兼容） ==========
  function getDanmakuContainer() {
    // 1. 先搜索主文档（兼容旧版直播间）
    const c1 = document.querySelector('.web-player-danmaku');
    const c2 = document.querySelector('.danmaku-item-container');
    const mainContainer = c1 || c2;

    if (mainContainer) {
      console.log('[容器] 主文档找到弹幕容器, className:', mainContainer.className);
      return mainContainer;
    }

    // 2. 搜索 iframe 内的弹幕容器（兼容 liteVersion 直播间）
    const iframes = document.querySelectorAll('iframe');
    for (let i = 0; i < iframes.length; i++) {
      try {
        const iframe = iframes[i];
        // 只访问同源 iframe（排除跨域 iframe）
        if (iframe.src && iframe.src.includes('live.bilibili.com')) {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          if (iframeDoc) {
            // 按优先级尝试已知类名
            const iframeContainer = iframeDoc.querySelector('.web-player-danmaku')
              || iframeDoc.querySelector('.danmaku-item-container')
              || iframeDoc.querySelector('.fullscreen-danmaku-container');
            if (iframeContainer) {
              // 只在首次找到时打印
              if (!containerFound) {
                console.log('[容器] iframe内找到弹幕容器, className:', iframeContainer.className, ', iframe src:', iframe.src.substring(0, 60));
                containerFound = true;
              }
              return iframeContainer;
            }
          }
        }
      } catch (e) {
        // 跨域 iframe 访问失败，跳过
        console.log('[容器] 跳过跨域iframe:', e.message);
      }
    }

    console.warn('[容器] 未找到任何弹幕容器（主文档+iframe均无）');
    return null;
  }
  //优先getDanmakuContainer进行检测，允许500ms重试5次
  function checkDanmakuContainer(maxAttempts = 5, delay = 500) {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const checkContainer = () => {
        const container = getDanmakuContainer();
        if (container) {
          resolve(container);
        } else {
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(checkContainer, delay);
          } else {
            reject(null);
          }
        }
      };
      checkContainer();
    });
  }
  // ========== 全局变量 ==========
  let currentConfig = null;
  let processTimer = null;
  let isProcessing = false;
  let isContextInvalid = false; // 上下文失效标记
  let containerFound = false; // 容器找到标记
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
    // 上下文失效 → 直接返回
    if (isContextInvalid) return;
    // 多理中 → 直接返回
    if (isProcessing) return;
    isProcessing = true;

    try {
      const container = getDanmakuContainer();
      if (!container) {
        console.log('⏳ 等待弹幕容器...');
        return;
      }
      // 仅从容器内获取弹幕元素，避免跨容器问题
      const danmakus = container.querySelectorAll('.bili-danmaku-x-dm');

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
        const container = getDanmakuContainer();
        if (container) {
          const containerHeight = container.offsetHeight;
          console.log(`[直播间：是] [弹幕容器：正常] [canvas 高度：${containerHeight}px]`);
          startDetection();
        } else {
          console.warn('[直播间：是] [弹幕容器：未找到] 执行 checkDanmakuContainer 函数重试5次...');
          try {
            await checkDanmakuContainer();
            if (getDanmakuContainer()) {
              console.log('[重试成功] 弹幕容器已找到，继续执行 startDetection');
              startDetection();
            } else {
              console.error('[重试失败] 弹幕容器仍未找到，终止检测，插件静默');
            }
          } catch (e) {
            console.error('[重试异常]', e);
            console.error('[重试失败] 弹幕容器仍未找到，终止检测，插件静默');
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

    const container = getDanmakuContainer();
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
