"""Token 近似估算模块。

策略：
- 英文/ASCII：约 4 字符 ≈ 1 token
- 中文/CJK：每字符 ≈ 1.5 tokens
- 混合内容：分别计算后累加
"""
import json
import re

_CJK_PATTERN = re.compile(r'[一-鿿　-〿＀-￯]')


def estimate_tokens(text: str) -> int:
    """估算文本的 token 数量。"""
    if not text:
        return 0

    cjk_chars = _CJK_PATTERN.findall(text)
    cjk_count = len(cjk_chars)

    non_cjk_text = _CJK_PATTERN.sub('', text)
    non_cjk_count = len(non_cjk_text)

    cjk_tokens = int(cjk_count * 1.5)
    non_cjk_tokens = max(1, non_cjk_count // 4) if non_cjk_count > 0 else 0

    return cjk_tokens + non_cjk_tokens


def estimate_message_tokens(
    role: str,
    content: str | None = None,
    thinking_content: str | None = None,
    ai_block: dict | None = None,
    saved_token_count: int = 0,
) -> int:
    """估算单条消息的完整 token 数（取估算值与已保存值的较大值）。

    assistant 消息涵盖 content + thinking + ai_block；
    其他角色仅计算 content。
    """
    if role == "assistant":
        est = estimate_tokens(content or "")
        if thinking_content:
            est += estimate_tokens(thinking_content)
        if ai_block:
            est += estimate_tokens(json.dumps(ai_block, ensure_ascii=False))
        return max(saved_token_count, est)
    if saved_token_count > 0:
        return saved_token_count
    return estimate_tokens(content or "")
