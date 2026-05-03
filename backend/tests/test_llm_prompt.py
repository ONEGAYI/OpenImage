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
