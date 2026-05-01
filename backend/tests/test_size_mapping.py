import pytest
from src.api.generate import resolve_size, detect_closest_ratio, SIZE_TABLE


class TestResolveSize:
    def test_1x1_1k(self):
        assert resolve_size("1:1", "1K") == "1024x1024"

    def test_1x1_4k(self):
        assert resolve_size("1:1", "4K") == "2880x2880"

    def test_16x9_2k(self):
        assert resolve_size("16:9", "2K") == "2048x1152"

    def test_9x16_1k(self):
        assert resolve_size("9:16", "1K") == "1024x1536"

    def test_all_combinations_valid(self):
        """所有组合返回的尺寸边长都是 16 的倍数（gpt-image-2 要求）"""
        for ratio, tiers in SIZE_TABLE.items():
            for tier, size in tiers.items():
                w, h = size.split("x")
                assert int(w) % 16 == 0, f"{ratio}/{tier}: {w} 不是 16 的倍数"
                assert int(h) % 16 == 0, f"{ratio}/{tier}: {h} 不是 16 的倍数"

    def test_invalid_ratio_raises(self):
        with pytest.raises(KeyError):
            resolve_size("4:3", "1K")

    def test_invalid_tier_raises(self):
        with pytest.raises(KeyError):
            resolve_size("1:1", "8K")


class TestDetectClosestRatio:
    def test_exact_square(self):
        assert detect_closest_ratio(1024, 1024) == "1:1"

    def test_exact_16x9(self):
        assert detect_closest_ratio(1920, 1080) == "16:9"

    def test_exact_9x16(self):
        assert detect_closest_ratio(1080, 1920) == "9:16"

    def test_near_square(self):
        """接近正方形的图片应识别为 1:1"""
        assert detect_closest_ratio(1100, 1000) == "1:1"

    def test_landscape(self):
        """横向图片应识别为 16:9"""
        assert detect_closest_ratio(1536, 1024) == "16:9"

    def test_portrait(self):
        """纵向图片应识别为 9:16"""
        assert detect_closest_ratio(1024, 1536) == "9:16"


class TestInpaintSizeCalculation:
    """测试 Inpaint 从源图尺寸自动计算 params.size"""

    def test_inpaint_size_square(self):
        """正方形源图应映射到 1:1 1K"""
        from src.api.inpaint import _inpaint_size_from_source
        assert _inpaint_size_from_source(1024, 1024, "1K") == "1024x1024"

    def test_inpaint_size_landscape(self):
        """横向源图应映射到 16:9 2K"""
        from src.api.inpaint import _inpaint_size_from_source
        assert _inpaint_size_from_source(1920, 1080, "2K") == "2048x1152"

    def test_inpaint_size_portrait(self):
        """纵向源图应映射到 9:16 1K"""
        from src.api.inpaint import _inpaint_size_from_source
        assert _inpaint_size_from_source(1080, 1920, "1K") == "1024x1536"

    def test_inpaint_size_non_standard(self):
        """非标准尺寸源图应检测最接近比例"""
        from src.api.inpaint import _inpaint_size_from_source
        # 800x600 ≈ 1.33，最接近 1:1（差 0.33）而非 16:9（差 0.44）
        assert _inpaint_size_from_source(800, 600, "1K") == "1024x1024"

    def test_inpaint_size_default_tier(self):
        """不传 tier 默认使用 1K"""
        from src.api.inpaint import _inpaint_size_from_source
        assert _inpaint_size_from_source(1536, 1024) == "1536x1024"
