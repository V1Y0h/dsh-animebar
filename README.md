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
dsh plugin --profile desktop add github:V1Y0h/animebar-plugin
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
dsh plugin --profile desktop add github:V1Y0h/animebar-plugin
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

### Notes for plugin authors

1. A locally linked bundle still needs its own `pnpm add <dependency>` inside the package directory.
2. `defineTool` requires `output: { schema, render }`.

### License

MIT. The icon is the author's own artwork.
