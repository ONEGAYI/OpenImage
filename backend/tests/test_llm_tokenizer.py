from src.core.llm_tokenizer import estimate_tokens


def test_estimate_pure_ascii():
    """纯英文：约 4 字符 = 1 token"""
    tokens = estimate_tokens("Hello world this is a test")
    assert 5 <= tokens <= 10


def test_estimate_pure_chinese():
    """纯中文：每字符约 1-2 tokens"""
    tokens = estimate_tokens("你好世界测试")
    assert 5 <= tokens <= 12


def test_estimate_mixed():
    """中英混合"""
    tokens = estimate_tokens("Hello 你好 world 世界")
    assert tokens > 0


def test_estimate_empty():
    """空字符串返回 0"""
    assert estimate_tokens("") == 0


def test_estimate_long_text():
    """长文本估算合理性"""
    text = "这是一个比较长的文本，用来测试token估算在较长内容上的表现。" * 10
    tokens = estimate_tokens(text)
    assert tokens > 100
