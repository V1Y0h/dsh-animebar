# dsh-animebar

给 DeepSeek Harness 的看番工具：问一句「今天有什么番」，得到按评分排好的清单。

[中文](#中文) · [English](#english)

---

## 中文

### 它做什么

注册一个工具 `anime_today`，读 [Bangumi](https://bgm.tv) 的公开放送表，返回某一天在播的作品，含低分和没评分的，按分数排序。

```
今天有什么番
周三有哪些番在播
最近有什么剧场版动画
```

`kind` 支持两种模式：

- `tv`（默认）— 每周放送表
- `movie` — 剧场版，翻页抓取后按评分排序

返回结构：

```json
{ "weekday": 5, "total": 6, "items": [{ "title": "…", "score": 7.6, "url": "…" }] }
```

### 安装

```sh
# 从 npm 装（推荐）
dsh plugin --profile desktop add dsh-animebar

# 或者直接从仓库装
dsh plugin --profile desktop add github:V1Y0h/dsh-animebar
```

也可以把本地目录加进 **设置 → 插件**。安装后重启 DeepSeek Harness，工具才会注册。

### 平台

插件是纯 Host 侧 JavaScript，没有原生代码，所以只要能跑 DeepSeek Harness 就能用——macOS、Linux、Windows 都行。只要求能访问 Bangumi 的网络。

### 配置

bundle 那一行支持 `config`：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `minScore` | `0` | 低于这个分数的不返回；0 表示全部显示（含无评分） |
| `limit` | `8` | 最多返回几部 |

### 数据与隐私

插件在请求时调用 `api.bgm.tv`，不存任何东西、不做缓存、不分发任何番剧画面或内容。离开你机器的只有你查询的番名。

### 捕获与复盘

配合 [AnimeBar.app](https://github.com/V1Y0h/AnimeBar) 使用：在 IINA 里按 ⌃⌥K 记下当前时间码，
本插件把这些记录读出来，供你在面板里复盘。

- 工具 `anime_captures` — 按时间倒序列出捕获，只返回公开字段（时间码、来源、片名、集数、现象标签）
- 面板「记录」页 — 捕获与手记混排，补集数、标签、维度与反思，可按季度导出复盘草稿
- 标签是英文 slug + 中日英三语名，内置 25 条，可自建；自建的能删，内置的不能

数据全在本地 `~/Library/Application Support/AnimeBar/`：

| 文件 | 谁写 | 内容 |
| --- | --- | --- |
| `creation-log.jsonl` | AnimeBar.app | 捕获 |
| `triage.jsonl` | 本插件 | 复盘 |
| `triage-mac.jsonl` | AnimeBar.app | Mac 端复盘 |

两个复盘文件按时间戳合并（后写覆盖）。**`my_take`、`speculations`、`evidence`
属于私人内容，永远不会出现在工具返回值里**，因此也不会进入模型上下文——
它们只在面板保存这条记录时落盘。

### 限制

- 只覆盖 Bangumi 收录的作品，冷门和独立动画经常缺失。
- 打分人数很少的作品，分数不可靠。
- 不提供播放，看还得用你自己的播放器。

### 写给插件作者

做这个插件时有两处很费时间，而且都不明显：

1. 本地链接安装的 bundle，依赖必须在包目录里自己 `pnpm add` 一遍。只写进 `package.json` 不够，因为 pnpm 对本地目录是 link 而不是安装。
2. `defineTool` 必须提供 `output: { schema, render }`。少任何一个，激活时都会报 `Cannot read properties of undefined (reading 'render')`。

### 许可

MIT。图标是作者本人绘制。

---

## English

Registers one tool, `anime_today`, which reads the public [Bangumi](https://bgm.tv) broadcast calendar and returns the titles airing on a weekday, filtered by rating and sorted by score.

### Install

```sh
# from npm
dsh plugin --profile desktop add dsh-animebar

# or straight from the repository
dsh plugin --profile desktop add github:V1Y0h/dsh-animebar
```

Or point **Plugins → Add plugin** at a local checkout. Restart DeepSeek Harness afterwards so the tool registers.

### Modes

`kind: "tv"` (default) reads the weekly broadcast calendar. `kind: "movie"` searches theatrical films and ranks them by rating.

### Configuration

| key | default | meaning |
| --- | --- | --- |
| `minScore` | `0` | skip titles rated below this; 0 keeps everything, including unrated |
| `limit` | `8` | maximum titles returned |

### Data and privacy

The plugin calls `api.bgm.tv` at request time. It stores nothing, caches nothing, and ships no artwork or episode content.

### Captures and triage

Works together with [AnimeBar.app](https://github.com/V1Y0h/AnimeBar): press ⌃⌥K in IINA to
mark the current timecode, then review these captures in the panel.

- Tool `anime_captures` — lists captures newest first, public fields only (timecode, source,
  title, episode, observed phenomena)
- Records tab — captures and free-form notes share one list; add episode, tags, dimensions
  and reflection; export a season draft

Tags are English slugs with zh/en/ja labels: 25 built in, and custom ones can be added.
Custom tags are deletable, built-in ones are not.

Everything stays local under `~/Library/Application Support/AnimeBar/`:

| File | Written by | Contents |
| --- | --- | --- |
| `creation-log.jsonl` | AnimeBar.app | captures |
| `triage.jsonl` | this plugin | triage |
| `triage-mac.jsonl` | AnimeBar.app | triage from the Mac app |

The two triage files are merged by timestamp (last write wins). **`my_take`,
`speculations` and `evidence` are private and never appear in tool results**, so they never
reach the model context — they are written only when the panel saves that record.

### Notes for plugin authors

1. A locally linked bundle still needs its own `pnpm add <dependency>` inside the package directory.
2. `defineTool` requires `output: { schema, render }`.

### License

MIT. The icon is the author's own artwork.
