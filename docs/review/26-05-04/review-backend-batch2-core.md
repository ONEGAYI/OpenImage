# 后端代码审查 - Batch 2: 核心业务层

> 审查范围：`core/client.py`(559行) + `core/llm_client.py`(239行) + `core/database.py`(112行) + `core/llm_prompt.py`(92行)
> 审查模型：Sonnet
> 审查日期：2026-05-04

---

## 1. 代码复用性 (Reuse)

### [Major] 两个 Client 缺少共享的 HTTP 基础设施
- **文件**: `client.py:43` / `llm_client.py:41-44`
- **问题**: 各自独立创建 `httpx.AsyncClient`，配置不同超时（180s vs 120s），无共享连接池或生命周期管理。`ImageClient` 直接创建，`LLMClient` 惰性初始化，模式不一致。
- **建议**: 提取 `create_http_client(timeout)` 工厂函数，统一创建和生命周期管理

### [Major] 错误处理/响应验证逻辑严重不对称
- **文件**: `client.py:54-84` / `llm_client.py:106-112`
- **问题**: `ImageClient._check_response()` 有 30 行精细验证（524超时、Cloudflare 5xx、空响应、非JSON），`LLMClient` 仅 6 行 `status_code != 200` 判断
- **建议**: 提取 `validate_http_response(resp, endpoint)` 到 `core/http_utils.py`

### [Major] API 层包含大量 LLM 聊天核心业务逻辑（数据库 CRUD 泄漏）
- **文件**: `api/llm_chat.py` 约 300 行直接 SQL
- **问题**: 所有 LLM 聊天 CRUD 以原始 SQL 散布在 API 层，对比图片会话有 `SessionManager`（core/session.py）
- **建议**: 创建 `core/chat_manager.py`，封装 llm_chat_sessions 和 llm_messages 的 CRUD

### [Major] API 层包含图片生成核心业务函数
- **文件**: `api/generate.py:62-169`
- **问题**: `_resolve_previous`、`_save_generated_image`、`_read_image_b64` 是纯业务逻辑却定义在 API 层
- **建议**: 迁移到 `core/generation_service.py` 或扩展 `core/session.py`

### [Major] Responses API 输出解析逻辑在 client.py 内重复
- **文件**: `client.py:157-167` / `client.py:400-412`
- **问题**: 遍历 `response.output` 提取 `image_b64` 和 `revised_prompt` 的 9 行代码完全相同
- **建议**: 提取 `_parse_responses_result(response) -> GenerateResult`

### [Major] Chat API 响应解析逻辑重复
- **文件**: `client.py:291-307` / `client.py:458-474`
- **问题**: 解析 `choices[0].message.content` → 正则提取 URL → 下载 base64 的 16 行代码几乎相同
- **建议**: 提取 `_parse_chat_image_result(resp, endpoint_name) -> GenerateResult`

### [Minor] `from_settings()` 工厂方法在两个 Client 中模式相同
- **文件**: `client.py:98-108` / `llm_client.py:228-239`
- **建议**: 当前参数差异大，保持各自实现合理。未来可考虑 Pydantic 配置模型

### [Minor] base64 data URL 构建重复 4 处
- **文件**: `client.py:175,255,262` / `llm_client.py:61`
- **问题**: `f"data:{media_type};base64,{data}"` 出现 4 次，且部分硬编码 `image/png`
- **建议**: 提取 `build_data_url(media_type, base64_data)` 工具函数

### [Minor] ImageClient 缺少 `close()` 方法导致资源泄漏风险
- **文件**: `client.py:34-51`
- **问题**: 有 `httpx.AsyncClient` 和 `AsyncOpenAI` 但无清理方法，`LLMClient` 正确提供了 `close()`
- **建议**: 添加 `async def close()` 方法

### [Minor] 数据库操作缺少 Repository/Manager 抽象
- **文件**: `database.py` vs `api/llm_chat.py`
- **问题**: Database 仅提供裸 `connection()`，LLM 相关操作全以原始 SQL 在 API 层
- **建议**: 为 LLM 聊天创建 `ChatManager`，与 `SessionManager` 架构一致

---

## 2. 代码质量 (Quality)

### [Major] `generate_stream` 存在永远为 None 的未使用变量
- **文件**: `client.py:534-536,556`
- **问题**: `final_b64` 和 `revised_prompt` 初始化为 None，整个循环中从未赋值
- **建议**: 移除或从流事件中提取（如果 SDK 支持）

### [Major] `_generate_via_responses` 与 `_inpaint_via_responses` 大量复制粘贴
- **文件**: `client.py:132-167` / `client.py:360-412`
- **问题**: 约 20 行重复代码（构建→调用→遍历→构造 GenerateResult）
- **建议**: 提取 `_call_responses_api(content, tool_config, prev_id)`

### [Major] `_generate_via_chat` 与 `_inpaint_via_chat` 大量复制粘贴
- **文件**: `client.py:268-307` / `client.py:414-474`
- **问题**: 约 60 行近乎相同的流程（content→payload→post→解析→下载）
- **建议**: 提取 `_call_chat_api(content, params, endpoint_label)`

### [Major] response output 遍历只取最后一个匹配项
- **文件**: `client.py:157-160` / `client.py:402-405`
- **问题**: 多个 `image_generation_call` 时只保留最后一个，前面的被静默丢弃
- **建议**: 使用 `next((o for o in ... if o.type == ...), None)` 显式查找

### [Major] `generate` 方法参数膨胀（8 个参数）
- **文件**: `client.py:476-486`
- **问题**: inpaint 参数与普通生成参数混在一起
- **建议**: 将 inpaint 拆分为独立公共方法

### [Major] `LLMClient.build_messages` 的 `system_prompt` 参数与 `self.system_prompt` 冗余
- **文件**: `llm_client.py:28,46-52`
- **问题**: `self.system_prompt` 存储了但 `build_messages` 要求外部传入，实例属性从未使用
- **建议**: 移除 `self.system_prompt` 或让 `build_messages` 回退到实例属性

### [Minor] `_inpaint_via_images` 有 `reference_images` 参数但未使用
- **文件**: `client.py:326-333`
- **建议**: 移除未使用参数

### [Minor] `_api_key` 和 `_openai` 存储了相同的 API key
- **文件**: `client.py:42,44`
- **建议**: 考虑通过 `self._openai.api_key` 获取，减少重复

### [Minor] `api_mode` 字符串缺少枚举类型约束
- **文件**: `client.py:16-18,39,50`
- **建议**: 使用 `Literal["responses", "images", "chat"]` 或 `StrEnum`

### [Minor] `StreamEvent.type` 使用原始字符串而非常量
- **文件**: `llm_client.py:16`
- **建议**: 定义 `StreamEventType` 常量或枚举

### [Minor] `chat_stream` 方法过长（约 140 行）
- **文件**: `llm_client.py:72-215`
- **建议**: 提取 ai_block 解析为 `_AiBlockParser` 类

### [Minor] `base_url` 规范化逻辑与 `settings.py` 重复
- **文件**: `client.py:46-49` / `settings.py:18-22`
- **建议**: 提取 `normalize_base_url()` 公共工具函数

### [Minor] `database.py` 中 `assert self._db is not None` 重复
- **文件**: `database.py:97-98,105-106`
- **建议**: 使用 `_ensure_connection` 属性或类型缩窄

### [Minor] `from_settings` 对布尔值的字符串解析散落在各处
- **文件**: `llm_client.py:230-232`
- **建议**: 在数据库层添加 `get_setting_bool` 等类型安全访问方法

### [Minor] `_render_context_layer` 的 `session_images` 类型过于宽泛
- **文件**: `llm_prompt.py:27,58`
- **建议**: 定义 `TypedDict` 描述结构

### [Minor] `generate_stream` 仅支持 Responses 模式但未体现
- **文件**: `client.py:507-559`
- **问题**: 且该方法目前无调用方
- **建议**: 添加注释说明或移除

### [Minor] `_migrate_thinking_columns` 使用 PRAGMA 而非版本化迁移
- **文件**: `database.py:79-86`
- **建议**: 当前规模可接受，后续考虑 `schema_versions` 表

---

## 3. 效率 (Efficiency)

### [Major] ImageClient 重建时未关闭旧连接，造成连接泄漏
- **文件**: `api/settings.py:33-37`
- **问题**: 每次修改设置都泄漏一个 TCP 连接池，`LLMClient` 有 `old_client.close()` 但 `ImageClient` 没有
- **建议**: `ImageClient` 添加 `close()` 方法，`_rebuild_client` 中调用

### [Major] LLMClient 旧实例关闭使用 ensure_future 无异常处理
- **文件**: `api/llm_settings.py:65-66`
- **问题**: fire-and-forget 模式，异常静默丢失，且可能在活跃流中被关闭
- **建议**: 使用 `create_task` + `add_done_callback` 记录异常

### [Major] set_setting 逐次 commit，N 次设置产生 N 次 fsync
- **文件**: `api/settings.py:68-72` + `database.py:105-112`
- **问题**: 4 个设置 → 4 次 commit → 4 次磁盘同步；LLM 设置同理（5次）
- **建议**: 新增 `set_settings_batch()` 方法，单事务批量写入

### [Major] 启动时 4 次串行数据库查询可合并为一次
- **文件**: `api/settings.py:40-41` / `llm_settings.py:31-34`
- **建议**: 新增 `get_settings(keys) -> dict` 方法，单条 SELECT IN 查询

### [Major] LLM 聊天消息发送前 5 次串行数据库查询可并行
- **文件**: `api/llm_chat.py:362-410`
- **问题**: 查询1(session)+2(prev_tokens) 可并行，查询4(history)+5(images) 可并行
- **建议**: 使用 `asyncio.gather` 并行化

### [Minor] `_resolve_previous` 中两个独立查询串行
- **文件**: `api/generate.py:84-95`
- **建议**: `asyncio.gather` 并行化

### [Minor] `generate_stream` 的 completed 事件中 `final_b64` 始终为 None
- **文件**: `client.py:535-558`
- **问题**: 流式模式下最终图片数据从未收集，可能是功能缺陷
- **建议**: 从 completed data 移除 `b64_json` 或从流中收集

### [Minor] LLMClient 懒初始化无并发保护
- **文件**: `llm_client.py:41-44`
- **建议**: 添加 `asyncio.Lock` 或在 `__init__` 中直接创建

### [Minor] `_download_as_b64` 无超时且不限制响应体大小
- **文件**: `client.py:113-116`
- **建议**: 添加读取超时和大小检查

### [Minor] `compose_system_prompt` 每次聊天请求重新加载技能
- **文件**: `llm_prompt.py:33-34`
- **建议**: 预组装静态部分（身份层+技能层），只动态组装上下文层

### [Minor] 单连接模式在高并发下可能瓶颈
- **文件**: `database.py:67-95`
- **建议**: 桌面应用可保持现状，必要时启用 WAL 模式

### [Minor] `_get_prev_cumulative_tokens` 可在 session 表维护
- **文件**: `api/llm_chat.py:27-30`
- **建议**: 在 `llm_chat_sessions` 维护 `last_token_count` 字段

---

## 修复计划（按优先级）

### P0 - 必须修复

| # | 问题 | 类型 | 文件 | 工作量 |
|---|------|------|------|--------|
| 1 | ImageClient 旧实例未关闭（连接泄漏） | 效率-Major | client.py + settings.py | 小 |
| 2 | `_parse_responses_result()` 提取 | 复用-Major | client.py | 小 |
| 3 | `_parse_chat_image_result()` 提取 | 复用-Major | client.py | 小 |
| 4 | `_call_responses_api()` / `_call_chat_api()` 提取 | 质量-Major | client.py | 中 |
| 5 | 统一 HTTP 错误处理 | 复用-Major | 新建 http_utils.py | 中 |
| 6 | `generate_stream` final_b64 修复或清理 | 质量-Major | client.py | 小 |
| 7 | `system_prompt` 冗余属性清理 | 质量-Major | llm_client.py | 小 |
| 8 | `generate` 参数膨胀 → 拆分 inpaint | 质量-Major | client.py | 中 |

### P1 - 建议修复

| # | 问题 | 类型 | 文件 | 工作量 |
|---|------|------|------|--------|
| 9 | set_setting 批量化（减少 fsync） | 效率-Major | database.py | 中 |
| 10 | 启动设置查询合并 | 效率-Major | database.py + settings | 小 |
| 11 | LLM 聊天查询并行化 | 效率-Major | llm_chat.py | 小 |
| 12 | API 层核心逻辑下沉（LLM CRUD） | 复用-Major | 新建 chat_manager.py | 大 |
| 13 | API 层核心逻辑下沉（生成函数） | 复用-Major | 新建 generation_service.py | 中 |
| 14 | data URL 构建函数提取 | 复用-Minor | 新建或扩展 utils | 小 |
| 15 | base_url 规范化函数提取 | 质量-Minor | utils | 小 |

### P2 - 可选优化

| # | 问题 | 类型 | 文件 | 工作量 |
|---|------|------|------|--------|
| 16 | api_mode 枚举类型约束 | 质量-Minor | client.py | 小 |
| 17 | StreamEvent type 常量化 | 质量-Minor | llm_client.py | 小 |
| 18 | chat_stream 拆分（ai_block 解析器） | 质量-Minor | llm_client.py | 中 |
| 19 | LLMClient 懒初始化并发保护 | 效率-Minor | llm_client.py | 小 |
| 20 | `_download_as_b64` 超时限制 | 效率-Minor | client.py | 小 |
| 21 | 未使用参数清理（reference_images 等） | 质量-Minor | client.py | 小 |
| 22 | compose_system_prompt 缓存优化 | 效率-Minor | llm_prompt.py | 小 |
| 23 | 类型安全设置访问方法 | 质量-Minor | database.py | 小 |
| 24 | TypedDict for session_images | 质量-Minor | llm_prompt.py | 小 |
| 25 | generate_stream 调用方确认 | 质量-Minor | client.py | 小 |
| 26 | database.py assert 去重 | 质量-Minor | database.py | 小 |
| 27 | LLMClient ensure_future 修复 | 效率-Major | llm_settings.py | 小 |

## 修复记录
<!-- 逐项记录修复状态 -->
