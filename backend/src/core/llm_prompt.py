"""4 层系统提示词组装器 — 身份 / 技能 / 上下文 / 历史。"""
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
            prompt = img.get("prompt", "")
            prompt_preview = prompt[:77] + "..." if len(prompt) > 80 else prompt
            lines.append(f"- 「{prompt_preview}」")
        lines.append("用户可能基于这些结果要求调整或迭代。")
        parts.append("\n".join(lines))

    return "\n\n---\n\n".join(parts)


def _strip_frontmatter(content: str) -> str:
    if content.startswith("---"):
        end = content.find("---", 3)
        if end != -1:
            return content[end + 3 :].strip()
    return content
