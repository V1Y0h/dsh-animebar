# AnimeBar

给 DeepSeek Harness 加一个查番表的工具。

## 安装

```sh
dsh plugin --profile desktop add dsh-animebar
```

装完重启 DeepSeek Harness。

## 用法

直接问「今天有什么番」，或者指定星期：

```
今天有什么好看的番
周三有哪些番在播
```

工具会返回当天在播的作品，按分数从高到低。默认不过滤分数，低分和没评分的也在里面。

想看剧场版就说「最近有什么剧场版动画」，工具会切换到 `movie` 模式翻页抓取。

## 捕获与复盘

需要另外安装 [AnimeBar.app](https://github.com/V1Y0h/AnimeBar)。在 IINA 里播放时按 ⌃⌥K，
App 会记下当前时间码并在屏幕上给出确认；之后在本插件面板的「记录」页逐条复盘。

工具 `anime_captures` 只返回公开字段：时间码、来源、片名、集数、现象标签。
`my_take`（如果是我）、`speculations`（推测）、`evidence`（证据）属于私人内容，
不会出现在工具返回值里，因此不会进入模型上下文。

数据位置：`~/Library/Application Support/AnimeBar/`

| 文件 | 写入方 |
| --- | --- |
| `creation-log.jsonl` | AnimeBar.app |
| `triage.jsonl` | 本插件 |
| `triage-mac.jsonl` | AnimeBar.app |
| `tags.json` | 本插件（标签注册表） |
| `capture-deletes*.jsonl` | 删除墓碑 |

## 配置

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `minScore` | 7 | 低于这个分数的不返回 |
| `limit` | 8 | 最多返回几部 |

## 数据来源

放送表来自 [Bangumi](https://bgm.tv) 的公开接口 `api.bgm.tv/calendar`，本插件不缓存、不分发任何番剧内容。

## 限制

- 只覆盖 Bangumi 收录的作品，冷门/独立动画可能缺失
- 评分样本少的作品分数会失真（比如只有几个人打分）
- 不提供播放：想看还得自己用播放器
