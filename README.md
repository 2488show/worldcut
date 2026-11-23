# 云岭航行 · Worldcut

**在浏览器里直接玩 / Play in your browser: https://2488show.itch.io/worldcut**

像素风的群岛经营游戏。从一座只有一根树枝的荒岛开始：砍树、挖矿、熔炼、做工具，亲手拼出第一架小飞机，再亲自把货飞到别的岛上，路上有风、雨、雾和空中海盗。小岛从 1 级长到 10 级，房子从小木屋长成灯塔宅邸，飞机和船也各有 10 级。

A cozy pixel island game. Start on a bare island with a stick, build your first plane, fly your own deliveries through wind, rain, fog and sky pirates, and grow your island, house, planes and boats from level 1 to 10.

- 采集、挖矿、做饭、种田、养宠物 · gather, mine, cook, farm, keep pets
- 10 架飞机、10 条船，造、改装、亲自开 · build, upgrade and fly/sail 10 planes and 10 boats
- 岸边和船上钓鱼、横版潜水 · fishing from shore or boat, side-view diving
- 一间一间装修房子，躺在床上听雨 · decorate room by room, listen to the rain in bed
- 复古电脑：股市、新闻、信箱、扫雷 · a retro PC with stocks, news, mail and minesweeper
- 天气、季节、昼夜，主线五章 · weather, seasons, day and night, a five-chapter story
- 中文 / English

## 怎么做的 · How it was made

两人团队制作。大部分代码、体素模型、程序化音乐音效和文字由 Claude（Anthropic 的 AI）在我们的设计和反馈下完成。游戏基于我们自己的像素飞行原型 “fighter”，沿用了它的渲染器、画风和飞行手感。

Made by a two-person team. Most of the code, voxel models, procedural music and sound, and text were written by Claude (Anthropic's AI) under our design and direction. Built on our own pixel flight prototype “fighter”.

画面和声音都是代码算出来的：没有图片和音频素材，整个游戏打包成一个约 1.2 MB 的 HTML 文件。

Everything you see and hear is computed: no image or audio assets; the whole game builds into one ~1.2 MB HTML file.

## 运行 · Run

需要 Node 22 以上 · Node 22+:

```bash
npm install
npm run dev        # 开发服务器 · dev server
npm run build      # 打包成 dist/index.html 单文件 · single-file build
npx vitest run     # 测试 · tests
npm run i18n       # 更新英文翻译表 · update the English string table
```

微信小游戏版 · WeChat mini game build: `node tools/wx-build.mjs` → `dist-wx/`（用微信开发者工具打开 · open with WeChat DevTools）。

## 目录 · Layout

| 路径 · Path | 内容 · What |
|---|---|
| `src/engine/` | 像素渲染引擎、体素模型、人物、载具、房屋外观 · renderer, voxel models, avatars, vehicles |
| `src/game/` | 全部玩法逻辑（不依赖 DOM）· all gameplay (no DOM) |
| `src/ui/` | 网页界面（Preact）和合成音频 · web UI (Preact) and synthesised audio |
| `src/wx/` | 微信小游戏的画布界面 · canvas UI for the WeChat mini game |
| `src/i18n/` | `$t()` 和英文表 · translations |
| `tests/` | vitest 测试和整局通关脚本 · tests and a full playthrough |
| `tools/` | 打包、端到端测试、宣传片拍摄 · build, e2e, promo footage tools |
| `docs/` | 设计文档、各轮改动、决策记录（`DECISIONS.md`）· design docs, change logs, decision log |

## 版权 · Copyright

© 2026 2488show. All rights reserved. 源码公开供阅读，未授权复制、修改或再发布。 The source is public to read; it is not licensed for copying, modification or redistribution.

第三方 · Third party:
- 字体 Fusion Pixel Font（SIL Open Font License 1.1），见 `src/ui/fonts/LICENSE-fusion-pixel.txt`。
- 宣传片里的城市画面用到 PLATEAU（国土交通省 MLIT, CC BY 4.0）、Geoportal Berlin LoD2、© OpenStreetMap contributors、NYC Open Data；这些数据不在本仓库里。 City footage in the promo uses the data above; the data is not in this repository.
