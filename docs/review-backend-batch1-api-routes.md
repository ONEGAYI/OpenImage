# 后端代码审查 - Batch 1: API 路由层

> 审查范围：`api/llm_chat.py`(542行) + `api/generate.py`(225行) + `api/inpaint.py`(132行)
> 审查模型：Sonnet
> 审查日期：2026-05-04

---

## 1. 代码复用性 (Reuse)

### [Major] SSE 事件生成/发送模式在 3 个文件中重复
- **文件**: `llm_chat.py:432,460,529,532` / `generate.py:198,219,223` / `inpaint.py:101,127,130`
- **问题**: 三个文件各自内联构建 SSE 事件字符串 `f"event: {name}\ndata: {json.dumps(payload)}\n\n"`，error 事件结构高度相似。`generate.py` 和 `inpaint.py` 缺少 `llm_chat.py` 中的 `Cache-Control`/`Connection`/`X-Accel-Buffering` headers 和缓冲撑破注释。
- **建议**: 抽取到 `backend/src/core/sse.py`：
  ```python
  def sse_event(event_type: str, data: dict, *, ensure_ascii: bool = True) -> str:
      ...
  SSE_FLUSH_COMMENT = f": {' ' * 1024}\n\n"
  ```

### [Major] `_db()` 辅助函数在两个文件中重复定义
- **文件**: `llm_chat.py:19-20` / `llm_settings.py:24-25`
- **问题**: 完全相同的 `def _db(request): return request.app.state.db`
- **建议**: 抽取到 `backend/src/api/deps.py`，统一管理 `get_db`/`get_sessions`/`get_store`

### [Major] API Key 校验逻辑在 generate.py 和 inpaint.py 中重复
- **文件**: `generate.py:175-177` / `inpaint.py:60-62`
- **问题**: 相同的 `api_key = request.app.state.settings.get("api_key"); if not api_key: raise HTTPException(400)`
- **建议**: 抽取为 FastAPI 依赖 `require_api_key(request) -> str`

### [Major] Session 存在性校验逻辑在多个文件中重复
- **文件**: `generate.py:179-182` / `inpaint.py:64-67` / `sessions.py` (4处)
- **问题**: `session = await sessions.get(id); if not session: raise HTTPException(404)`
- **建议**: 抽取为共享函数 `require_session(request, session_id) -> dict`

### [Minor] ID 生成函数在多个文件中重复
- **文件**: `llm_chat.py:23-24` / `generate.py:143`(内联) / `session.py:6-7`
- **建议**: 提取 `gen_id(prefix)` 到 `core/utils.py`

### [Minor] `datetime.now(UTC).isoformat()` 在 llm_chat.py 中出现 9 次
- **文件**: `llm_chat.py:137,157,234,247,286,318,321,471,489`
- **建议**: 定义 `_now()` 辅助函数

### [Minor] `conn.execute` + `fetchone()` + 404 检查模式广泛重复
- **文件**: `llm_chat.py`(3处) / `generate.py`(1处) / `inpaint.py`(1处) / `images.py`(3处)
- **建议**: Database 类添加 `fetch_one_or_404()` 或 `fetch_one()` 便捷方法

### [Minor] `event_generator` 闭包捕获外部 conn，混入过多业务逻辑
- **文件**: `llm_chat.py:430-532`
- **建议**: 将后处理逻辑（保存AI回复、更新token、自动命名）抽取为独立 async 函数

---

## 2. 代码质量 (Quality)

### [Major] `list_chat_sessions` 在列表接口中执行 N+1 查询 + 逐行 token 重算
- **文件**: `llm_chat.py:97-127`
- **问题**: 对每个聊天会话执行 SELECT 加载全部消息，逐条重算 token，再批量 UPDATE。"数据修复"逻辑不应耦合在读取路径中。
- **建议**: 提取为独立管理端点或启动时迁移脚本

### [Major] `chat` 函数的 `event_generator` 闭包过长(~100行)，职责过多
- **文件**: `llm_chat.py:430-532`
- **问题**: 同时负责 SSE 缓冲、流式转发、AI 回复写入、token 更新、自动命名、错误处理
- **建议**: 提取 `_save_ai_response(conn, ...)` 和 `_auto_name_session(conn, ...)`

### [Major] `generate.py` 和 `inpaint.py` 的 SSE event_stream 闭包是近重复的复制粘贴
- **文件**: `generate.py:196-224` / `inpaint.py:99-131`
- **问题**: 结构几乎一致：yield generating → client.generate → save → yield completed → except yield error
- **建议**: 提取通用 SSE 生成辅助函数

### [Major] 错误响应格式不一致
- **文件**: `generate.py:222-223` / `inpaint.py:129-130` / `llm_chat.py:531-532`
- **问题**: SSE error code 不统一（`generation_failed`/`inpaint_failed`/`stream_error`）；HTTP 错误消息中英文混用
- **建议**: 定义统一错误码常量，HTTP 错误消息统一英文

### [Major] `inpaint.py` 缺少 SSE 缓冲撑破注释
- **文件**: `inpaint.py:99`（`generate.py` 同理）
- **问题**: `llm_chat.py` 有 `yield ": padding..."` 撑破缓冲，但其他 SSE 端点没有
- **建议**: 统一所有 SSE 端点或中间件层处理

### [Major] `batch_delete_messages` SQL IN 无长度校验
- **文件**: `llm_chat.py:248-252`
- **问题**: 无限制的 message_ids 可能导致 SQLite `SQLITE_MAX_VARIABLE_NUMBER`(999) 错误
- **建议**: 校验 `len(body.message_ids)` 上限（如 100）

### [Minor] `list_messages` 在 GET 请求中执行 DELETE（副作用）
- **文件**: `llm_chat.py:189-194`
- **建议**: 移到后台定时任务或写入路径

### [Minor] SSE 生成器内 `now` 时间戳与外部不一致
- **文件**: `llm_chat.py:369 vs 485,489`
- **建议**: 在 event_generator 开头生成一个 `ai_now` 变量并复用

### [Minor] `estimate_message_tokens` 的 `saved_token_count` 参数几乎总是传 0
- **文件**: `llm_chat.py:110-115, 319, 474`
- **建议**: 考虑移除该冗余参数

### [Minor] `_SUPPORTED_SIZES` 与 `SIZE_TABLE` 值不同步风险
- **文件**: `generate.py:33-39`
- **建议**: 改为从 `SIZE_TABLE` 动态派生：`_SUPPORTED_SIZES = frozenset(v["1K"] for v in SIZE_TABLE.values())`

### [Minor] `API_MODE_CHAT` 导入但未使用
- **文件**: `generate.py:15`
- **建议**: 删除该导入行

### [Minor] `_validate_mask_b64` 裸 except 吞掉错误信息
- **文件**: `inpaint.py:36-41`
- **建议**: 改为 `except (binascii.Error, ValueError, TypeError)` 并记录原始异常

### [Minor] `history` 构建逻辑 ai_block 处理嵌套过深(4层)
- **文件**: `llm_chat.py:390-403`
- **建议**: 提取为 `_build_history_message(row)`，使用列名映射替代位置索引

### [Minor] `_resolve_previous` 和 source image 获取逻辑重复模式
- **文件**: `generate.py:62-95` / `inpaint.py:72-86`
- **建议**: 提供 `_load_image_b64_by_id(db, store, image_id)` 辅助函数

### [Minor] 查询结果使用位置索引而非列名
- **文件**: `llm_chat.py:88-94, 203-211`
- **建议**: 使用 Row 对象列名访问或添加列名注释

### [Minor] `chat` 函数过长（~180行）
- **文件**: `llm_chat.py:356-542`
- **建议**: 提取 `_prepare_chat_context()` 和 `_save_ai_response()`

---

## 3. 效率 (Efficiency)

### [Critical] 每次列出聊天会话时触发全量 Token 重算
- **文件**: `llm_chat.py:96-127`
- **问题**: O(sessions × messages) 复杂度，每次 GET 请求遍历所有会话的所有消息，逐条 json.loads + token 估算 + UPDATE
- **建议**: 移出读取路径，改为启动迁移或写入路径保证

### [Major] 读取消息时执行删除操作（读写耦合）
- **文件**: `llm_chat.py:188-194`
- **问题**: 每次 GET 都执行 DELETE 清理 48h 前软删除记录，持有写锁可能阻塞并发读取
- **建议**: 移到独立后台任务或低频管理端点

### [Major] SSE 生成器中保存完 AI 回复后冗余回查 total_tokens
- **文件**: `llm_chat.py:488-517`
- **问题**: UPDATE 写入 token_count 后立即 SELECT 回查同一个值
- **建议**: 直接使用变量 `token_count`，删除 L516-517 的 SELECT

### [Major] 每次聊天回复后无条件查询首条用户消息用于自动命名
- **文件**: `llm_chat.py:496-511`
- **问题**: 即使会话早已被重命名，SELECT 仍无条件执行
- **建议**: 在 SELECT 前检查会话名是否仍为默认名（L362 已查询 session_row，可同时取出 name）

### [Minor] chat 端点加载历史消息时多查一条
- **文件**: `llm_chat.py:380-386, 423-428`
- **问题**: 查了所有消息（含刚插入的用户消息），然后 `history[:-1]` 排除最后一条
- **建议**: 查询时添加 `AND id != ?` 排除刚插入的 `user_msg_id`

### [Minor] 每条历史消息的 ai_block 都执行 json.loads + 条件拼接
- **文件**: `llm_chat.py:390-403`
- **建议**: 保存 AI 回复时预计算摘要文本存入新字段

### [Minor] `_resolve_previous` 中两个独立查询串行执行
- **文件**: `generate.py:83-95`
- **建议**: 使用 `asyncio.gather` 并行执行

### [Minor] inpaint 路由中 base64 完整解码仅为获取图片尺寸
- **文件**: `inpaint.py:91-95`
- **建议**: 从数据库查询尺寸或前端附带尺寸参数

---

## 修复计划（按优先级）

### P0 - 必须修复（Critical / 高影响 Major）

| # | 问题 | 类型 | 文件 | 工作量 |
|---|------|------|------|--------|
| 1 | Token 重算从读取路径移出 | 效率-Critical | llm_chat.py | 中 |
| 2 | SSE 事件工具函数抽取 | 复用-Major | 3 文件 | 小 |
| 3 | `_db()` 等依赖获取函数统一 | 复用-Major | api/deps.py 新建 | 小 |
| 4 | API Key / Session 校验抽取 | 复用-Major | api/deps.py | 小 |
| 5 | event_generator 拆分（后处理提取） | 质量-Major | llm_chat.py | 中 |
| 6 | 错误码常量化 + 消息语言统一 | 质量-Major | 多文件 | 小 |
| 7 | SSE 缓冲撑破统一 | 质量-Major | generate/inpaint | 小 |
| 8 | SQL IN 长度校验 | 质量-Major | llm_chat.py | 小 |

### P1 - 建议修复（Major / 高价值 Minor）

| # | 问题 | 类型 | 文件 | 工作量 |
|---|------|------|------|--------|
| 9 | 读取路径 DELETE 移出 | 效率-Major | llm_chat.py | 小 |
| 10 | 冗余 total_tokens 回查删除 | 效率-Major | llm_chat.py | 小 |
| 11 | 自动命名条件化（避免无条件查询） | 效率-Major | llm_chat.py | 小 |
| 12 | SSE event_stream 闭包去重 | 质量-Major | generate/inpaint | 中 |
| 13 | ID 生成函数统一 | 复用-Minor | core/utils.py | 小 |
| 14 | `_SUPPORTED_SIZES` 动态派生 | 质量-Minor | generate.py | 小 |
| 15 | 删除未使用的 API_MODE_CHAT 导入 | 质量-Minor | generate.py | 小 |

### P2 - 可选优化（Minor）

| # | 问题 | 类型 | 文件 | 工作量 |
|---|------|------|------|--------|
| 16 | `_now()` 辅助函数 | 复用-Minor | llm_chat.py | 小 |
| 17 | `fetch_one_or_404` 便捷方法 | 复用-Minor | database.py | 中 |
| 18 | 历史消息多查一条优化 | 效率-Minor | llm_chat.py | 小 |
| 19 | history 构建 ai_block 解析优化 | 效率-Minor | llm_chat.py | 中 |
| 20 | `_resolve_previous` 并行查询 | 效率-Minor | generate.py | 小 |
| 21 | 位置索引改列名访问 | 质量-Minor | llm_chat.py | 小 |
| 22 | `_validate_mask_b64` 精确异常捕获 | 质量-Minor | inpaint.py | 小 |
| 23 | `_load_image_b64_by_id` 辅助函数 | 质量-Minor | generate/inpaint | 小 |
| 24 | inpaint 图片尺寸获取优化 | 效率-Minor | inpaint.py | 中 |
| 25 | `estimate_message_tokens` 冗余参数清理 | 质量-Minor | llm_chat.py | 小 |
| 26 | `saved_token_count` 参数移除 | 质量-Minor | llm_chat.py | 小 |

## 修复记录
<!-- 逐项记录修复状态 -->
