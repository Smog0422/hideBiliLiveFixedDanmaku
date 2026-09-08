# hideBiliLiveFixedDanmaku

隐藏 B站直播画面里的固定弹幕（顶部/底部付费气泡弹幕）。滚动弹幕、聊天列表不碰。

[English](README.en.md)

## 技术

- Chrome 扩展，Manifest V3，纯 JS，无依赖
- 用到的：MutationObserver、chrome.storage、popup/options 页面

## 原理

- 识别：扫描 `.bili-danmaku-x-dm`，凭 `-center` 类 + `--translateY` 判定固定弹幕，排除滚动 `-roll`
- 分区：顶部/底部用 `--translateY` 与容器中线二分
- 捕获：MutationObserver 监听弹幕容器（找不到回退 body），120ms 防抖
- 记录：被隐藏弹幕文本+位置写进 `chrome.storage.local`，弹窗读取

## 装

1. `chrome://extensions` 开「开发者模式」
2. 「加载已解压的扩展程序」→ 选本目录
3. 打开 B站直播间生效

## 用

- 点图标弹面板：总开关 / 顶部开关 / 底部开关 / 统计（总/底/顶）/ 屏蔽列表
- 设置页可增减生效站点（默认仅 live.bilibili.com）
- 换直播间（房间号变化）自动清零统计

## 测

```bash
npm i && npx vitest run   # 74 用例
```

## License

开源，随意使用 / 修改 / 分发。
