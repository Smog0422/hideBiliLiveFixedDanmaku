# hideBiliLiveFixedDanmaku

Hides fixed (pinned) danmaku over Bilibili live video — top/bottom paid bubbles. Never touches scrolling danmaku or the chat list.

[中文](README.md)

## Tech

- Chrome extension, Manifest V3, plain JS, no dependencies
- MutationObserver, chrome.storage, popup/options pages

## How it works

- Detection: scans `.bili-danmaku-x-dm`; fixed if has `-center` + `--translateY`, excluding `-roll` scrolling
- Region: top/bottom split by `--translateY` vs container midline
- Capture: MutationObserver watches the danmaku container (falls back to body), 120ms debounce
- Record: hidden danmaku text + position into `chrome.storage.local`, read by popup

## Install

1. `chrome://extensions` → enable Developer mode
2. "Load unpacked" → select this folder
3. Open a Bilibili live room

## Usage

- Click the icon: master on/off, top/bottom toggles, stats (total/bottom/top), blocked list
- Options page: add/remove sites (default only live.bilibili.com)
- Room switch (id change) auto-resets stats

## Test

```bash
npm i && npx vitest run   # 74 tests
```

## License

Open source — use, modify, distribute freely.
