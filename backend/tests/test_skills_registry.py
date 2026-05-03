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
