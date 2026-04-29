"""
调用智谱 GLM-5V-Turbo 对比两张 UI 截图的差异
用法: python scripts/compare_ui.py <参考图> <实际图>
"""

import base64
import sys
import os
import json
import httpx

API_URL = "https://www.packyapi.com/v1/chat/completions"
MODEL = "gemini-3.1-pro-preview"


def encode_image(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def compare(ref_path: str, actual_path: str):
    api_key = os.environ.get("GEMINI_ROUTER_API_KEY")
    if not api_key:
        print("Error: GEMINI_ROUTER_API_KEY 环境变量未设置")
        sys.exit(1)

    print(f"参考图: {ref_path}")
    print(f"实际图: {actual_path}")
    print("正在编码图片...")

    ref_b64 = encode_image(ref_path)
    actual_b64 = encode_image(actual_path)

    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{ref_b64}"}},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{actual_b64}"}},
                    {
                        "type": "text",
                        "text": (
                            "⚠️ 图片顺序说明：你收到的图片按严格顺序排列：\n"
                            "- 【图片 A】= 参考设计（目标效果，来自 references/ref.png）\n"
                            "- 【图片 B】= 实际实现（迁移后的代码渲染效果，来自 references/current.png）\n\n"
                            "我正在做前端 UI 样式迁移，需要你对比【图片 A】和【图片 B】的 **视觉样式差异**。\n\n"
                            "⚠️ 重要约束：\n"
                            "- 两张图里的生成图片内容、数量、文字内容不同是正常的，**完全忽略**这些差异\n"
                            "- 不要分析图片里显示的生成内容（手机照片 vs 风景照等），这些不是 UI 问题\n"
                            "- **只关注 UI 框架本身的样式**：边距、间距、颜色、字体、圆角、阴影、组件大小等\n\n"
                            "请重点分析以下维度：\n"
                            "1. **边距与间距**：sidebar 宽度、各区域 padding/margin、元素之间的 gap、卡片间距\n"
                            "2. **颜色差异**：背景色、侧边栏色、卡片色、文字色、强调色、边框色是否与参考一致\n"
                            "3. **字体样式**：字体族、各处字号、字重（粗细）\n"
                            "4. **组件尺寸与样式**：按钮大小/圆角/阴影、输入框高度/边框、卡片圆角/边框粗细、图标大小\n"
                            "5. **布局比例**：三栏宽度比例、顶部栏高度、输入区域高度\n\n"
                            "请输出 JSON 数组，每项格式：\n"
                            '{"area": "UI 区域", "aspect": "边距|颜色|字体|尺寸|布局", '
                            '"expected": "参考设计（图片A）的值/描述", '
                            '"actual": "实际实现（图片B）的值/描述", '
                            '"severity": "high|medium|low"}\n\n'
                            "先给简要总结（聚焦样式，不提内容差异），然后输出 JSON。"
                        ),
                    },
                ],
            }
        ],
    }

    print(f"调用 {MODEL}...")
    resp = httpx.post(
        API_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=180,
    )

    if resp.status_code != 200:
        print(f"API 错误 {resp.status_code}: {resp.text}")
        sys.exit(1)

    data = resp.json()
    msg = data["choices"][0]["message"]

    if msg.get("reasoning_content"):
        print("\n=== 思考过程 ===")
        print(msg["reasoning_content"])

    print("\n=== 分析结果 ===")
    print(msg.get("content", "(无内容)"))


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(f"用法: python {sys.argv[0]} <参考图路径> <实际图路径>")
        sys.exit(1)
    compare(sys.argv[1], sys.argv[2])
