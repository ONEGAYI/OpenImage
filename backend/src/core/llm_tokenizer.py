"""Token 近似估算模块。

策略：
- 英文/ASCII：约 4 字符 ≈ 1 token
- 中文/CJK：每字符 ≈ 1.5 tokens
- 混合内容：分别计算后累加
"""
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
