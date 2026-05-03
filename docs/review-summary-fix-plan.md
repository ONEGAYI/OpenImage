# 前端代码审查汇总 — 修复计划

> 审查时间：2026-05-04
> 覆盖范围：全部 35 个前端源码文件（3 批次 × 3 维度 = 9 个 review agent）
> 文档索引：
> - [批次 1：核心 UI 组件](review-batch1-core-ui.md)
> - [批次 2：ChatPanel + MaskEditor](review-batch2-chatpanel-maskeditor.md)
> - [批次 3：状态管理 + 服务层 + 工具层](review-batch3-stores-services-utils.md)

---

## 修复优先级总览

### P0 — 必须修复（功能/性能/正确性风险）

| # | 问题 | 文件 | 修复方式 | 预期收益 |
|---|------|------|----------|----------|
| S20 | useMaskCanvas state/ref 耦合 | useMaskCanvas.ts | 高频变值（zoom/panOffset/isDrawing/tool）改 ref 存储 | Canvas 绘制性能 |
| S21 | onCompleted 无条件全量拉取消息 | llmChatStore.ts | 直接用流式数据构造最终消息 | 每次对话省一次网络请求 |
| S40 | selectSession 双次渲染 | sessionStore.ts | 合并为单次 set | 消除一次无意义渲染 |
| S37 | LLMMessage 手动构造 3 处 | llmChatStore.ts | 提取 createLLMMessage 工厂函数 | ~40 行去重 + 类型安全 |
| S38 | 流式状态重置 3 处重复 | llmChatStore.ts | 提取 STREAM_RESET 常量 | 3 处统一 |
| S15 | 不必要注释 ~20 处 | 多文件 | 删除 | 代码整洁 |

### P1 — 建议修复（复用/质量改善）

| # | 问题 | 文件 | 修复方式 | 预期收益 |
|---|------|------|----------|----------|
| S1 | useClickOutside | RatioSelector, LanguageSwitcher, ChatSessionBar | 提取 hook | 3 处去重 |
| S2 | refreshSession | sessionStore + 4 处调用 | 新增 store 方法 | 4 处统一 |
| S16 | OptionPills | QuestionForm.tsx | 提取组件 | ~30 行去重 |
| S23 | JSON.parse 每次渲染 | ChatMessage.tsx | useMemo 缓存 | 渲染性能 |
| S24 | normalizeBlock 每次 | AiBlockRenderer.tsx | useMemo 缓存 | 渲染性能 |
| S25 | ChatSessionBar 重复 find | ChatSessionBar.tsx | 合并为一次 find | 简单修复 |
| S27 | 流式占位对象重建 | ChatPanel/index.tsx | 定义常量 | 避免重建 |
| S39 | SSE error 处理重复 | api.ts | 统一错误处理 | 3 处去重 |
| S42 | HTTP 错误解析重复 | api.ts | 提取 parseHttpError | 2 处去重 |
| S46 | 重置 patch 重复 | generationStore.ts | 提取 resetPatch | 2 处统一 |
| S47 | chatSessions.map 重复 | llmChatStore.ts | 提取 helper | 2 处统一 |
| S5 | Store 过度订阅 | 多个组件 | 细粒度 selector | 减少不必要重渲染 |
| S19 | StreamingCursor | ChatMessage, ThinkingCard | 提取组件 | 2 处去重 |

### P2 — 可选修复（代码质量改善）

| # | 问题 | 文件 | 修复方式 |
|---|------|------|----------|
| S3 | 输入框 focus/blur 样式 | 多文件 | StyledInput 组件或 CSS class |
| S4 | 按钮 hover DOM 操作 | 多文件 | ActionButton/IconButton |
| S6 | 文件下载逻辑 | DetailPanel | triggerDownload 工具函数 |
| S7 | Inpaint 回调构建 | DetailPanel, InputArea | buildInpaintCallbacks |
| S8-S9 | SVG 图标重复 | 多文件 | 共享图标组件 |
| S10 | Popover 箭头 | RatioSelector, LanguageSwitcher | PopoverArrow |
| S11 | Loading spinner | App, Gallery | Spinner 组件 |
| S12 | DetailPanel 按钮复制 | DetailPanel | ActionButton variant |
| S28 | 不安全类型断言 | AiBlockRenderer.tsx | typeof 检查 |
| S29 | MaskEditor 颜色硬编码 | MaskEditor/index.tsx | THEME 常量 |
| S44 | Session/LLMChatSession 共享字段 | types/index.ts | BaseEntity 接口 |
| S45 | onCompleted 回调复杂 | llmChatStore.ts | 拆分命名函数 |
| S50 | 字符串类型提取 | types/index.ts | MessageRole/ApiMode/BufferingState |
| S51 | 未使用 spin keyframes | globals.css | 删除 |
| S53 | Google Fonts display=swap | globals.css | 添加参数 |
| S34 | 绘制操作多次 setState | useMaskCanvas.ts | 合并 |

### P3 — 暂不修复（低收益/高风险/需确认）

| # | 问题 | 说明 |
|---|------|------|
| S41 | deleteImages N+1 | 需后端配合，前端无法独立解决 |
| S22 | deleteChatSession 重新拉取 | 改为本地 filter 需确认排序一致性 |
| S14 | 标签样式常量 | 仅 2 处，收益极低 |
| S48 | 图片接口层次 | 字段差异较大，强行统一增加复杂度 |
| S49 | "新对话" 硬编码 | api 层无 i18n context，需调整架构 |
| S52 | preview_url 重复存储 | 需改 AttachedFile 为 class/getter |
| S26 | useMaskCanvas 坐标计算 | 单文件内重复，不跨文件 |
| S30 | MiniCloseButton | 仅 2 处相似 |

---

## 修复执行策略

建议按模块分批修复，每批完成后运行 TypeScript 检查确认无误：

1. **第一批：基础设施** — types 提取类型别名 + stores 提取工厂函数/常量/辅助方法
2. **第二批：hooks + utils** — useClickOutside + refreshSession + useMemo 缓存
3. **第三批：组件** — StreamingCursor + 删除不必要注释 + OptionPills
4. **第四批：api.ts** — parseHttpError + SSE 错误处理统一
5. **每批完成后** — `npx tsc --noEmit` 检查 + 功能验证
