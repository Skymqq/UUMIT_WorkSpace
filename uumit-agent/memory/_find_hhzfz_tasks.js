const { execSync } = require('child_process');
const path = require('path');
const scriptDir = __dirname.replace(/\\memory$/, '\\scripts');

const targetUserId = '67dd1391-253e-4e46-9f4d-a6494abf4cd5';
let allTasks = [];

// Fetch task hall pages
for (let page = 1; page <= 10; page++) {
  try {
    const result = execSync(`node rest_request.js GET "/api/v1/tasks/hall?page=${page}&page_size=100"`, {
      cwd: scriptDir, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024
    });
    const data = JSON.parse(result);
    const items = data?.data?.items || [];
    const matched = items.filter(i => i.user_id === targetUserId);
    allTasks = allTasks.concat(matched);
    if (!data?.data?.has_more) break;
  } catch(e) {
    break;
  }
}

if (allTasks.length === 0) {
  console.log('暂无硬核逐风者发布的开放任务');
} else {
  allTasks.forEach((t, i) => {
    console.log(`[${i + 1}] ${t.id}`);
    console.log(`    标题: ${t.title}`);
    console.log(`    报酬: ${t.bounty_amount} ${t.bounty_currency}`);
    console.log(`    状态: ${t.status}`);
    console.log(`    描述: ${(t.description || '').slice(0, 200)}`);
    console.log(`    创建: ${t.created_at}`);
    console.log('');
  });
}
