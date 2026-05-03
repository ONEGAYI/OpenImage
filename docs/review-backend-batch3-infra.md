# 后端代码审查 - Batch 3: 基础设施与辅助模块

> 审查范围：`cli.py` + `server.py` + `session.py` + `settings.py` + `sessions.py` + `images.py` + `llm_settings.py` + `llm_tokenizer.py` + `config.py` + `storage.py` + `port.py` + `skills/registry.py`
> 审查模型：Sonnet
> 审查日期：2026-05-04

---

## 1. 代码复用性 (Reuse)

### [Major] `_db()` 辅助函数在多个 API 模块中重复定义
- **文件**: `llm_settings.py:24` / `llm_chat.py:19` / `sessions.py:18` (类似模式) / `images.py`+`generate.py` (直接内联)
- **建议**: 提取 `api/deps.py`，集中定义 `get_db()`/`get_sessions()`/`get_store()`

### [Major] CLI 中 4 个命令重复初始化 Config + Database 样板
- **文件**: `cli.py:136-141, 176-181, 219-223, 245-249`
- **建议**: 提取 `_init_db()` 工厂函数或上下文管理器

### [Major] API Key 脱敏逻辑在两个设置模块中重复且不一致
- **文件**: `settings.py:55-57` / `llm_settings.py:37-42`
- **问题**: `settings.py` 缺少 `len(api_key) > 4` 保护，可能索引越界
- **建议**: 提取 `mask_api_key(key, prefix)` 通用函数

### [Major] `generate` 和 `edit` CLI 命令结构高度重复
- **文件**: `cli.py:124-160` / `cli.py:163-209`
- **建议**: 提取 `_run_generation()` 公共函数

### [Major] LLM 设置加载模式与图片设置不对称
- **文件**: `server.py:74-84`
- **问题**: 图片设置用 `_load_settings()` 函数，LLM 设置在 server.py 内联循环
- **建议**: 在 `llm_settings.py` 提供 `_load_llm_settings(db)` 函数

### [Minor] `_SUPPORTED_SIZES` 在 CLI 和 generate.py 中重复定义
- **文件**: `cli.py:90` / `generate.py:39`
- **建议**: CLI 从 generate.py 导入或提升到 core/ 层

### [Minor] ID 生成函数散布在多个模块
- **文件**: `session.py:6-7` / `llm_chat.py:23-24` / `generate.py:143`
- **建议**: 提取 `gen_id(prefix)` 到 `core/utils.py`

### [Minor] 客户端重建逻辑分散且不一致
- **文件**: `settings.py:32-37` / `llm_settings.py:60-66`
- **问题**: `_rebuild_client` 不关闭旧 client，可能泄漏连接
- **建议**: 统一重建模式，确保旧客户端关闭

### [Minor] `images.py` 直接操作数据库绕过 SessionManager
- **文件**: `images.py:10-13, 23-25, 37-39`
- **建议**: 在 SessionManager 或新建 ImageManager 中集中图片查询

### [Minor] `datetime.now(UTC).isoformat()` 重复 11 次
- **文件**: `llm_chat.py` 多处
- **建议**: 提取 `_now_iso()` 辅助函数

---

## 2. 代码质量 (Quality)

### [Major] CLI 初始化模板重复 4 次
- **文件**: `cli.py:136-158, 176-209, 219-232, 245-255`
- **建议**: `@asynccontextmanager async def _managed_db()`

### [Major] generate 与 edit 命令后半段逻辑雷同
- **文件**: `cli.py:136-161 vs 176-209`
- **建议**: 提取 `_run_generation()` 函数

### [Major] API Key 脱敏逻辑重复
- 同复用性条目

### [Major] sessions.py 路由层直接操作数据库连接
- **文件**: `sessions.py:59-65`
- **问题**: `get_session_images` 绕过 SessionManager
- **建议**: SessionManager 添加 `get_images()` 方法

### [Major] images.py 全文直接操作数据库连接
- **文件**: `images.py:11-12, 23-24, 38-39`
- **建议**: 创建 ImageRepository 或在 SessionManager 中添加方法

### [Major] llm_settings.py 中 ensure_future 丢失异常
- **文件**: `llm_settings.py:66`
- **问题**: fire-and-forget 无异常处理
- **建议**: 改为 `await old_client.close()` 或添加异常回调

### [Major] server.py 中 LLM 设置双重存储需手动同步
- **文件**: `server.py:79-84` / `llm_settings.py:56-58`
- **建议**: 提取通用 `SettingsManager` 封装"数据库 + 内存缓存"双层存储

### [Minor] sessions.py 4 处重复的 "get session → 404" 模式
- **文件**: `sessions.py:36-39, 46-48, 55-57, 71-73`
- **建议**: 提取 `_get_session_or_404()` 辅助函数

### [Minor] llm_settings.py 函数内延迟导入风格不一致
- **文件**: `llm_settings.py:62`
- **建议**: 统一延迟导入策略

### [Minor] cli.py `_load_client` 返回值检查不匹配
- **文件**: `cli.py:112-121`
- **问题**: `from_settings` 不会返回 None，`if not client` 掩盖真正异常
- **建议**: 移除检查，让异常自然传播

### [Minor] port.py 的 read_port_file 吞没 ValueError
- **文件**: `port.py:24-27`
- **建议**: 对 ValueError 添加日志警告

### [Minor] `_SETTING_FIELDS` 和 `LLM_SETTING_KEYS` 裸字符串
- **文件**: `settings.py:9` / `llm_settings.py:7-13`
- **建议**: 可从 Pydantic model 自动提取字段名

### [Minor] `_ENDPOINT_PATHS` 键与 api_mode 无类型绑定
- **文件**: `settings.py:11-15`
- **建议**: 考虑使用 Enum 定义

### [Minor] storage.py 中显而易见的 docstring
- **文件**: `storage.py:14, 29`
- **建议**: 移除或替换为更有价值的说明

### [Minor] server.py 中冗余注释
- **文件**: `server.py:78`
- **建议**: 移除 `# LLM 设置` 注释

---

## 3. 效率 (Efficiency)

### [Major] `_load_settings` 串行执行 4 次 DB 查询
- **文件**: `settings.py:40-47`
- **问题**: cli.py 已用 `asyncio.gather` 但 API 层未采用
- **建议**: 改用 `asyncio.gather` 或 `Database.get_settings(keys)` 批量方法

### [Major] `update_llm_settings` 旧客户端 fire-and-forget 关闭
- **文件**: `llm_settings.py:64-66`
- **建议**: 改为 `await old_client.close()` 或 `create_task` + 异常回调

### [Major] server.py lifespan 中 LLM 设置串行逐个查询
- **文件**: `server.py:79-83`
- **建议**: 改为 `asyncio.gather` 并行

### [Major] session.py `list_all` 关联子查询效率
- **文件**: `session.py:32-50`
- **问题**: 每个 session 执行一次子查询获取 latest_image_id
- **建议**: 使用窗口函数或 LEFT JOIN 优化（当前规模影响小）

### [Minor] CLI 每个 command 重复创建 Config/Database
- 同复用性条目

### [Minor] cli.py 延迟导入位置过深
- **文件**: `cli.py:132-134, 172-174`
- **建议**: 非重量级依赖移至文件顶部

### [Minor] cli.py edit 同步读取图片文件
- **文件**: `cli.py:186-191`
- **建议**: CLI 场景影响小，可保持现状

### [Minor] llm_tokenizer.py 对同一文本执行两次正则操作
- **文件**: `llm_tokenizer.py:14-28`
- **建议**: 可优化为单次遍历（Minor，当前开销不大）

### [Minor] sessions.py 重复查询 session 存在性
- **文件**: `sessions.py:44-49, 52-57, 68-73`
- **建议**: 用 UPDATE/DELETE 的 rowcount 判断替代 SELECT + 操作

### [Minor] storage.py 每次 save_image 检查目录存在
- **文件**: `storage.py:15`
- **建议**: 可接受的开销，保持现状

### [Minor] registry.py lru_cache 不会感知文件变更
- **文件**: `registry.py:34-37`
- **建议**: 开发调试时有影响，生产环境无碍

### [Minor] port.py find_free_port 存在 TOCTOU 竞态
- **文件**: `port.py:9-13`
- **建议**: 实际场景几乎不触发，保持现状

---

## 修复计划（按优先级）

### P0 - 必须修复

| # | 问题 | 类型 | 文件 | 工作量 |
|---|------|------|------|--------|
| 1 | API Key 脱敏逻辑统一 | 复用-Major | settings.py + llm_settings.py | 小 |
| 2 | ensure_future 改为 await close() | 效率-Major | llm_settings.py | 小 |
| 3 | _load_settings 并行化 | 效率-Major | settings.py | 小 |
| 4 | server.py LLM 设置加载并行化 | 效率-Major | server.py | 小 |

### P1 - 建议修复

| # | 问题 | 类型 | 文件 | 工作量 |
|---|------|------|------|--------|
| 5 | `_db()` → `api/deps.py` | 复用-Major | 新建 deps.py | 小 |
| 6 | CLI 初始化模板去重 | 质量-Major | cli.py | 中 |
| 7 | generate + edit 命令去重 | 质量-Major | cli.py | 中 |
| 8 | sessions.py images 查询封装 | 质量-Major | session.py | 小 |
| 9 | images.py SQL 下沉到 core | 质量-Major | images.py + session.py | 中 |
| 10 | _SUPPORTED_SIZES 统一引用 | 复用-Minor | cli.py | 小 |
| 11 | LLM 设置加载函数对称化 | 复用-Major | llm_settings.py | 小 |

### P2 - 可选优化

| # | 问题 | 类型 | 文件 | 工作量 |
|---|------|------|------|--------|
| 12 | ID 生成函数统一 | 复用-Minor | core/utils.py | 小 |
| 13 | _load_client 返回值检查清理 | 质量-Minor | cli.py | 小 |
| 14 | port.py ValueError 日志 | 质量-Minor | port.py | 小 |
| 15 | 冗余 docstring/注释清理 | 质量-Minor | 多文件 | 小 |
| 16 | session.py 关联子查询优化 | 效率-Major | session.py | 中 |
| 17 | estimate_tokens 正则优化 | 效率-Minor | llm_tokenizer.py | 小 |

## 修复记录
<!-- 逐项记录修复状态 -->
