#!/usr/bin/env python3
"""
Prompt-to-Skill Engine
Converts plain-language business requirements into structured Agent Skills.
"""
import json
import sys
import re
from typing import Dict, Any

# ============================================================
# Built-in LLM Simulator (production: replace with API call)
# ============================================================

SKILL_TEMPLATE = """
## Role
{role}

## Profile
- Author: Prompt-to-Skill Agent
- Version: 1.0
- Language: 中文 / English
- Description: {description}

## Constraints
{constraints}

## Workflow
{workflow}

## Few-shots
{few_shots}

## Initialization
{initialization}
"""

SKILL_SCHEMA = {
    "role": str,
    "description": str,
    "constraints": list,
    "workflow": list,
    "few_shots": list,
    "initialization": str,
}

# Pre-built skill templates for common categories
CATEGORY_TEMPLATES = {
    "财务": {
        "role": "你是一个专业的财务自动化处理专家 Agent，精通发票处理、对账、报销审核等财务工作流程。",
        "constraints": [
            "金额精度保留2位小数",
            "日期格式统一为YYYY-MM-DD",
            "所有财务数据必须经过双重校验",
            "处理结果需要生成审计日志"
        ],
        "workflow": [
            "接收并解析用户输入的财务业务诉求",
            "识别业务类型（发票对账/报销审核/账目汇总等）",
            "提取关键财务要素（金额、日期、方名、科目）",
            "执行对应财务处理逻辑",
            "生成结构化财务报告"
        ],
        "few_shots": [
            {"input": "帮我自动给发票对账", "output": "已识别发票对账任务，将逐行比对发票与系统记录"},
            {"input": "审核这批报销单", "output": "正在执行报销合规性检查，共N笔等待审核"}
        ],
        "initialization": "欢迎使用财务自动化Agent。请描述您的财务处理需求，我将自动转换为可执行任务。"
    },
    "数据": {
        "role": "你是一个资深数据处理与分析专家 Agent，擅长数据采集、清洗、转换、分析和可视化。",
        "constraints": [
            "数据源必须明确来源和时效性",
            "数据处理过程需记录每个步骤的转换逻辑",
            "异常值处理策略需明确标注",
            "输出格式需包含数据字典说明"
        ],
        "constraints_list": "数据处理必须记录完整的血缘关系\n异常值需标注处理策略\n输出带数据字典说明",
        "workflow": [
            "明确数据源和数据范围",
            "执行数据质量检查（空值、异常值、格式校验）",
            "按业务规则进行数据转换",
            "执行分析逻辑",
            "生成可视化报告/数据文件"
        ],
        "few_shots": [
            {"input": "把上个月的销售数据做个分析报表", "output": "已启动销售数据分析，将产出Excel报表+可视化看板"},
            {"input": "清洗一下客户名单数据", "output": "正在执行数据清洗：去重、格式化、异常值处理"}
        ],
        "initialization": "欢迎使用数据处理Agent。请告诉我您需要处理的数据和分析需求。"
    },
    "开发": {
        "role": "你是一个全栈软件开发专家 Agent，精通需求分析、架构设计、编码实现和技术文档编写。",
        "constraints": [
            "代码需遵循PEP8（Python）或对应语言规范",
            "必须包含单元测试",
            "API设计需符合RESTful最佳实践",
            "关键模块需添加注释说明",
            "交付物需包含部署说明"
        ],
        "constraints_list": "代码遵循PEP8规范\n必须含单元测试\nAPI符合RESTful规范\n关键模块有注释\n附带部署说明",
        "workflow": [
            "需求分析：理解业务诉求并拆解为技术任务",
            "架构设计：确定技术栈和系统架构",
            "编码实现：按任务列表依次实现功能模块",
            "测试验证：执行单元测试和集成测试",
            "文档编写：编写使用说明和部署文档"
        ],
        "few_shots": [
            {"input": "帮我写一个用户登录模块", "output": "已规划登录模块：JWT认证+密码加密+Session管理，开始编码"},
            {"input": "给这个数据库加个缓存层", "output": "已设计Redis缓存方案，命中率预计提升60%"}
        ],
        "initialization": "欢迎使用全栈开发Agent。请描述您的开发需求，我将自动拆解为工程任务并开始实施。"
    },
    "文案": {
        "role": "你是一个创意文案与内容营销专家 Agent，精通品牌文案、社交媒体内容、SEO优化和营销策略。",
        "constraints": [
            "内容需符合品牌调性",
            "标题长度不超过30字",
            "必须包含明确的行动号召（CTA）",
            "社交媒体内容需适配平台格式",
            "SEO关键词密度控制在1-3%"
        ],
        "constraints_list": "符合品牌调性\n标题≤30字\n含CTA\n适配平台格式\nSEO关键词密度1-3%",
        "workflow": [
            "分析目标受众和内容目的",
            "确定内容策略和调性",
            "创作初稿内容",
            "优化SEO/平台适配",
            "最终审核和定稿"
        ],
        "few_shots": [
            {"input": "写一篇AI工具推荐的小红书文案", "output": "已生成种草文案初稿，含5个AI工具推荐+使用心得"},
            {"input": "给新产品想个Slogan", "output": "已产出10个Slogan方案，覆盖不同品牌调性"}
        ],
        "initialization": "欢迎使用文案创作Agent。请告诉我需要什么类型的内容和营销目标。"
    },
    "通用": {
        "role": "你是一个多领域通用任务处理 Agent，能够理解和执行各类结构化工作任务。",
        "constraints": [
            "输出结果需结构化呈现",
            "复杂任务需分步骤说明",
            "引用来源需标注清晰"
        ],
        "constraints_list": "结果结构化输出\n复杂任务分步骤\n引用来源需标注",
        "workflow": [
            "理解任务目标和预期输出格式",
            "拆解任务为可执行的子步骤",
            "按顺序执行每个子步骤",
            "整合结果并格式化为目标输出",
            "进行质量检查和修正"
        ],
        "few_shots": [
            {"input": "帮我分析一下这个市场报告", "output": "正在分析报告关键维度：市场规模、竞争格局、增长趋势"},
            {"input": "能不能总结一下今天的新闻", "output": "已抓取今日要闻并按领域分类汇总"}
        ],
        "initialization": "欢迎使用通用任务处理Agent。请描述您的需求，我将自动规划并执行。"
    }
}


def classify_prompt(prompt: str) -> str:
    """Classify prompt into a category for template selection."""
    keywords = {
        "财务": ["发票", "对账", "报销", "财务", "账", "税", "审计", "付款"],
        "数据": ["数据", "分析", "报表", "清洗", "采集", "统计", "ETL", "BI"],
        "开发": ["开发", "代码", "API", "接口", "系统", "模块", "数据库", "部署", "前端", "后端"],
        "文案": ["文案", "内容", "文章", "推广", "营销", "SEO", "种草", "品牌"],
    }
    
    scores = {}
    for cat, words in keywords.items():
        scores[cat] = sum(1 for w in words if w in prompt)
    
    if max(scores.values()) > 0:
        return max(scores, key=scores.get)
    return "通用"


def extract_constraints_from_prompt(prompt: str, template: dict) -> str:
    """Extract additional constraints from the user prompt."""
    extra = []
    
    # Detect specific requirements
    if "python" in prompt.lower():
        extra.append("使用Python语言实现")
    if "web" in prompt.lower() or "网页" in prompt:
        extra.append("需提供Web界面")
    if "API" in prompt or "接口" in prompt:
        extra.append("需提供RESTful API")
    if "实时" in prompt:
        extra.append("需支持实时处理")
    if "自动" in prompt:
        extra.append("需实现全自动化流程")
    
    base = template.get("constraints_list", "")
    if extra:
        base += "\n" + "\n".join(extra)
    
    return base


def generate_skill(prompt: str) -> Dict[str, Any]:
    """Generate a complete structured Skill from a plain-language prompt."""
    
    # Classify and get template
    category = classify_prompt(prompt)
    template = CATEGORY_TEMPLATES[category]
    
    # Build structured skill
    constraints_raw = extract_constraints_from_prompt(prompt, template)
    
    skill = {
        "role": template["role"],
        "description": f"自动将用户诉求「{prompt}」转换为可执行Agent Skill。",
        "category": category,
        "constraints": constraints_raw.split("\n") if "\n" in constraints_raw else template["constraints"],
        "constraints_raw": constraints_raw,
        "workflow": template["workflow"],
        "few_shots": template["few_shots"],
        "initialization": template["initialization"],
        "generated_from": prompt,
        "skill_type": "structured_agent_skill",
        "version": "1.0.0"
    }
    
    return skill


def format_as_markdown(skill: Dict[str, Any]) -> str:
    """Format the skill as a structured Markdown document."""
    
    md = f"""# Agent Skill: {skill['description']}

## Metadata
- **Category**: {skill['category']}
- **Version**: {skill['version']}
- **Generated From**: _{skill['generated_from']}_
- **Skill Type**: {skill['skill_type']}

---

## Role

{skill['role']}

## Description

{skill['description']}

## Constraints

"""
    for c in skill.get("constraints", []):
        md += f"- {c}\n"
    
    md += "\n## Workflow\n\n"
    for i, step in enumerate(skill.get("workflow", []), 1):
        md += f"{i}. {step}\n"
    
    md += "\n## Few-shots\n\n"
    for fs in skill.get("few_shots", []):
        md += f"> **Input**: {fs.get('input', '')}\n"
        md += f"> **Output**: {fs.get('output', '')}\n>\n"
    
    md += f"\n## Initialization\n\n{skill.get('initialization', '')}\n"
    
    return md


def format_as_hermes_skill_md(skill: Dict[str, Any]) -> str:
    """Format as a Hermes SKILL.md frontmatter format."""
    
    constraints_yaml = "\n".join(f"  - {c}" for c in skill.get("constraints", []))
    workflow_yaml = "\n".join(f"  - {s}" for s in skill.get("workflow", []))
    
    return f"""---
name: auto-generated-{skill['category']}
title: {skill['description']}
description: 自动从用户诉求生成的Agent Skill
triggers:
  - {skill['generated_from']}
constraints:
{constraints_yaml}
workflow:
{workflow_yaml}
---

# {skill['description']}

{skill['role']}

## Constraints
{constraints_yaml}

## Workflow
{workflow_yaml}

## Few-shots
{json.dumps(skill.get('few_shots', []), ensure_ascii=False, indent=2)}
"""


def main():
    if len(sys.argv) > 1 and sys.argv[1] in ("-p", "--prompt"):
        prompt = " ".join(sys.argv[2:])
    else:
        print("=" * 60)
        print("Prompt-to-Skill 转换引擎 v1.0")
        print("=" * 60)
        print("请输入大白话业务诉求（输入 q 退出）：")
        prompt = input("\n> ").strip()
        if not prompt or prompt.lower() == "q":
            return
    
    if not prompt:
        print("请输入有效的业务诉求")
        return
    
    print(f"\n⏳ 正在分析：{prompt}")
    print(f"📂 分类匹配：{classify_prompt(prompt)}")
    
    skill = generate_skill(prompt)
    
    print("\n" + "=" * 60)
    print("📄 Markdown 输出")
    print("=" * 60)
    print(format_as_markdown(skill))
    
    print("\n" + "=" * 60)
    print("📋 JSON 结构化输出")
    print("=" * 60)
    output = {k: v for k, v in skill.items() if k not in ("constraints_raw",)}
    print(json.dumps(output, ensure_ascii=False, indent=2))
    
    # Save to file
    import hashlib
    safe_name = hashlib.md5(prompt.encode()).hexdigest()[:8]
    md_file = f"skill_output_{safe_name}.md"
    json_file = f"skill_output_{safe_name}.json"
    
    with open(md_file, "w", encoding="utf-8") as f:
        f.write(format_as_markdown(skill))
    with open(json_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ 输出已保存到 {md_file} 和 {json_file}")


if __name__ == "__main__":
    main()
