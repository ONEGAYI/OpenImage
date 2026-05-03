# LLM 系统提示词分层架构与 Skill 系统设计

> 编写日期：2026-05-03
> 状态：已批准

## 背景

OpenImage 已有 LLM AI 聊天助手（ChatPanel + ai_block 协议），但系统提示词是一个单一扁平字符串（默认 `"你是一个专业的图片提示词助手。"`），缺少分层注入、上下文感知、工作流编排和可扩展性。

本设计借鉴 [Open Design 提示词系统](../../references/open-design-prompt-system-research.md) 的分层组装模式，适配 OpenImage 无 agent 层的架构，建立一套可扩展的系统提示词分层架构 + Skill 工作流系统。

## 设计目标

1. 增强现有 ChatPanel 聊天助手的智能程度
2. 建立分层系统提示词组装机制，支持上下文动态注入
3. 引入 Skill 文档驱动的工作流系统（当前固定 prompt-optimizer，未来可扩展）
4. 预留历史压缩/滑动窗口和渐进式 Skill 披露的扩展口
5. 最大化 prompt caching 命中率

## 核心架构：4 层系统提示词

后端 `compose_system_prompt()` 函数按优先级从高到低（先注入 = 基础，后注入 = 覆盖/补充）拼接 4 层：

```
┌─────────────────────────────────────────┐
│ L1 基础身份（最高优先级，最先注入）         │  ← 代码常量，永不变
├─────────────────────────────────────────┤
│ L2 Active Skill 工作流指令                │  ← skills/*.md，低频变化
├─────────────────────────────────────────┤
│ L3 用户上下文                            │  ← 偏好 + 模板 + 用户自定义 + 会话状态
├─────────────────────────────────────────┤
│ L4 历史摘要（最低优先级，最后注入）         │  ← 预留：未来压缩/滑动窗口
└─────────────────────────────────────────┘

最终 messages[0] = { role: "system", content: L1 + L2 + L3 + L4 }
Messages: [history turn 1][turn 2]...[current user msg]
```

### 拼接规则

- 每层之间用 `\n\n---\n\n` 分隔，带 `## 标题` 段落标记
- 外层使用 Markdown 自然语言指令，内部结构化数据使用 JSON
- 层内按稳定性排列：稳定内容在前，动态内容在后，最大化 prompt caching 前缀命中

### 缓存命中分析

| 层 | Token 估算 | 跨请求稳定 | 缓存级别 |
|---|---|---|---|
| L1 身份 | ~300t | 永远 | 最高 |
| L2 Skill | ~800t | 同 skill 下 | 高 |
| L3 上下文 | ~200t | 同设置+同会话 | 中 |
| L4 摘要 | 0（预留） | 同会话内增长 | 低 |

---

## L1：基础身份

代码内固定常量，包含：
- AI 身份声明
- 技能目录（名称 + 一句话描述），为未来渐进式披露预留
- ai_block 输出协议概述
- skill_request 协议说明（未来启用）

```python
BASE_IDENTITY = """你是 OpenImage 的 AI 图片提示词助手。

## 可用技能
- prompt-optimizer: 帮助用户优化图片生成提示词（已激活）

当你需要使用特定技能时，遵循该技能的工作流指令。

## 输出协议
你可以使用 ai_block 结构化输出与用户交互：
- questions 类型：向用户提问，收集关键信息
- suggestions 类型：提供优化后的提示词方案供用户选择

在回复中使用 ```ai-block 标记包裹 JSON 数据。
"""
```

### 渐进式 Skill 披露（未来扩展）

当技能数量增多时，L1 演进为：

```
可用技能目录：
1. prompt-optimizer — 优化提示词（已激活）
2. style-analyzer — 分析图片风格
3. scene-composer — 场景构思

当你需要使用未激活的技能时，发出 skill_request：
```ai-block
{"type": "skill_request", "skill_id": "style-analyzer"}
```
系统会在下一轮加载该技能的完整指令。
```

后端中间件拦截 `skill_request` ai_block，加载对应 skill 文档，注入下一轮对话。

---

## L2：Active Skill 工作流指令

### Skill 文档格式

每个 Skill 是一个 Markdown 文件（`backend/src/core/skills/*.md`），包含：
- **YAML frontmatter**：元数据（name、description、triggers、default）
- **Markdown body**：结构化工作流步骤和输出协议说明

格式借鉴 Open Design 的 `SKILL.md` 模式，适配 OpenImage 的 ai_block 协议。

### 第一个 Skill：prompt-optimizer

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

当用户发送新的图片生成需求时，如果信息不足，你的第一条回复必须是
一段简短确认 + ai_block questions 格式。不要直接给提示词。

提问的目的是确认以下关键维度：
- 主体（人物/物体/场景）的具体描述
- 风格（写实/动漫/油画/水彩/3D渲染/像素风...）
- 构图（特写/半身/全景/俯视/仰视...）
- 氛围（光照、色调、情绪）

当用户已经提供了足够信息时（如"帮我优化这个提示词"并附了完整描述），
跳过提问直接进入 RULE 3。

## RULE 2 — 基于回答提供方案

收到用户回答后（form_response），使用 ai_block suggestions 格式
提供 2-3 个优化后的提示词方案：

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

### 技能注册表

```python
# backend/src/core/skills/registry.py
from dataclasses import dataclass
from pathlib import Path

SKILLS_DIR = Path(__file__).parent

@dataclass
class SkillDef:
    name: str           # 显示名称
    file: str           # Markdown 文件名
    description: str    # 一句话描述
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

---

## L3：用户上下文

### 数据来源

| 数据 | 来源 | 变化频率 |
|------|------|----------|
| 用户自定义指令 | 后端 DB `llm_system_prompt` 设置 | 设置变更时 |
| 比例/尺寸偏好 | 前端 generationStore → ChatRequest.context | 会话内稳定 |
| 提示词模板参考 | 未来：前端选择后推送 | 用户操作时变 |
| 当前会话图片 | 后端 DB 查询 session_images | 每轮可能变 |

### ChatRequest 扩展

```python
class ChatContext(BaseModel):
    """前端推送的上下文元数据"""
    aspect_ratio: str | None = None      # "1:1", "16:9", "9:16"
    size_label: str | None = None        # "1024×1024", "1536×1024"
    active_template_id: str | None = None # 未来的模板 ID

class ChatRequest(BaseModel):
    content: str
    attachments: list[dict] | None = None
    form_response: dict | None = None
    context: ChatContext | None = None   # 新增
```

### L3 组装逻辑

```python
def _render_context_layer(
    user_custom: str | None,
    context: ChatContext | None,
    session_images: list[dict] | None,
) -> str:
    parts = []

    # 用户自定义指令（最稳定）
    if user_custom:
        parts.append(f"## 用户自定义指令\n\n{user_custom}")

    # 生成偏好（会话内稳定）
    if context and (context.aspect_ratio or context.size_label):
        lines = ["## 生成偏好", ""]
        if context.aspect_ratio:
            lines.append(f"- 比例: {context.aspect_ratio}")
        if context.size_label:
            lines.append(f"- 尺寸: {context.size_label}")
        lines.append("在建议提示词时考虑这些偏好（如 16:9 适合横向场景构图）。")
        parts.append("\n".join(lines))

    # 当前会话图片摘要（每轮可能变）
    if session_images:
        lines = ["## 当前会话", f"本会话已生成 {len(session_images)} 张图片。"]
        recent = session_images[-3:]
        for img in recent:
            prompt_preview = img.get("prompt", "")[:80]
            lines.append(f"- 「{prompt_preview}...」")
        lines.append("用户可能基于这些结果要求调整或迭代。")
        parts.append("\n".join(lines))

    return "\n\n---\n\n".join(parts)
```

### L3 注入效果示例

```
---

## 用户自定义指令

你擅长日系动漫风格，优先使用 anime、cel shading 等关键词。

---

## 生成偏好

- 比例: 16:9
- 尺寸: 1536×1024

在建议提示词时考虑这些偏好（如 16:9 适合横向场景构图）。

---

## 当前会话

本会话已生成 3 张图片。
- 「A majestic orange tabby cat sitting on a traditional slate rooftop...」
- 「Close-up of a cat's face, golden hour lighting, shallow depth of...」
- 「A white cat lounging on a windowsill, soft morning light, watercolor...」

用户可能基于这些结果要求调整或迭代。
```

---

## L4：历史摘要（预留）

当前返回空字符串，完整历史走标准 messages 数组。

### 未来实现路径

1. 后端检测对话超过 N 轮（如 10 轮）
2. 用 LLM 将旧轮次压缩为结构化摘要
3. 摘要填入 L4，旧轮次从 messages 数组移除
4. 摘要格式：

```markdown
## 对话摘要

用户最初要求生成一只猫的图片，经过 3 轮迭代：
- 第 1 轮：橘猫屋顶 → 用户觉得太暗
- 第 2 轮：调整为暖光 → 用户满意但想换白猫
- 第 3 轮：白猫窗台 → 用户正在评估
```

---

## 组装器：compose_system_prompt()

```python
# backend/src/core/llm_prompt.py

from src.core.skills.registry import get_default_skill_id, load_skill_content

BASE_IDENTITY = """你是 OpenImage 的 AI 图片提示词助手。

## 可用技能
- prompt-optimizer: 帮助用户优化图片生成提示词（已激活）

当你需要使用特定技能时，遵循该技能的工作流指令。

## 输出协议
你可以使用 ai_block 结构化输出与用户交互：
- questions 类型：向用户提问，收集关键信息
- suggestions 类型：提供优化后的提示词方案供用户选择

在回复中使用 ```ai-block 标记包裹 JSON 数据。
"""


def compose_system_prompt(
    user_custom: str | None = None,
    context: ChatContext | None = None,
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
        # 去掉 YAML frontmatter，只取 Markdown body
        body = _strip_frontmatter(skill_content)
        parts.append(f"## 技能指令\n\n{body}")

    # L3: 上下文
    context_text = _render_context_layer(user_custom, context, session_images)
    if context_text:
        parts.append(context_text)

    # L4: 历史摘要
    if history_summary:
        parts.append(f"## 对话摘要\n\n{history_summary}")

    return "\n\n---\n\n".join(parts)


def _strip_frontmatter(content: str) -> str:
    """去掉 YAML frontmatter（--- ... ---），返回 Markdown body。"""
    if content.startswith("---"):
        end = content.find("---", 3)
        if end != -1:
            return content[end + 3:].strip()
    return content
```

---

## 与现有代码的集成点

| 现有文件 | 改动 |
|---------|------|
| `backend/src/api/llm_chat.py` `chat()` 端点 | 用 `compose_system_prompt()` 替换直接读取 `llm_system_prompt`；扩展 `ChatRequest` 接收 `context`；查询 session_images |
| `backend/src/core/llm_client.py` | `build_messages()` 无需改动（已支持 system_prompt 参数） |
| `backend/src/api/llm_settings.py` | 无改动（`llm_system_prompt` 仍作为 L3 的用户自定义来源） |
| `frontend/src/stores/llmChatStore.ts` | `sendMessage()` 从 generationStore 读取比例/尺寸，填充 `context` 字段 |
| `frontend/src/services/api.ts` | `sendLLMChat()` 传递 `context` 字段 |

### 新增文件

```
backend/src/core/
├── llm_prompt.py              # compose_system_prompt() + 辅助函数
└── skills/
    ├── __init__.py
    ├── registry.py            # 技能注册表 + 加载函数
    └── prompt_optimizer.md    # 第一个 skill 文档
```

---

## 提示词模板库（未来扩展）

当前设计中 `ChatContext.active_template_id` 为预留字段。未来实现时：

1. 后端维护 `prompt-templates/` JSON 文件（参考 Open Design 的 93 个模板）
2. `GET /api/prompt-templates` 端点提供模板列表
3. 前端新增模板选择器 UI
4. 用户选择模板后，模板内容注入 L3 作为参考：

```markdown
## 参考提示词模板 — "动漫角色立绘"
category: Anime · suggested model: gpt-image-2 · aspect: 1:1

用户选择了此模板作为参考。借鉴其结构、风格和措辞，
但适应用户的实际需求。不要照搬模板主题。

```text
An anime-style character illustration of {character_description}...
```
```

## 不实施的部分

| Open Design 特性 | 不实施原因 |
|------------------|-----------|
| 6 层提示词叠加 | 4 层已足够，无 agent 层 |
| Agent 适配器（12 种） | OpenImage 不使用外部 agent CLI |
| 媒体生成契约 | 直接 API 调用，无需 shell 解耦 |
| 设计系统 DESIGN.md | 图片生成不需要前端设计 token |
| stdin 管道注入 | 不涉及 CLI 进程间通信 |
| `<question-form>` HTML 标签 | 已有 ai_block JSON 协议 |
| `derivePreflight()` 资源预加载 | 当前无文件引用需求 |
