# 前端代码审查报告 — 批次 3：状态管理 + 服务层 + 工具层

> 审查时间：2026-05-04
> 审查范围：stores(4) + api.ts + hooks + types + i18n + utils + globals.css
> 审查维度：复用性 / 质量 / 效率

---

## 一、新增系统性问题（不含批次 1/2 已确认）

### 高优先级

| # | 问题 | 涉及文件 | 建议方案 |
|---|------|----------|----------|
| S37 | **LLMMessage 手动构造** 3 处重复（8+ 字段） | llmChatStore 行 126-138, 195-208, 212-224 | 提取 `createLLMMessage(role, overrides?)` 工厂函数 |
| S38 | **流式状态重置对象** 3 处重复 | llmChatStore 行 119-124, 177-183, 225-232 | 提取 `STREAM_RESET` 常量 |
| S39 | **SSE error/network_error 处理** 3 处重复 | api.ts generateImage/inpaintImage/sendLLMChat | 统一错误处理或 connectSSE 内置 onError |
| S40 | **selectSession 双次渲染** | sessionStore 行 38-46 | 合并为单次 set |
| S41 | **deleteImages N+1 请求** | api.ts 行 109-111 | 后端新增批量删除端点（或确认限制后加注释） |

### 中优先级

| # | 问题 | 涉及文件 | 建议方案 |
|---|------|----------|----------|
| S42 | **HTTP 错误解析** request/connectSSE 重复 | api.ts 行 53-55, 144-146 | 提取 `parseHttpError` 函数 |
| S43 | **SSE 类型断言重复** | api.ts 行 194-199, 209-212, 334-346 | 回调顶部统一断言一次 |
| S44 | **Session/LLMChatSession 共享字段** | types/index.ts 行 1-9, 99-106 | 提取 BaseEntity 接口 |
| S45 | **onCompleted 回调过于复杂** | llmChatStore 行 174-209（35行嵌套） | 拆分为命名函数 |
| S46 | **generationStore 完成和错误回调重置逻辑重复** | generationStore 行 105-111, 119-127 | 提取 resetPatch |
| S47 | **chatSessions.map 更新 total_tokens 重复** | llmChatStore 行 167-171, 279-282 | 提取 updateCurrentChatTokens |

### 低优先级

| # | 问题 | 涉及文件 | 建议方案 |
|---|------|----------|----------|
| S48 | **多个图片接口字段子集重合** | types/index.ts AttachedFile/ImageInput/ReferenceImage | 建立 ImageData 层次 |
| S49 | **硬编码中文字符串 "新对话"** | api.ts 行 250 | 使用 i18n key |
| S50 | **字符串字面量应提取类型** | types/index.ts role/api_mode, llmChatStore bufferingState | 提取 MessageRole/ApiMode/BufferingState |
| S51 | **spin keyframes 未使用** | globals.css 行 4-6 | 删除 |
| S52 | **fileToAttachment 中 base64 存两份** | utils/file.ts 行 22 | preview_url 惰性计算 |
| S53 | **Google Fonts 缺 display=swap** | globals.css 行 1 | 添加参数 |
| S54 | **useTheme localStorage key 命名不统一** | useTheme vs i18n/index | 统一 oi- 前缀 |
| S55 | **selectImage 与 clearSelection 语义重叠** | sessionStore 行 76 | 明确语义 |
| S56 | **SIZE_MAP 回退值硬编码** | generationStore 行 95 | 添加注释或移除 |

---

## 二、复用性审查详情

### llmChatStore.ts（复用问题最密集）

- **LLMMessage 构造** 3 处：tempUserMsg（行 126-138）、aiMsg（行 195-208）、errMsg（行 212-224），均手动填写 8+ 字段 → **S37**
- **流式状态重置** 3 处：sendMessage 初始化、onCompleted updateSession、onError → **S38**
- **cancelStream 重置** 与 STREAM_RESET 几乎一致，仅多 bufferElapsed: 0 → 可 `{...STREAM_RESET, bufferElapsed: 0}`
- **chatSessions.map 更新 total_tokens** 2 处：onUsage 和 deleteLastMessage → **S47**

### api.ts

- **HTTP 错误解析** request/connectSSE 中 `res.json().catch(() => ({detail: res.statusText}))` 重复 → **S42**
- **SSE error 处理** 3 个函数中 error/network_error 断言+提取逻辑完全相同 → **S39**
- **SSE 类型断言** 每个函数内重复断言 `data as {code, message}` → **S43**

### types/index.ts

- Session 与 LLMChatSession 共享 id/name/created_at/updated_at → **S44**
- AttachedFile/ImageInput/ReferenceImage 字段子集重合 → **S48**
- 字符串字面量 role/api_mode 内联定义 → **S50**

### generationStore.ts

- onCompleted/onError 重置 patch 完全一致 → **S46**

---

## 三、质量审查详情

### Major

| 文件 | 问题 |
|------|------|
| llmChatStore 行 126-138, 195-208, 212-224 | LLMMessage 手动构造 3 处重复 → **S37** |
| llmChatStore 行 174-209 | onCompleted 回调 35 行嵌套，逻辑层级深 → **S45** |
| llmChatStore 行 165-172 | onUsage 覆盖 vs 累加 token 计数语义不明（需确认后端返回含义） |
| api.ts 行 195-198 | SSE 回调中同一类型断言两次 → **S43** |
| api.ts 行 209-212 | inpaintImage 与 generateImage 事件处理高度相似 → **S39** |

### Minor

| 文件 | 问题 |
|------|------|
| sessionStore 行 56-63 | deleteSession 中 activeSessionId === id 判断两次 |
| sessionStore 行 76 | selectImage 与 clearSelection 语义重叠 → **S55** |
| generationStore 行 95 | SIZE_MAP 回退值 "1024x1024" 硬编码 → **S56** |
| llmChatStore 行 18 | bufferingState 字符串联合应提取类型 → **S50** |
| llmChatStore 行 240-244 | cancelStream 中间变量命名缺乏意图 |
| types/index.ts 行 111 | LLMMessage.role 应提取 MessageRole 类型 → **S50** |
| types/index.ts 行 62 | api_mode 应提取 ApiMode 类型 → **S50** |
| api.ts 行 250 | 硬编码中文字符串 "新对话" → **S49** |
| i18n/index.ts 行 11-12 | localStorage key 命名风格与 useTheme 不一致 → **S54** |
| globals.css 行 4-6 | spin keyframes 未使用 → **S51** |
| globals.css 行 87-89 | 通配符 box-sizing 重置应加注释说明安全性 |

---

## 四、效率审查详情

### Major

| 文件 | 问题 |
|------|------|
| sessionStore 行 38-46 | selectSession 中 loading 状态触发两次渲染 → **S40** |
| generationStore 行 113-116 | 动态 import("./sessionStore") 每次完成时执行 → 提升到模块级 |
| llmChatStore 行 145-149 | 每个 token 都触发 set → 引入 rAF 节流 |
| llmChatStore 行 192-193 | onCompleted 无条件全量拉取消息 → 已知 S21 |
| llmChatStore 行 97-106 | deleteChatSession 删除后重新拉取 → 已知 S22 |
| api.ts 行 109-111 | deleteImages N+1 请求 → **S41** |

### Minor

| 文件 | 问题 |
|------|------|
| generationStore 行 50-59 | updateSessionGen 每次展开整个 sessionGenerations Map |
| llmChatStore 行 166-172 | onUsage 每次 map 整个 chatSessions 数组 |
| llmChatStore 行 208 | onCompleted fallback filter 遍历全部消息 |
| api.ts 行 194 | generateImage SSE URL 使用 getBaseUrl() 但被 connectSSE 覆盖，意图不清晰 |
| useTheme 行 17 | useState 同步读 localStorage，DOM data-theme 可能延迟一帧 |
| utils/file.ts 行 22 | preview_url 与 data 重复存储同一 base64 |
| globals.css 行 1 | Google Fonts 缺 display=swap → **S53** |

---

## 五、无问题文件

- **toastStore.ts** — Timer 生命周期管理正确，单 Toast 模式简洁
- **useTheme.ts** — useCallback 使用正确
- **i18n/index.ts** — 单次初始化，无运行时问题
- **utils/file.ts** — 职责单一（仅 preview_url 重复存储为 Minor 效率问题）
