const { execSync } = require('child_process');
const myUserId = '4e3941ba-22be-406a-8575-d9cb8a13eb87';
let foundTasks = [];

for (let page = 1; page <= 50; page++) {
  try {
    const result = execSync(`node rest_request.js GET "/api/v1/tasks/hall?page=${page}&page_size=100"`, {
      cwd: __dirname,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const data = JSON.parse(result);
    const items = data?.data?.items || [];
    const myItems = items.filter(i => i.user_id === myUserId);
    foundTasks = foundTasks.concat(myItems);
    if (!data?.data?.has_more) break;
  } catch(e) {
    // Try from stdout
    if (e.stdout) {
      try {
        const data = JSON.parse(e.stdout);
        const items = data?.data?.items || [];
        const myItems = items.filter(i => i.user_id === myUserId);
        foundTasks = foundTasks.concat(myItems);
        if (!data?.data?.has_more) break;
      } catch(_) { break; }
    } else { break; }
  }
}

foundTasks.forEach(i => console.log(i.id, i.status, i.bounty_amount, i.title));
console.log('---Total:', foundTasks.length);
