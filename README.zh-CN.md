# Clio Browser

> **证据优先、纯浏览器的知识助手。** 捕获、回忆，并让答案扎根于你自己读过的内容——无需桌面应用、无需本地服务、原始内容默认也不会离开浏览器。

[English](./README.md) | **简体中文**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4.svg)](https://developer.chrome.com/docs/extensions/develop/migrate)
[![Built with WXT](https://img.shields.io/badge/Built%20with-WXT-67d7c4.svg)](https://wxt.dev)

---

## Clio 是什么？

Clio 是一个**纯 Chrome 扩展**（Manifest V3），它把你日常的网页阅读变成一个私有、可搜索的知识库，然后让大语言模型**基于这些知识、带着回链原始来源的引用**来回答你的问题。

真正重要的一切都跑在你的浏览器里：

- **捕获**正在阅读的页面（或仅一段选区）到本地存储。
- **回忆**——对自己的记忆做全文检索。
- **提问**——针对当前页面或整个知识库提问，答案流式返回并附带可点击的引用。

这里**没有桌面应用、没有本地 sidecar、没有 `localhost` 服务、也没有配对令牌**。装一个扩展就够了。

## 为什么是「证据优先」？

大模型即使出错也很自信。Clio 围绕一条原则构建：**答案的可信度取决于它能指向的来源。**

- 原始页面内容存在**本地**（SQLite WASM + OPFS）。
- 远端模型只会收到回答所需的**最小检索上下文**，而不是你的整个知识库。
- 每个答案都带有**引用**，可跳回确切的来源页面或保存记录。没有支撑来源，就不会编造引用。

## 功能特性

- 📥 **一键捕获** —— 把当前页面或选中文本存入本地记忆（`Alt+Shift+S`）。正文通过 Mozilla Readability 提取。
- 🧠 **本地知识库** —— 页面、分片、选区存储在基于 OPFS 的 SQLite WASM 中，完全离线，重启浏览器后依然保留。
- 🔎 **检索你的阅读** —— 对捕获过的所有内容做全文关键词搜索。
- 💬 **页面内伴随 Rail** —— 注入页面的 Shadow-DOM 界面（`Alt+Shift+C`）；无需离开标签页即可就当前页面或记忆对话。
- 📚 **带引用的扎根问答** —— 流式答案会引用其依据的本地分片；点击引用跳回来源。
- 🛠️ **智能体工具** —— 浏览器内的智能体循环（由 [pi-mono](https://github.com/earendil-works/pi) 驱动），内置记忆检索、页面总结、网页搜索、图像生成等工具。
- 💡 **回复建议与命令面板** —— 上下文感知的回复建议，外加 `Ctrl/Cmd+Shift+K` 命令面板。
- ✍️ **富文本渲染** —— 答案支持 Markdown、GFM、数学公式（KaTeX）与 Mermaid 图表。
- 🔑 **自带密钥（BYO Key）** —— 支持任意 OpenAI 兼容的服务商（OpenAI、DeepSeek、Groq、自定义 Base URL……）以及原生 Google Gemini。密钥保存在本地扩展存储中。

## 工作原理

```text
┌──────────────────────────────────────────────────────────────┐
│  网页（任意站点）                                                │
│    └── 页面内伴随 Rail   （content script · Shadow DOM）        │
│          │   捕获 · 提问 · 引用                                  │
│          ▼                                                     │
│  Background Service Worker     （仅做短任务路由）                │
│          │                                                     │
│          ▼                                                     │
│  Offscreen Document ── Web Worker                              │
│    └── 本地引擎：SQLite WASM + OPFS                             │
│         （页面 · 分片 · 选区 · 全文索引）                         │
│          │                                                     │
│          ▼                                                     │
│  智能体运行时（pi-mono，浏览器内）                                │
│    └── 远端 LLM   ◀── 仅接收最小检索上下文                       │
└──────────────────────────────────────────────────────────────┘
```

繁重且有状态的工作（存储、索引、检索）放在 **Offscreen Document + Worker** 中，因此即使 Service Worker 被回收也能存活。Service Worker 只负责路由短任务。智能体循环完全在浏览器内运行，是唯一与远端模型通信的组件。

## 技术栈

| 领域 | 选型 |
|---|---|
| 扩展框架 | [WXT](https://wxt.dev)（MV3） |
| UI | React 18、Tailwind CSS 3、Radix UI、lucide-react |
| 本地存储 | [@sqlite.org/sqlite-wasm](https://sqlite.org/wasm) + OPFS |
| 正文提取 | [@mozilla/readability](https://github.com/mozilla/readability) |
| 智能体运行时 | [pi-mono](https://github.com/earendil-works/pi)（`@earendil-works/pi-agent-core`、`@earendil-works/pi-ai`） |
| 渲染 | react-markdown、remark-gfm、remark/rehype-math、KaTeX、Mermaid |
| 工程工具 | pnpm workspace、TypeScript、Biome、Vitest、Playwright |

## 快速开始

### 前置要求

- **Node.js** ≥ 20.10
- **pnpm** 9（`corepack enable` 即可获得）
- **Google Chrome**（或 Chromium 构建）

### 安装与运行

```bash
pnpm install

# WXT 开发模式 —— 改动自动重建
pnpm dev

# 生产构建 → apps/extension/.output/chrome-mv3
pnpm build

# 可直接上架 Chrome Web Store 的 zip
pnpm zip
```

### 在 Chrome 中加载扩展

1. 运行 `pnpm build`（或 `pnpm dev`）。
2. 打开 `chrome://extensions` 并启用**开发者模式**。
3. 点击**加载已解压的扩展程序**，选择 `apps/extension/.output/chrome-mv3`。
4. 在任意页面点击 Clio 工具栏图标（或按 `Alt+Shift+C`）打开 Rail。

## 配置

Clio 需要一个模型服务商才能回答问题。两种配置方式：

**1. 在扩展内配置（推荐）。** 打开 Clio 的设置，填入服务商、API Key、Base URL 和模型。密钥保存在本地扩展存储中。

**2. 通过 `.env.local` 设置开发默认值。** 本地开发时可在被 git 忽略的 `apps/extension/.env.local` 中预填默认值：

```bash
VITE_CLIO_OPENAI_API_KEY=sk-...
VITE_CLIO_OPENAI_BASE_URL=https://api.openai.com/v1   # 或任意 OpenAI 兼容端点
VITE_CLIO_OPENAI_MODEL=gpt-4o-mini
```

E2E 测试读取去掉 `VITE_` 前缀的等价变量（`CLIO_OPENAI_API_KEY`、`CLIO_OPENAI_BASE_URL`、`CLIO_OPENAI_MODEL` 等）。详见 [测试](#测试)。

> 捕获、本地存储和搜索**无需任何 API Key** 即可使用。只有 LLM 回答才需要配置服务商。

## 键盘快捷键

| 快捷键 | 操作 |
|---|---|
| `Alt+Shift+C` | 打开 / 聚焦 Clio 工具箱（Rail） |
| `Ctrl+Shift+K`（macOS 为 `Cmd+Shift+K`） | 命令面板 |
| `Alt+Shift+S` | 将当前页面存入记忆 |

## 项目结构

```text
Clio-browser/
├─ apps/
│  └─ extension/              Chrome MV3 扩展（WXT）
│     ├─ entrypoints/         background · content（Rail）· offscreen · options · popup
│     └─ src/
│        ├─ engine/           本地引擎 Worker（SQLite WASM + OPFS）
│        ├─ rail/             页面内伴随 Rail（UI、应用逻辑、API）
│        ├─ agent-runtime/    pi-mono 适配、服务商、工具、引用
│        ├─ tool-routing/     智能体工具路由类型
│        ├─ suggestions/      回复建议引擎
│        ├─ ui/               共享 UI 组件
│        └─ shared/           跨入口的类型与工具
├─ poc/                       概念验证脚本
├─ tests/e2e/                 Playwright 扩展端到端测试
└─ scripts/                   本地开发辅助脚本
```

## 测试

```bash
pnpm typecheck        # 全工作区 tsc 类型检查
pnpm lint             # Biome
pnpm test             # Vitest 单元测试

# 完整扩展 E2E：构建扩展、用全新 Chrome 配置文件加载它，
# 并通过 Playwright 驱动页面内 Rail。
pnpm e2e:extension
```

E2E 运行需要真实的服务商密钥（`CLIO_OPENAI_API_KEY`），并支持 `CLIO_OPENAI_BASE_URL`、`CLIO_OPENAI_MODEL`、`CLIO_E2E_BROWSER`、`CHROME_PATH`、`CLIO_E2E_TARGET_URL` 等选项。如果已安装的 Chrome 拒绝未打包扩展的命令行参数，可改用 `CLIO_E2E_BROWSER=chromium`，或将 `CHROME_PATH` / `PLAYWRIGHT_CHROMIUM_PATH` 指向 Chrome for Testing。

## 隐私

- 捕获的页面内容**仅存储在你的浏览器中**（OPFS / 扩展存储）。
- 远端模型只接收某个问题的**最小检索上下文**，绝不会拿到你的完整知识库。
- API Key 保存在本地扩展存储中；Rail UI 不会把密钥嵌入页面上下文。
- 无遥测、无 `localhost` 服务、无跨设备同步。

## 状态与路线图

Clio 仍处于**早期、活跃开发阶段**（扩展版本 `0.0.1`）。核心闭环——捕获 → 本地记忆 → 全文检索 → 带引用的扎根问答——目前已可用。路线图：

- 本地 embedding + 混合（FTS + 向量 + RRF）语义检索
- 带可诊断 trace 的 RAG 意图 / 检索路由
- 完整的 Options 页面：服务商管理、隐私预设、上传预览、域名策略
- 知识生命周期（stale / archived / superseded）与 golden-set 评估框架
- 导入 / 导出与 Chrome Web Store 发布

## 贡献

欢迎提交 Issue 和 Pull Request。提交 PR 前请先运行 `pnpm typecheck`、`pnpm lint` 和 `pnpm test`。本项目尚处早期，较大的改动建议先开 Issue 讨论。

## 许可证

[MIT](./LICENSE) © 2026 Clio Browser contributors。

基于 [pi-mono](https://github.com/earendil-works/pi)、[WXT](https://wxt.dev) 与 [SQLite WASM](https://sqlite.org/wasm) 构建。
