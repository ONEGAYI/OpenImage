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
