#!/usr/bin/env node
// UUMit MCP Deployer Skill - 安装脚本
const fs = require("fs");
const path = require("path");

const SKILL_DIR = process.env.UUMIT_SKILL_DIR || __dirname.replace(/\\scripts$/, "");
const MEMORY_DIR = path.join(SKILL_DIR, "memory");

// 创建 memory 目录
if (!fs.existsSync(MEMORY_DIR)) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

// 写入安装标记
fs.writeFileSync(
  path.join(MEMORY_DIR, ".installed"),
  JSON.stringify({
    name: "uumit-mcp-deployer",
    version: "1.0.0",
    installedAt: new Date().toISOString(),
  }, null, 2)
);

console.log(JSON.stringify({
  status: "ok",
  name: "uumit-mcp-deployer",
  version: "1.0.0",
  message: "安装成功"
}));
