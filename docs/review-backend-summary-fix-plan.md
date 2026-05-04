# 后端代码审查汇总 - 修复计划

> 日期：2026-05-04
> 审查范围：后端全部 23 个 Python 文件（2762 行）
> 详细报告：`review-backend-batch1-api-routes.md` / `batch2-core.md` / `batch3-infra.md`

## 修复总览

按"投入产出比"排序——低成本高收益的优先修复，大架构重构的放后面。

---

## Wave 1: 快速修复（每项 < 5 分钟，不改架构）✅ 已完成

### 1.1 ✅ ImageClient 添加 close() 方法
- `core/client.py` — 添加 `async def close()` 关闭 httpx + openai
- `api/settings.py` — `_rebuild_client` 改为 async，调用旧 client.close()

### 1.2 ✅ LLMClient 旧实例关闭改为 await
- `api/llm_settings.py` — `asyncio.ensure_future` → `await old_client.close()`

### 1.3 ✅ API Key 脱敏逻辑统一
- `api/settings.py` — 添加 `len(api_key) > 4` 保护，与 llm_settings.py 一致

### 1.4 ✅ `_SUPPORTED_SIZES` 动态派生
- `api/generate.py` — 从 SIZE_TABLE 动态派生

### 1.5 ✅ 删除未使用导入
- `api/generate.py` — `API_MODE_CHAT` → `API_MODE_RESPONSES, API_MODE_IMAGES`

### 1.6 ✅ SSE 缓冲撑破统一
- `api/generate.py` + `api/inpaint.py` — 添加 `yield SSE flush comment`

### 1.7 ✅ batch_delete_messages SQL IN 长度校验
- `api/llm_chat.py` — 校验 `len(body.message_ids)` 上限 100

### 1.8 ✅ `_validate_mask_b64` 精确异常捕获
- `api/inpaint.py` — `except Exception` → 精确异常类型

### 1.9 ✅ 冗余 total_tokens 回查删除
- `api/llm_chat.py` — 删除 SELECT 回查，直接使用变量

### 1.10 ✅ `system_prompt` 冗余属性清理
- `core/llm_client.py` — 移除 `self.system_prompt`

### 1.11 ✅ `_inpaint_via_images` 未使用参数清理
- `core/client.py` — 移除 `reference_images` 参数

---

## Wave 2: 小型重构（每项 5-15 分钟）

### 2.1 SSE 工具函数抽取
- 新建 `core/sse.py` — `sse_event()`, `SSE_FLUSH_COMMENT`
- 3 个 API 文件统一使用

### 2.2 `_db()` → `api/deps.py`
- 新建 `api/deps.py` — `get_db()`, `get_sessions()`, `get_store()`, `get_client()`, `require_api_key()`, `require_session()`
- 所有 API 文件替换

### 2.3 ID 生成函数统一
- `core/utils.py` — `gen_id(prefix)`
- `session.py`, `generate.py`, `llm_chat.py` 统一使用

### 2.4 Responses API 输出解析去重
- `core/client.py` — 提取 `_parse_responses_result(response)`
- `_generate_via_responses` + `_inpaint_via_responses` 共用

### 2.5 Chat API 响应解析去重
- `core/client.py` — 提取 `_parse_chat_image_result(resp, label)`
- `_generate_via_chat` + `_inpaint_via_chat` 共用

### 2.6 `_load_settings` 并行化
- `api/settings.py` + `server.py` — asyncio.gather 或批量查询

### 2.7 LLM 设置加载函数对称化
- `api/llm_settings.py` — 添加 `_load_llm_settings(db)`
- `server.py` 调用新函数

### 2.8 base_url 规范化函数提取
- `core/utils.py` — `normalize_base_url(raw)`
- `client.py` + `settings.py` 共用

### 2.9 错误码常量化 + HTTP 消息语言统一
- 定义 SSE 错误码常量
- HTTP 错误消息统一英文

### 2.10 CLI 初始化模板去重
- `cli.py` — 提取 `_managed_db()` 上下文管理器

### 2.11 sessions.py images 查询封装到 SessionManager
- `core/session.py` — 添加 `get_images(session_id)`
- `api/sessions.py:59-65` 改为调用 SessionManager

---

## Wave 3: 中型重构（每项 15-30 分钟，需谨慎）

### 3.1 `_call_responses_api()` / `_call_chat_api()` 提取
- `core/client.py` — 统一 Responses API 和 Chat API 的调用逻辑

### 3.2 `event_generator` 拆分
- `api/llm_chat.py` — 提取 `_save_ai_response()` + `_auto_name_session()`

### 3.3 Token 重算从读取路径移出
- `api/llm_chat.py:list_chat_sessions` — 移除 token 修复逻辑

### 3.4 读取路径 DELETE 移出
- `api/llm_chat.py:list_messages` — 软删除清理移到别处

### 3.5 `generate_stream` 清理
- `core/client.py:534-558` — 修复或移除 final_b64 永远为 None 的问题

---

## Wave 4: 大型重构（低优先级，按需进行）

### 4.1 LLM 聊天 CRUD 下沉到 core 层
- 新建 `core/chat_manager.py`

### 4.2 图片生成函数下沉到 core 层
- 新建 `core/generation_service.py`

### 4.3 通用 SettingsManager
- 封装"数据库 + 内存缓存"双层存储

### 4.4 images.py SQL 下沉
- 创建 ImageRepository 或扩展 SessionManager

---

## 进度追踪

| Wave | 总项 | 已完成 | 状态 |
|------|------|--------|------|
| Wave 1 | 11 | 11 | ✅ 完成 |
| Wave 2 | 11 | 11 | ✅ 完成 |
| Wave 3 | 5 | 4 | 进行中（3.1 跳过 — 核心去重已在 2.4/2.5 完成） |
| Wave 4 | 4 | 0 | 待开始（低优先级） |
