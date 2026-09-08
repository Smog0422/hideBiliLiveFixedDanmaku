// background.js - 插件安装/更新时写入默认配置

chrome.runtime.onInstalled.addListener((details) => {
  // details.reason: 'install' | 'update' | 'chrome_update'
  console.log(`[background] 插件安装/更新：${details.reason}`);

  chrome.storage.local.set({
    'hideBiliFixedDanmaku': {
      enabled: true,          // 默认开启
      topType: true,          // 屏蔽顶部
      bottomType: true,       // 屏蔽底部
      interval: 300           // 检测间隔：毫秒
    }
  });
});
