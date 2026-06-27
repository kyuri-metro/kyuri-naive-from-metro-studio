# kyuri-naive-from-metro-studio

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Vite](https://img.shields.io/badge/build-Vite-646cff)](https://vitejs.dev/)

> 以下文本为 LLM 生成，但经过人工检查，可以作为参考。

## 简介

本仓库将 [Metro Studio](https://github.com/A-Archives-and-Forks/metro_studio)（[**在线试用**](https://metro-studio-iota.vercel.app)） 项目 JSON（含 `stations`、`lines`、`edges`）中的**单条直线线路**转换为 **Kyuri naive 3.0** YAML（`version: 3`），供 [njmetro-railmap-creator](https://github.com/kyuri-metro/njmetro-railmap-creator) 等工具导入。

**限制：** 仅支持拓扑为简单直线的线路；不支持环线（`isLoop: true`）与分支/支线。一次转换只导出一条线路，换乘信息写入各站点的 `transfer` 字段。本工具只处理拓扑连接与站序，不考虑线路几何走向。

提供 **Node CLI**（`dist/cli.js` / `kyuri-metro-studio`）与 **Vite 静态网页**（可独立打开，也可 `iframe` 嵌入并由父页通过 `postMessage` 驱动）。

## 用法概览

1. **安装依赖**：在项目根目录执行 `npm install`。
2. **网页**：`npm run dev` 本地预览；生产构建为 `npm run build`（产出 `dist/` 库与 CLI、`dist-web/` 站点）。
3. **命令行**：先 `npm run build:lib`，再 `node dist/cli.js --help`；示例如 `node dist/cli.js metro-studio-to-kyuri 项目.json 线路.yaml --line line_xxx`。
4. **输出格式**：Kyuri naive 3.0 YAML，与 njmetro-railmap-creator 的 YAML 导入兼容。

## Web（Vite）

```bash
npm install
npm run dev
```

### 查询参数（嵌入 iframe 时）

| 参数 | 取值 | 说明 |
|------|------|------|
| `hideOutput` | `1` | 嵌入模式：隐藏 YAML 输出区；转换结果经 `postMessage` 发往父窗口。 |
| `flow` | `metro-studio-to-kyuri` | 仅展示 Metro Studio JSON 输入、线路选择与转换操作（默认即此流程）。 |

### 与父页面的 postMessage 约定

- 父页面 → 子 iframe：`source: "njmetro-railmap-parent"`，消息类型见 `src/web/protocol.ts`（如 `setMetroStudioJson`、`convert`）。
- 子 iframe → 父页面：`source: "kyuri-metro-studio-tool"`，`type: "ready"` 表示可下发数据；`type: "result"` 表示一次转换结束（成功带 `yaml`，失败带 `message`）。

### Cloudflare Pages 与 iframe 父页白名单

静态站点部署在 **Cloudflare Pages** 时，[`public/_headers`](./public/_headers) 为全部路径设置 `Content-Security-Policy: frame-ancestors …`，当前允许：

- `https://njmetro-railmap-creator.umamichi.moe`
- `http://localhost:5173`、`http://127.0.0.1:5173`
- `'self'`

构建：

```bash
npm run build
```

产物：`dist/`（Node 库 + CLI）、`dist-web/`（静态站点）。

## CLI

子命令：`metro-studio-to-kyuri`、`list-lines`。

```bash
npm run build:lib
node dist/cli.js list-lines 项目.json
node dist/cli.js metro-studio-to-kyuri 项目.json 输出.yaml --line line_xxx
```

## 许可

本项目以 **GNU GPL v3** 发布。通过 `postMessage` 与父页面通信时，**父页面不必采用 GPL**。
