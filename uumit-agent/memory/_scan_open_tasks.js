const { execSync } = require('child_process');
const path = require('path');
const scriptDir = __dirname.replace(/\\memory$/, '\\scripts');

// Our skills for matching
const skills = [
  { id: '224ad819-af11-4a53-8813-9520c4627ef7', name: 'Python 脚本开发与技术支持' },
  { id: 'fd5a0a07-75b3-4399-86a4-fe965dc8ee45', name: 'AI Prompt 工程优化' },
  { id: 'f411f89f-0e4d-4296-b7f0-5bf00fb8a3ac', name: 'MCP Server 开发部署' },
  { id: 'fe935266-ffea-422b-ac56-e4a57a10e74a', name: '专业内容创作与写作服务' },
];

const targetUserId = '67dd1391-253e-4e46-9f4d-a6494abf4cd5'; // 硬核逐风者
const alreadyDoneIds = ['6f38223c-f324-4f41-9a4d-1df780d7bcc7']; // Already applied

// Check my existing pending applications to know which tasks I've already applied for
let myPendingApps = [];
try {
  const r = execSync(`node rest_request.js GET "/api/v1/tasks/applications/mine?page_size=100"`, {
    cwd: scriptDir, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024
  });
  const d = JSON.parse(r);
  myPendingApps = (d?.data?.items || []).filter(a => a.status === 'pending').map(a => a.task_id);
} catch(e) {}

let candidates = [];

for (let page = 1; page <= 5; page++) {
  try {
    const result = execSync(`node rest_request.js GET "/api/v1/tasks/hall?page=${page}&page_size=100"`, {
      cwd: scriptDir, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024
    });
    const data = JSON.parse(result);
    const items = data?.data?.items || [];

    for (const task of items) {
      if (task.status !== 'open') continue;
      if (task.user_id === targetUserId && alreadyDoneIds.includes(task.id)) continue;
      if (myPendingApps.includes(task.id)) continue;

      const title = (task.title || '').toLowerCase();
      const desc = (task.description || '').toLowerCase();
      const combined = title + ' ' + desc;
      const bounty = Number(task.bounty_amount) || 0;

      // Score skill match
      let matchSkill = null;
      let matchScore = 0;

      if (/python|爬虫|脚本|数据采集|自动化|pandas|excel|csv|beautifulsoup|requests/i.test(combined)) {
        matchSkill = 'Python 脚本开发与技术支持';
        matchScore = combined.includes('python') ? 0.9 : 0.7;
      } else if (/prompt|提示词|提示工程|ai对话|chatgpt|claude|大模型|llm/i.test(combined)) {
        matchSkill = 'AI Prompt 工程优化';
        matchScore = 0.8;
      } else if (/mcp|server|fastmcp|docker|部署|云服务/i.test(combined)) {
        matchSkill = 'MCP Server 开发部署';
        matchScore = 0.8;
      } else if (/文案|内容|写作|文章|推广|营销|slogan|种草|短视频|脚本|润色/i.test(combined)) {
        matchSkill = '专业内容创作与写作服务';
        matchScore = 0.7;
      }

      // Also check for 技术开发 category
      if (!matchSkill && task.category === '技术开发') {
        if (/python|脚本|代码|开发|api|接口|数据/i.test(combined)) {
          matchSkill = 'Python 脚本开发与技术支持';
          matchScore = 0.6;
        }
      }

      if (matchSkill) {
        candidates.push({
          task_id: task.id,
          title: task.title,
          description: (task.description || '').slice(0, 150),
          bounty,
          currency: task.bounty_currency,
          category: task.category,
          publisher: task.user_id,
          matchSkill,
          matchScore
        });
      }
    }
    if (!data?.data?.has_more) break;
  } catch(e) { break; }
}

// Sort by match score descending
candidates.sort((a, b) => b.matchScore - a.matchScore);

if (candidates.length === 0) {
  console.log('暂无匹配的开放任务');
} else {
  candidates.forEach((t, i) => {
    const isHhzfz = t.publisher === targetUserId ? ' [硬核逐风者]' : '';
    console.log(`[${i + 1}] ${t.task_id}`);
    console.log(`    标题: ${t.title}${isHhzfz}`);
    console.log(`    报酬: ${t.bounty} ${t.currency} | 分类: ${t.category}`);
    console.log(`    匹配技能: ${t.matchSkill} (${(t.matchScore * 100).toFixed(0)}%)`);
    console.log(`    描述: ${t.description}`);
    console.log('');
  });
}
