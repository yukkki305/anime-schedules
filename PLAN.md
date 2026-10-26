# PLAN.md — 每日新番更新时间表

> 这份文件记录项目进度。每完成一个阶段就更新一次，做完一项就打勾。

## 一、已确认的决策

| 编号 | 决策 | 选择 |
|---|---|---|
| A | 深夜档归属 | A1：凌晨 00:00–00:59 归到前一天，显示「周日 23:30（深夜）」 |
| A2 | 深夜档怎么实现 | 改用 AniList 后，时间戳是绝对的，换算成北京时间后**自然**落在正确的星期，不需要人工规则 |
| B | 取数方式 | B1：按天查（每天 1 次请求），不再按星期硬拼 |
| C | 首屏 | C1：自动定位今天，并高亮「下一部即将播出」 |
| D | 卡片信息 | D1：封面 + 标题 + 北京时间 + 集数 + 评分 |
| E | 文件拆分 | E1：按职责拆成 api / time / ui / cache / main |
| F | 打开方式 | F1：双击 index.html，全程不使用 ES 模块 |
| G | 缓存 | G1：30 分钟 |
| H | 未推送提交 | H1：由用户在自己的终端执行推送 |
| I | 数据源 | I1：**AniList GraphQL**（Jikan 实测不可达，2026-10-26 已确认切换） |

## 二、阶段进度

| 阶段 | 内容 | 状态 | 完成日期 |
|---|---|---|---|
| 0 | 探测 API + 建 PLAN.md | ✅ 完成（数据源已定为 AniList） | 2026-10-26 |
| 1 | 静态骨架（假数据） | ⬜ 未开始 | — |
| 2 | 接真实 API，只做「今天」 | ⬜ 未开始 | — |
| 3 | 7 天切换 + 本地缓存 | ⬜ 未开始 | — |
| 4a | 加载 / 错误 / 空 三态 | ⬜ 未开始 | — |
| 4b | 排序 + 移动端 + 懒加载 | ⬜ 未开始 | — |
| 5 | README + 推送 | ⬜ 未开始 | — |

## 三、阶段 0 探测结果

### 3.1 为什么换掉 Jikan

| 检查项 | 结果 |
|---|---|
| `api.jikan.moe` DNS 解析 | 正常，解析到 `135.181.39.91` |
| `api.jikan.moe` TCP 80 / 443 | ❌ 全部超时（21 秒无响应） |
| 浏览器里请求 Jikan | ❌ 8 秒超时 |
| 对照组 `api.github.com` | ✅ HTTP 200，0.7 秒 |
| 对照组 `graphql.anilist.co` | ✅ 可用，返回真实数据 |
| 对照组 `api.bgm.tv` | ❌ 超时 |
| 系统代理 | 无（无环境变量、无本地代理端口开放） |

结论：这条网络到 Jikan 服务器的路由不通，浏览器和命令行一样。数据源已改为 AniList。

### 3.2 AniList 实测（都可复现）

| 项目 | 实测结果 |
|---|---|
| 端点 | `https://graphql.anilist.co`，POST JSON `{ query, variables }` |
| 单次耗时 | 5–6 秒（比 Jikan 慢，所以首屏必须有加载态） |
| 北京 2026-10-27 一整天 | **10 条**，`hasNextPage = false` → **一天一次请求就够，不用翻页** |
| 时间格式 | 绝对 UNIX 时间戳，换算显示即可，不会猜错时区 |
| 集数 | 每条自带 `episode`，能显示「第 4 集」 |
| 封面 | `coverImage.large` 可用 |
| 评分 | `averageScore` 可用，但**可能为空**（如《Jueshi Zhan Hun 2》） |
| 总集数 | `episodes` 可用，但**可能为空**（如《Mahou Shoujo Ikusei Keikaku: restart》） |
| 内容来源 | 含国漫 ONA（如《Wushen Zhuzai》ep428、《Jueshi Zhan Hun 2》），当前设计**全部显示**，用标签区分 |
| `pageInfo.total` | 在宽窗口下会返回 5000 这种上限伪值，**不可信，只信 `hasNextPage`** |
| 7 天一次性查询 | 两次尝试都超时，**放弃大窗口查询**，只按天查 |

## 四、取数设计（阶段 2 照此实现）

每天一个请求，时间窗口 = 北京时间当天 00:00:00 到次日 00:00:00：

```graphql
query ($a: Int, $b: Int) {
  Page(page: 1, perPage: 50) {
    pageInfo { hasNextPage }
    airingSchedules(airingAt_greater: $a, airingAt_lesser: $b, sort: TIME) {
      airingAt
      episode
      media {
        id
        title { romaji native }
        coverImage { large }
        averageScore
        format
        episodes
        countryOfOrigin
        isAdult
        siteUrl
      }
    }
  }
}
```

配套规则：

1. **缓存键**：`anime:v1:day:2026-10-27`（日期，不按星期，避免时区歧义），TTL 30 分钟
2. **只存精简字段**（id / 时间 / 集数 / 标题 / 封面 / 评分 / 格式 / 来源国 / 链接），不存原始响应，防 localStorage 5MB 爆
3. **请求控制**：串行队列，两次请求间隔 ≥400ms；`AbortController` 取消过期请求
4. **超时与重试**：8 秒超时；失败重试 2 次，间隔 2s / 4s；仍失败则显示错误态
5. **过滤**：`isAdult = true` 直接丢弃
6. **翻页**：理论上一天 10 条，`hasNextPage` 若为 true 再多取 1 页，硬上限 2 页
7. **7 天视图**：只请求当前选中的那一天，不预取 7 天（7×5 秒太慢）

## 五、风险登记

| # | 风险 | 对策 |
|---|---|---|
| 1 | AniList 偶发超时（已实测两次） | 8 秒超时 + 重试 2 次 + 错误态 + 缓存兜底 |
| 2 | AniList 限流 | 一天一次请求 + 30 分钟缓存 + 串行队列 |
| 3 | `averageScore` / `episodes` 为空 | 显示「暂无评分」/ 不显示总集数，不排版塌陷 |
| 4 | `airingAt` 是 UTC 秒 | 统一用 `Intl` 换算北京时间，不在代码里手写 +8 |
| 5 | 深夜档跨天 | 时间戳换算后自然归位，不做人工偏移 |
| 6 | 隔周 / 不定期播出 | 按接口给的日期原样展示，不推断「每周X」 |
| 7 | 外部字符串注入 | 一律 `textContent`，不用 `innerHTML` |
| 8 | 我的 shell 推不上 GitHub | 用户自己执行 `git push origin main` |
| 9 | 国漫 / ONA 混入 | 当前全部显示，加来源标签；若不想要，1 行过滤即可 |
| 10 | AniList 没有中文标题 | 显示罗马音标题，后续可选接中文映射表 |

## 六、验证方式（每个阶段做完都按这个自查）

- 双击 `index.html`，页面能打开
- 按 F12 打开控制台，**没有红色报错**
- 按阶段验收表逐条比对，成立 / 不成立
