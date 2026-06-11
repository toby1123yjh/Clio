# Clio Browser

> 你的浏览器什么都记不住,你的 AI 张口就编。**Clio 把这两件事一起解决。**

[English](./README.md) | **简体中文**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4.svg)](https://developer.chrome.com/docs/extensions/develop/migrate)
[![Status: alpha](https://img.shields.io/badge/status-alpha-orange.svg)](#状态与路线图)
[![Built with WXT](https://img.shields.io/badge/built%20with-WXT-67d7c4.svg)](https://wxt.dev)

Clio 把你读过的内容捕获进一个私有的本地知识库,然后**基于这些页面回答你的问题——每一条结论都回链到确切的来源。** 不编造引用,原始内容不出浏览器。

它就是一个 Chrome 扩展(Manifest V3)。没有桌面应用,没有本地服务,不用注册账号。

<p align="center">
  <!-- TODO: 截图就绪后替换为 docs/screenshots/hero.png -->
  <img src="https://placehold.co/860x480/f5f5f4/57534e?text=Clio+Rail+%E2%80%94+grounded+answer+with+citations" alt="Clio 页面内 Rail 回答问题并附带回链来源的引用" width="860">
</p>

## Clio 有何不同

Clio 不是云端助手,也不是网页问答引擎——它把**你自己的阅读**变成回答的依据。

| | 云端助手<br/>(Monica、Glarity…) | 网页问答<br/>(Perplexity…) | **Clio** |
|---|:---:|:---:|:---:|
| 你的页面内容 | 在云端处理 | — | **留在你的浏览器** |
| 回答依据 | 当前页面 | 公开网络 | **你捕获的阅读** |
| 引用指向 | 有时,指向页面 | 网页 | **你自己保存的来源** |
| 上手方式 | 账号 + 订阅 | 账号 | **安装 + 自带 key** |

## 功能特性

- 📥 **一键捕获** —— 把当前页面或选中文本存入本地记忆(`Alt+Shift+S`)。正文用 Mozilla Readability 干净提取。
- 🧠 **本地知识库** —— 页面、分片、选区存储在基于 OPFS 的 SQLite WASM 中。完全离线,重启浏览器后仍在。
- 🔎 **检索你的阅读** —— 对捕获过的所有内容做全文搜索。
- 💬 **页面内伴随 Rail** —— 注入页面的 Shadow-DOM 面板(`Alt+Shift+C`);无需离开标签页即可就当前页面或记忆对话。
- 📚 **带引用的扎根回答** —— 流式回答会引用其依据的本地分片;点击引用跳回来源。
- 🛠️ **智能体工具** —— 浏览器内的智能体循环([pi-mono](https://github.com/earendil-works/pi)),内置记忆检索、页面总结、网页搜索、图像生成等工具。
- 💡 **回复建议与命令面板** —— 上下文感知的回复建议,外加 `Ctrl/Cmd+Shift+K` 命令面板。
- ✍️ **富文本渲染** —— 答案支持 Markdown、GFM、数学公式(KaTeX)与 Mermaid 图表。
- 🔑 **自带密钥** —— 支持任意 OpenAI 兼容服务商(OpenAI、DeepSeek、Groq、自定义 Base URL……)以及原生 Google Gemini。密钥保存在本地扩展存储中。

## 截图

> 🚧 占位图 —— 真实截图即将补上。想贡献截图请见 [`docs/screenshots/`](docs/screenshots/)。

| 捕获页面 | 基于记忆提问 | 检索你的库 |
|:---:|:---:|:---:|
| ![捕获](https://placehold.co/420x280/f5f5f4/57534e?text=Capture) | ![提问](https://placehold.co/420x280/f5f5f4/57534e?text=Cited+answer) | ![记忆](https://placehold.co/420x280/f5f5f4/57534e?text=Memory+Library) |

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

有状态的繁重工作(存储、索引、检索)放在 **Offscreen Document + Worker** 中,因此即使 Service Worker 被回收也能存活。智能体循环完全在浏览器内运行,是唯一与远端模型通信的组件——而且每次只发送回答你问题所需的最小检索上下文。

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

### 方式 A —— 安装预构建扩展（推荐）

1. 从 [Releases 页面](https://github.com/toby1123yjh/Clio/releases) 下载 `clio-chrome-mv3.zip`。
2. 解压。
3. 打开 `chrome://extensions`,启用**开发者模式**,点击**加载已解压的扩展程序**,选择解压后的文件夹。
4. 在任意页面按 `Alt+Shift+C` 打开 Rail。

### 方式 B —— 从源码构建

需要 **Node.js ≥ 20.10** 和 **pnpm 9**（`corepack enable`）。

```bash
pnpm install
pnpm dev        # WXT 开发模式，改动自动重建
pnpm build      # 生产构建 → apps/extension/.output/chrome-mv3
pnpm zip        # 打包成可上架 Chrome Web Store 的 zip
```

然后按上面的方式**加载已解压的扩展程序**,选择 `apps/extension/.output/chrome-mv3`。

## 配置

Clio 需要一个模型服务商才能回答问题——两种配置方式:

1. **在扩展内配置(推荐)。** 打开 Clio 设置,填入服务商、API Key、Base URL 和模型。密钥保存在本地扩展存储中。
2. **通过 `.env.local` 设置开发默认值。** 本地开发时,在被 git 忽略的 `apps/extension/.env.local` 中预填:
   ```bash
   VITE_CLIO_OPENAI_API_KEY=sk-...
   VITE_CLIO_OPENAI_BASE_URL=https://api.openai.com/v1   # 或任意 OpenAI 兼容端点
   VITE_CLIO_OPENAI_MODEL=gpt-4o-mini
   ```

> 捕获、本地存储和搜索**无需任何 API Key**——只有 LLM 回答才需要配置服务商。

## 键盘快捷键

| 快捷键 | 操作 |
|---|---|
| `Alt+Shift+C` | 打开 / 聚焦 Clio Rail |
| `Ctrl+Shift+K`（macOS 为 `Cmd+Shift+K`） | 命令面板 |
| `Alt+Shift+S` | 将当前页面存入记忆 |

## 项目结构

```text
Clio-browser/
├─ apps/extension/            Chrome MV3 扩展（WXT）
│  ├─ entrypoints/            background · content（Rail）· offscreen · options · popup
│  └─ src/
│     ├─ engine/              本地引擎 Worker（SQLite WASM + OPFS）
│     ├─ rail/                页面内伴随 Rail（UI、应用逻辑、API）
│     ├─ agent-runtime/       pi-mono 适配、服务商、工具、引用
│     ├─ suggestions/         回复建议引擎
│     ├─ ui/ · shared/        共享组件、类型与工具
├─ poc/                       概念验证脚本
├─ tests/e2e/                 Playwright 扩展端到端测试
└─ scripts/                   本地开发辅助脚本
```

## 测试

```bash
pnpm typecheck     # 全工作区 tsc 类型检查
pnpm lint          # Biome
pnpm test          # Vitest 单元测试
pnpm e2e:extension # 构建并用 Playwright 驱动真实扩展
```

E2E 运行需要服务商密钥(`CLIO_OPENAI_API_KEY`),并支持 `CLIO_OPENAI_BASE_URL`、`CLIO_E2E_BROWSER`、`CHROME_PATH` 等选项。

## 隐私

- 捕获的页面内容**仅存储在你的浏览器中**(OPFS / 扩展存储)。
- 远端模型只接收某个问题的**最小检索上下文**,绝不会拿到你的完整知识库。
- API Key 保存在本地扩展存储中;Rail UI 不会把密钥嵌入页面上下文。
- 无遥测、无 `localhost` 服务、无跨设备同步。

## 状态与路线图

Clio 仍处于**早期、活跃开发阶段**(`v0.0.1`)。核心闭环——捕获 → 本地记忆 → 全文检索 → 带引用的扎根问答——目前已可用。接下来计划:

- [ ] 本地 embedding + 混合(FTS + 向量 + RRF)语义检索
- [ ] 带可诊断 trace 的 RAG 意图 / 检索路由
- [ ] 完整 Options 页面:服务商管理、隐私预设、上传预览、域名策略
- [ ] 知识生命周期(stale / archived / superseded)+ golden-set 评估
- [ ] 导入 / 导出与 Chrome Web Store 发布

## 贡献

欢迎提交 Issue 和 Pull Request!提交 PR 前请先运行 `pnpm typecheck`、`pnpm lint` 和 `pnpm test`。较大的改动建议先开 Issue 讨论。

## 许可证

[MIT](./LICENSE) © 2026 Clio Browser contributors。

基于 [pi-mono](https://github.com/earendil-works/pi)、[WXT](https://wxt.dev) 与 [SQLite WASM](https://sqlite.org/wasm) 构建。
