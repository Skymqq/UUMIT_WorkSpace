# Prompt-to-Skill 转换专家 Agent

## Overview

This tool automatically converts plain-language business requirements into structured, engineering-grade Agent Skills. It acts as a bridge between human intuition and machine-executable task definitions.

## Architecture

```
User Input (大白话诉求)
        │
        ▼
┌───────────────────┐
│  Classifier       │  → 识别领域类别 (财务/数据/开发/文案/通用)
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│  Template Engine   │  → 加载对应领域的Skill模板
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│  Constraint        │  → 从用户输入中提取额外约束
│  Extractor         │
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│  Formatter         │  → 输出 Markdown / JSON / SKILL.md
└───────────────────┘
```

## Features

- **Multi-category Classification**: Automatically detects task domain (Finance, Data, Development, Copywriting, General)
- **Structured Output**: Generates Role, Constraints, Workflow, Few-shots sections
- **Multi-format Export**: Markdown, JSON, Hermes SKILL.md format
- **Extensible Templates**: Easy to add new domain templates

## Files

| File | Description |
|------|-------------|
| `prompt_to_skill.py` | Main conversion engine (CLI tool) |
| `README.md` | This documentation |

## Requirements

- Python 3.8+
- No external dependencies required

## Usage

### Interactive Mode

```bash
python prompt_to_skill.py
```

### Direct Prompt

```bash
python prompt_to_skill.py --prompt "帮我自动给发票对账"
```

### Example Output

Running with `--prompt "帮我自动给发票对账"` produces a structured Skill with:

- **Role**: Professional financial automation Agent
- **Constraints**: Amount precision, date format, dual verification, audit trail
- **Workflow**: Parse → Identify → Extract → Execute → Report
- **Few-shots**: Concrete input/output examples

## Production Deployment

For production use, replace the built-in template engine with an LLM API call:

```python
# In generate_skill(), replace:
# skill = template_based_generation(prompt)
# With:
# skill = llm_generate(prompt, model="gpt-4", system_prompt=SKILL_SYSTEM_PROMPT)
```

The template engine provides consistent, reliable output for common patterns, while the LLM route handles novel/unseen scenarios with greater flexibility.
