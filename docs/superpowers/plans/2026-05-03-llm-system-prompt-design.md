# LLM 系统提示词分层架构 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 LLM AI 助手的系统提示词从单一扁平字符串升级为 4 层动态组装架构，并引入 Skill 文档驱动的工作流系统。

**Architecture:** 后端 `compose_system_prompt()` 按 L1(身份) → L2(Skill) → L3(上下文) → L4(预留) 组装系统提示词。Skill 注册表从 Markdown 文件加载工作流指令。前端在聊天请求中携带生成偏好上下文。

**Tech Stack:** Python 3 / Pydantic / aiosqlite (后端), TypeScript / Zustand (前端)

---

## File Structure

### 新增文件

| 文件 | 职责 |
|------|------|
| `backend/src/core/skills/__init__.py` | 空包初始化 |
| `backend/src/core/skills/registry.py` | Skill 注册表 + 加载函数 |
| `backend/src/core/skills/prompt_optimizer.md` | prompt-optimizer Skill 文档（YAML frontmatter + Markdown body） |
| `backend/src/core/llm_prompt.py` | `compose_system_prompt()` + 辅助函数 |
| `backend/tests/test_skills_registry.py` | 注册表单元测试 |
| `backend/tests/test_llm_prompt.py` | 提示词组装器单元测试 |

### 修改文件

| 文件 | 改动范围 |
|------|----------|
| `backend/src/api/llm_chat.py:42-46` | 添加 `ChatContext` 模型，扩展 `ChatRequest` |
| `backend/src/api/llm_chat.py:256-265` | `chat()` 端点：使用 `compose_system_prompt()`，查询 `session_images` |
| `frontend/src/types/index.ts:168-172` | 添加 `ChatContext` 类型，扩展 `LLMChatRequest` |
| `frontend/src/stores/llmChatStore.ts:108-134` | `sendMessage` 从 `generationStore` 构建并传递 `context` |

### 依赖关系

```
Task 1 (skills/registry) ──→ Task 2 (llm_prompt) ──→ Task 3 (llm_chat.py 集成)
Task 4 (前端类型) ──→ Task 5 (前端 Store 集成)
```

Task 1-3（后端）和 Task 4-5（前端）可并行执行，但 Task 2 依赖 Task 1，Task 3 依赖 Task 2。

---

## Task 1: Skill 注册表 + prompt-optimizer 文档

**Files:**
- Create: `backend/src/core/skills/__init__.py`
- Create: `backend/src/core/skills/registry.py`
- Create: `backend/src/core/skills/prompt_optimizer.md`
- Test: `backend/tests/test_skills_registry.py`

- [ ] **Step 1: 写注册表失败测试**

创建 `backend/tests/test_skills_registry.py`：

```python
from src.core.skills.registry import (
    SKILLS,
    SkillDef,
    get_default_skill_id,
    load_skill_content,
)


def test_skills_registry_has_prompt_optimizer():
    assert "prompt-optimizer" in SKILLS
    sdef = SKILLS["prompt-optimizer"]
    assert isinstance(sdef, SkillDef)
    assert sdef.default is True
    assert sdef.file == "prompt_optimizer.md"


def test_get_default_skill_id():
    assert get_default_skill_id() == "prompt-optimizer"


def test_load_skill_content_returns_nonempty():
    content = load_skill_content("prompt-optimizer")
    assert isinstance(content, str)
    assert len(content) > 100
    assert "# 提示词优化" in content


def test_load_skill_content_invalid_raises():
    import pytest

    with pytest.raises(KeyError):
        load_skill_content("nonexistent-skill")
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && python -m pytest tests/test_skills_registry.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'src.core.skills'`

- [ ] **Step 3: 创建空包 `__init__.py`**

创建 `backend/src/core/skills/__init__.py`（空文件）。

- [ ] **Step 4: 创建 `registry.py`**

创建 `backend/src/core/skills/registry.py`：

```python
from dataclasses import dataclass
from pathlib import Path


SKILLS_DIR = Path(__file__).parent


@dataclass
class SkillDef:
    name: str
    file: str
    description: str
    default: bool = False


SKILLS: dict[str, SkillDef] = {
    "prompt-optimizer": SkillDef(
        name="提示词优化",
        file="prompt_optimizer.md",
        description="帮助用户优化图片生成提示词",
        default=True,
    ),
}


def get_default_skill_id() -> str:
    for sid, sdef in SKILLS.items():
        if sdef.default:
            return sid
    return next(iter(SKILLS))


def load_skill_content(skill_id: str) -> str:
    sdef = SKILLS[skill_id]
    return (SKILLS_DIR / sdef.file).read_text(encoding="utf-8")
```

- [ ] **Step 5: 创建 `prompt_optimizer.md`**

创建 `backend/src/core/skills/prompt_optimizer.md`：

```markdown
---
name: prompt-optimizer
description: 帮助用户将简短描述优化为高质量图片生成提示词
triggers:
  - "优化提示词"
  - "帮我写提示词"
  - "enhance prompt"
default: true
---

# 提示词优化

帮助用户构思高质量的图片生成提示词。遵循以下工作流。

## RULE 1 — 首次交互必须先提问

当用户发送新的图片生成需求时，如果信息不足，你的第一条回复必须是一段简短确认 + ai_block questions 格式。不要直接给提示词。

提问的目的是确认以下关键维度：
- 主体（人物/物体/场景）的具体描述
- 风格（写实/动漫/油画/水彩/3D渲染/像素风...）
- 构图（特写/半身/全景/俯视/仰视...）
- 氛围（光照、色调、情绪）

当用户已经提供了足够信息时（如"帮我优化这个提示词"并附了完整描述），跳过提问直接进入 RULE 3。

## RULE 2 — 基于回答提供方案

收到用户回答后（form_response），使用 ai_block suggestions 格式提供 2-3 个优化后的提示词方案：

- 每个方案有清晰标题和完整英文提示词
- 推荐最匹配用户意图的方案（recommended: true）
- 方案应覆盖不同角度（如不同构图/风格/氛围）
- 如果用户上下文中有参考模板，借鉴其结构和风格

## RULE 3 — 迭代优化

用户选择方案后继续对话调整：
- 用户要求修改特定方面时，只调整该方面
- 用户满意时，提示其使用"直接生成"或"编辑后使用"
- 每次调整后重新提供 ai_block suggestions

## 附件处理

当用户附带图片时：
- 分析图片内容（主体、风格、构图、色调）
- 如果是参考图：提取视觉特征，融入建议的提示词
- 如果是"帮我生成类似的"：反向工程提示词，提供多个风格变体
- 如果是反馈"不像我想要的"：分析差距，调整提示词方向

## 输出协议

### 提问（ai_block）

使用 questions 类型，字段参考：
- widget: text / textarea / radio / select / checkbox
- 每个字段必须有 id、label、required
- radio/select 需要 options 数组
- 问题数量控制在 3-5 个

### 建议方案（ai_block）

使用 suggestions 类型，字段参考：
- 每个方案有 id、title、prompt（完整英文提示词）
- recommended 标记推荐方案
- 提供 2-3 个方案

## 提示词编写规则

- 始终使用英文输出
- 包含：主体描述 + 场景环境 + 光照 + 构图 + 风格 + 镜头语言
- 保持用户原始意图，不添加未要求的内容
- 不要在提示词外输出解释性文字
```

- [ ] **Step 6: 运行测试验证通过**

Run: `cd backend && python -m pytest tests/test_skills_registry.py -v`
Expected: 4 passed

- [ ] **Step 7: 提交**

```bash
git add backend/src/core/skills/ backend/tests/test_skills_registry.py
git commit -m "feat: 添加 Skill 注册表系统和 prompt-optimizer 文档"
```

---

## Task 2: 系统提示词组装器

**Files:**
- Create: `backend/src/core/llm_prompt.py`
- Test: `backend/tests/test_llm_prompt.py`

- [ ] **Step 1: 写全部失败测试**

创建 `backend/tests/test_llm_prompt.py`：

```python
from src.core.llm_prompt import (
    compose_system_prompt,
    _render_context_layer,
    _strip_frontmatter,
)


class TestStripFrontmatter:
    def test_with_frontmatter(self):
        content = "---\nname: test\ndefault: true\n---\n# Title\nBody text"
        result = _strip_frontmatter(content)
        assert result.startswith("# Title")
        assert "Body text" in result
        assert "name: test" not in result

    def test_without_frontmatter(self):
        content = "# Title\nBody text"
        result = _strip_frontmatter(content)
        assert result == content

    def test_empty_frontmatter(self):
        content = "---\n---\nBody"
        result = _strip_frontmatter(content)
        assert result == "Body"

    def test_unclosed_frontmatter(self):
        """未闭合的 frontmatter 视为无 frontmatter，原样返回。"""
        content = "---\nname: test\nBody"
        result = _strip_frontmatter(content)
        assert result == content


class TestRenderContextLayer:
    def test_empty_returns_empty(self):
        result = _render_context_layer(
            user_custom=None,
            aspect_ratio=None,
            size_label=None,
            session_images=None,
        )
        assert result == ""

    def test_user_custom_only(self):
        result = _render_context_layer(
            user_custom="你擅长日系动漫风格",
            aspect_ratio=None,
            size_label=None,
            session_images=None,
        )
        assert "用户自定义指令" in result
        assert "日系动漫风格" in result

    def test_aspect_ratio_and_size(self):
        result = _render_context_layer(
            user_custom=None,
            aspect_ratio="16:9",
            size_label="1536x1024",
            session_images=None,
        )
        assert "生成偏好" in result
        assert "16:9" in result
        assert "1536x1024" in result

    def test_session_images(self):
        images = [
            {"prompt": "A cat on a rooftop, golden hour, cinematic lighting"},
            {"prompt": "Close-up of a cat face, watercolor style"},
        ]
        result = _render_context_layer(
            user_custom=None,
            aspect_ratio=None,
            size_label=None,
            session_images=images,
        )
        assert "当前会话" in result
        assert "2 张图片" in result
        assert "cat on a rooftop" in result

    def test_session_images_truncates_long_prompt(self):
        images = [{"prompt": "A" * 200}]
        result = _render_context_layer(
            user_custom=None,
            aspect_ratio=None,
            size_label=None,
            session_images=images,
        )
        bullet_lines = [l for l in result.split("\n") if l.startswith("- 「")]
        assert len(bullet_lines) == 1
        assert len(bullet_lines[0]) < 120

    def test_all_combined(self):
        images = [{"prompt": "Test prompt"}]
        result = _render_context_layer(
            user_custom="用英文回复",
            aspect_ratio="1:1",
            size_label="1024x1024",
            session_images=images,
        )
        assert "用户自定义指令" in result
        assert "生成偏好" in result
        assert "当前会话" in result


class TestComposeSystemPrompt:
    def test_default_produces_l1_and_l2(self):
        result = compose_system_prompt()
        assert "OpenImage" in result
        assert "提示词优化" in result
        assert "RULE 1" in result

    def test_l1_identity_always_present(self):
        result = compose_system_prompt()
        assert "可用技能" in result
        assert "输出协议" in result

    def test_l2_skill_body_no_frontmatter(self):
        result = compose_system_prompt()
        assert "name: prompt-optimizer" not in result
        assert "default: true" not in result

    def test_l3_context_appended(self):
        result = compose_system_prompt(
            user_custom="用动漫风格",
            aspect_ratio="9:16",
            size_label="1024x1536",
        )
        assert "用户自定义指令" in result
        assert "生成偏好" in result
        assert "9:16" in result

    def test_l4_history_summary(self):
        result = compose_system_prompt(history_summary="用户之前要求生成了一只猫")
        assert "对话摘要" in result
        assert "猫" in result

    def test_layer_separators(self):
        result = compose_system_prompt(user_custom="test")
        parts = result.split("\n\n---\n\n")
        assert len(parts) >= 3  # L1 + L2 + L3 at minimum
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd backend && python -m pytest tests/test_llm_prompt.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'src.core.llm_prompt'`

- [ ] **Step 3: 实现 `llm_prompt.py`**

创建 `backend/src/core/llm_prompt.py`：

```python
from src.core.skills.registry import get_default_skill_id, load_skill_content


BASE_IDENTITY = """你是 OpenImage 的 AI 图片提示词助手。

## 可用技能

- prompt-optimizer: 帮助用户优化图片生成提示词（已激活）

当你需要使用特定技能时，遵循该技能的工作流指令。

## 输出协议

你可以使用 ai_block 结构化输出与用户交互：
- questions 类型：向用户提问，收集关键信息
- suggestions 类型：提供优化后的提示词方案供用户选择

在回复中使用 ```ai-block 标记包裹 JSON 数据。"""


def compose_system_prompt(
    user_custom: str | None = None,
    aspect_ratio: str | None = None,
    size_label: str | None = None,
    session_images: list[dict] | None = None,
    history_summary: str = "",
) -> str:
    parts = []

    # L1: 基础身份
    parts.append(BASE_IDENTITY)

    # L2: Active Skill
    skill_id = get_default_skill_id()
    skill_content = load_skill_content(skill_id)
    if skill_content:
        body = _strip_frontmatter(skill_content)
        parts.append(f"## 技能指令\n\n{body}")

    # L3: 上下文
    context_text = _render_context_layer(
        user_custom=user_custom,
        aspect_ratio=aspect_ratio,
        size_label=size_label,
        session_images=session_images,
    )
    if context_text:
        parts.append(context_text)

    # L4: 历史摘要
    if history_summary:
        parts.append(f"## 对话摘要\n\n{history_summary}")

    return "\n\n---\n\n".join(parts)


def _render_context_layer(
    user_custom: str | None,
    aspect_ratio: str | None,
    size_label: str | None,
    session_images: list[dict] | None,
) -> str:
    parts = []

    if user_custom:
        parts.append(f"## 用户自定义指令\n\n{user_custom}")

    if aspect_ratio or size_label:
        lines = ["## 生成偏好", ""]
        if aspect_ratio:
            lines.append(f"- 比例: {aspect_ratio}")
        if size_label:
            lines.append(f"- 尺寸: {size_label}")
        lines.append("在建议提示词时考虑这些偏好（如 16:9 适合横向场景构图）。")
        parts.append("\n".join(lines))

    if session_images:
        lines = ["## 当前会话", f"本会话已生成 {len(session_images)} 张图片。"]
        recent = session_images[-3:]
        for img in recent:
            prompt_preview = img.get("prompt", "")[:80]
            lines.append(f"- 「{prompt_preview}...」")
        lines.append("用户可能基于这些结果要求调整或迭代。")
        parts.append("\n".join(lines))

    return "\n\n---\n\n".join(parts)


def _strip_frontmatter(content: str) -> str:
    if content.startswith("---"):
        end = content.find("---", 3)
        if end != -1:
            return content[end + 3 :].strip()
    return content
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd backend && python -m pytest tests/test_llm_prompt.py -v`
Expected: 14 passed

- [ ] **Step 5: 运行全部后端测试确认无回归**

Run: `cd backend && python -m pytest tests/ -v`
Expected: ALL passed

- [ ] **Step 6: 提交**

```bash
git add backend/src/core/llm_prompt.py backend/tests/test_llm_prompt.py
git commit -m "feat: 添加 4 层系统提示词组装器"
```

---

## Task 3: 后端 Chat 端点集成

**Files:**
- Modify: `backend/src/api/llm_chat.py` — 添加 `ChatContext` 模型（约第 42 行），修改 `chat()` 端点（约第 256-265 行）

- [ ] **Step 1: 添加 `ChatContext` 模型并扩展 `ChatRequest`**

在 `backend/src/api/llm_chat.py` 中，在 `ChatRequest` 类之前（第 42 行）添加 `ChatContext`，然后修改 `ChatRequest`：

将第 42-45 行：

```python
class ChatRequest(BaseModel):
    content: str
    attachments: list[dict] | None = None
    form_response: dict | None = None
```

替换为：

```python
class ChatContext(BaseModel):
    aspect_ratio: str | None = None
    size_label: str | None = None


class ChatRequest(BaseModel):
    content: str
    attachments: list[dict] | None = None
    form_response: dict | None = None
    context: ChatContext | None = None
```

- [ ] **Step 2: 修改 `chat()` 端点**

在 `backend/src/api/llm_chat.py` 的 `chat()` 函数中，替换系统提示词获取和消息构建（第 256-265 行）。

将：

```python
    # 获取系统提示词
    system_prompt = request.app.state.llm_settings.get("llm_system_prompt", "")

    # 构建消息列表
    messages = llm_client.build_messages(
        system_prompt=system_prompt or "你是一个专业的图片提示词助手。",
        history=history[:-1],  # 排除刚保存的用户消息（build_messages 会添加）
        user_content=body.content,
        attachments=body.attachments or [],
    )
```

替换为：

```python
    from src.core.llm_prompt import compose_system_prompt

    # 查询当前会话图片（用于 L3 上下文注入）
    cursor = await conn.execute(
        "SELECT prompt FROM images WHERE session_id = ? ORDER BY created_at DESC LIMIT 5",
        (session_row[0],),
    )
    img_rows = await cursor.fetchall()
    session_images = [{"prompt": r[0]} for r in img_rows] if img_rows else None

    # 组装 4 层系统提示词
    user_custom = request.app.state.llm_settings.get("llm_system_prompt") or None
    system_prompt = compose_system_prompt(
        user_custom=user_custom,
        aspect_ratio=body.context.aspect_ratio if body.context else None,
        size_label=body.context.size_label if body.context else None,
        session_images=session_images,
    )

    # 构建消息列表
    messages = llm_client.build_messages(
        system_prompt=system_prompt,
        history=history[:-1],
        user_content=body.content,
        attachments=body.attachments or [],
    )
```

- [ ] **Step 3: 运行全部后端测试确认无回归**

Run: `cd backend && python -m pytest tests/ -v`
Expected: ALL passed

- [ ] **Step 4: 提交**

```bash
git add backend/src/api/llm_chat.py
git commit -m "feat: chat 端点集成 4 层系统提示词组装"
```

---

## Task 4: 前端类型扩展

**Files:**
- Modify: `frontend/src/types/index.ts` — 在 `LLMChatRequest` 接口之前添加 `ChatContext`，扩展 `LLMChatRequest`

- [ ] **Step 1: 添加 `ChatContext` 并扩展 `LLMChatRequest`**

将 `frontend/src/types/index.ts` 第 168-172 行：

```typescript
export interface LLMChatRequest {
  content: string;
  attachments?: Array<{ data: string; media_type: string }>;
  form_response?: Record<string, string>;
}
```

替换为：

```typescript
export interface ChatContext {
  aspect_ratio?: string;
  size_label?: string;
}

export interface LLMChatRequest {
  content: string;
  attachments?: Array<{ data: string; media_type: string }>;
  form_response?: Record<string, string>;
  context?: ChatContext;
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add frontend/src/types/index.ts
git commit -m "feat: 扩展 LLMChatRequest 支持 ChatContext"
```

---

## Task 5: 前端 Store 集成

**Files:**
- Modify: `frontend/src/stores/llmChatStore.ts` — 导入 `generationStore`，在 `sendMessage` 中构建 `context`

- [ ] **Step 1: 添加 `generationStore` 导入**

在 `frontend/src/stores/llmChatStore.ts` 文件顶部导入区（第 3 行之后）添加：

```typescript
import { useGenerationStore, SIZE_MAP } from "./generationStore";
```

- [ ] **Step 2: 修改 `sendMessage` 构建 context**

在 `sendMessage` 函数体（第 108 行起），在 `set({ streamingText: ... })` 之前添加 context 构建，并在 `api.sendLLMChat` 调用中传递 `context`。

将第 108-131 行的 `sendMessage` 函数体：

```typescript
  sendMessage: (content, attachments, formResponse) => {
    const { currentChatSessionId } = get();
    if (!currentChatSessionId) return;

    set({
      streamingText: "",
      bufferingState: "streaming",
      currentAiBlock: null,
    });

    const tempUserMsg: LLMMessage = {
      id: `temp_${Date.now()}`,
      chat_session_id: currentChatSessionId,
      role: "user",
      content,
      ai_block: null,
      token_count: 0,
      attachments: attachments ? JSON.stringify(attachments) : null,
      created_at: new Date().toISOString(),
      deleted_at: null,
    };
    set((s) => ({ messages: [...s.messages, tempUserMsg] }));

    const controller = api.sendLLMChat(
      currentChatSessionId,
      { content, attachments, form_response: formResponse },
```

替换为：

```typescript
  sendMessage: (content, attachments, formResponse) => {
    const { currentChatSessionId } = get();
    if (!currentChatSessionId) return;

    // 从 generationStore 读取当前生成偏好
    const gen = useGenerationStore.getState();
    const context = {
      aspect_ratio: gen.aspectRatio,
      size_label: SIZE_MAP[gen.aspectRatio]?.[gen.imageSize] || undefined,
    };

    set({
      streamingText: "",
      bufferingState: "streaming",
      currentAiBlock: null,
    });

    const tempUserMsg: LLMMessage = {
      id: `temp_${Date.now()}`,
      chat_session_id: currentChatSessionId,
      role: "user",
      content,
      ai_block: null,
      token_count: 0,
      attachments: attachments ? JSON.stringify(attachments) : null,
      created_at: new Date().toISOString(),
      deleted_at: null,
    };
    set((s) => ({ messages: [...s.messages, tempUserMsg] }));

    const controller = api.sendLLMChat(
      currentChatSessionId,
      { content, attachments, form_response: formResponse, context },
```

注意：只修改了两处——添加了 context 构建代码（3 行），以及在 `sendLLMChat` 的 body 参数中添加了 `context`。其余 handler 代码不变。

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: 提交**

```bash
git add frontend/src/stores/llmChatStore.ts
git commit -m "feat: sendMessage 携带生成偏好上下文"
```
