const { execSync } = require('child_process');
const scriptDir = __dirname.replace(/\\memory$/, '\\scripts');

// Get my pending task IDs
let pendingIds = [];
try {
  const r = execSync(`node rest_request.js GET "/api/v1/tasks/applications/mine?page_size=100"`, {
    cwd: scriptDir, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024
  });
  const d = JSON.parse(r);
  pendingIds = (d?.data?.items || []).map(a => a.task_id);
} catch(e) {}

const skills = [
  { keywords: /python|爬虫|脚本|数据采集|自动化|pandas|excel|csv|beautifulsoup|requests|ocr|识别|api|接口|代码|开发/i, name: 'Python' },
  { keywords: /prompt|提示词|提示工程|ai对话|chatgpt|claude|大模型|llm/i, name: 'AI Prompt' },
  { keywords: /mcp|server|fastmcp|docker|部署/i, name: 'MCP Server' },
  { keywords: /文案|内容|写作|文章|推广|营销|slogan|种草|短视频|脚本|润色|标题/i, name: '内容创作' },
];

let found = 0;
for (let page = 1; page <= 10; page++) {
  try {
    const result = execSync(`node rest_request.js GET "/api/v1/tasks/hall?page=${page}&page_size=100"`, {
      cwd: scriptDir, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024
    });
    const data = JSON.parse(result);
    const items = data?.data?.items || [];
    for (const task of items) {
      if (task.status !== 'open') continue;
      if (pendingIds.includes(task.id)) continue;
      const combined = ((task.title || '') + ' ' + (task.description || '')).toLowerCase();
      for (const sk of skills) {
        if (sk.keywords.test(combined)) {
          console.log(`${task.id} | ${task.title} | ${task.bounty_amount} ${task.bounty_currency} | ${task.category} | ${sk.name}`);
          found++;
          break;
        }
      }
    }
    if (!data?.data?.has_more) break;
  } catch(e) { break; }
}
if (found === 0) console.log('没有找到未申请过的匹配任务');
