# dsh-animebar

Anime airing board for [DeepSeek Harness](https://github.com/deepseek-ai) — ask what is airing, get a ranked list.

[English](#english) · [中文](#中文)

---

## English

### What it does

Registers one tool, `anime_today`. It reads the public [Bangumi](https://bgm.tv) broadcast calendar and returns the titles airing on a weekday, filtered by rating and sorted by score.

```
what anime airs on Sunday
今天有什么番
```

Response shape:

```json
{ "weekday": 5, "total": 6, "items": [{ "title": "…", "score": 7.6, "url": "…" }] }
```

### Install

```sh
# straight from this repository
dsh plugin --profile desktop add github:V1Y0h/dsh-animebar
```

Or point **Plugins → Add plugin** at a local checkout. Restart DeepSeek Harness afterwards so the tool registers.

An npm release is planned; once published, `dsh plugin --profile desktop add dsh-animebar` will work too.

### Platform

The plugin is plain host-side JavaScript with no native code, so it runs wherever DeepSeek Harness runs — macOS, Linux, or Windows. It needs network access to Bangumi; nothing else.

### Configuration

The bundle row accepts `config`:

| key | default | meaning |
| --- | --- | --- |
| `minScore` | `7` | skip titles rated below this |
| `limit` | `8` | maximum titles returned |

### Data and privacy

The plugin calls `https://api.bgm.tv/calendar` at request time. It stores nothing, caches nothing, and ships no artwork or episode content. Only the titles you query leave your machine.

### Limitations

- Covers only what Bangumi indexes; niche and independent animation is often missing.
- Scores from very few ratings are unreliable.
- No playback. Pair it with whatever player you already use.

### Notes for plugin authors

Two things cost time when building this, and neither is obvious:

1. A locally linked bundle still needs its own `pnpm add <dependency>` inside the package directory. Declaring the dependency in `package.json` is not enough, because pnpm links the directory instead of installing it.
2. `defineTool` requires `output: { schema, render }`. Miss either and activation fails with `Cannot read properties of undefined (reading 'render')`.

### License

MIT. The icon is the author's own artwork.

---

## 中文

### 它做什么

给 DeepSeek Harness 注册一个工具 `anime_today`：读取 [Bangumi](https://bgm.tv) 的公开放送表，返回某一天在播的作品，按评分过滤并排序。

```
今天有什么番
周三有哪些番在播
```

返回结构：

```json
{ "weekday": 5, "total": 6, "items": [{ "title": "…", "score": 7.6, "url": "…" }] }
```

### 安装

```sh
# 直接从仓库装
dsh plugin --profile desktop add github:V1Y0h/dsh-animebar
```

也可以把本地目录加进 **设置 → 插件**。安装后重启 DeepSeek Harness，工具才会注册。

npm 版本还没发布；发出去之后 `dsh plugin --profile desktop add dsh-animebar` 也能用。

### 平台

插件是纯 Host 侧 JavaScript，没有原生代码，所以只要能跑 DeepSeek Harness 就能用——macOS、Linux、Windows 都行。只要求能访问 Bangumi 的网络。

### 配置

bundle 那一行支持 `config`：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `minScore` | `7` | 低于这个分数的不返回 |
| `limit` | `8` | 最多返回几部 |

### 数据与隐私

插件在请求时调用 `https://api.bgm.tv/calendar`，不存任何东西、不做缓存、不分发任何番剧画面或内容。离开你机器的只有你查询的番名。

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
