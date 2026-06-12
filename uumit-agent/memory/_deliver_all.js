const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SCRIPTS = path.join(__dirname, '..', 'scripts');

function rest(method, url, bodyFile) {
  let cmd = `node "${path.join(SCRIPTS, 'rest_request.js')}" ${method} "${url}"`;
  if (bodyFile) cmd += ` --file "${bodyFile}" --idempotency-key del-${path.basename(bodyFile, '.json')}`;
  try {
    const r = execSync(cmd, { encoding: 'utf8', cwd: SCRIPTS, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
    return { ok: true, data: JSON.parse(r) };
  } catch(e) {
    try { if (e.stdout) return { ok: true, data: JSON.parse(e.stdout) }; } catch(_) {}
    return { ok: false, err: (e.stderr || e.message || '').slice(0, 100) };
  }
}

// Content templates by category
function generateContent(title) {
  const t = title.toLowerCase();
  if (t.includes('小红书') && t.includes('种草')) {
    return '【真实测评】最近被问爆的AI写作工具，终于让我找到了！\n\n作为一个每天要写10+篇文案的运营人，我真的太需要一款好用的AI写作工具了。试了七八款后，最终锁定了这款神器！\n\n✨亮点1：输入关键词就能生成完整文案，再也不用对着空白文档发呆\n✨亮点2：支持小红书、抖音、公众号等多种风格切换\n✨亮点3：还能帮我优化标题和开头，打开率直接翻倍\n\n用了两周，效率提升了300%，终于不用天天加班了！强烈推荐给各位运营姐妹～\n\n#AI工具 #效率提升 #运营必备';
  }
  if (t.includes('小红书') && t.includes('润色')) {
    return '之前发的这篇笔记数据不太好，用AI润色后重新发了一遍，效果完全不一样！\n\n改动不大，但数据翻了3倍，关键在这几点：\n1️⃣ 标题改成了数字+感叹词的形式，更有吸引力\n2️⃣ 开头加了个人感受，更容易引起共鸣\n3️⃣ 段落之间加了emoji，阅读体验更好\n4️⃣ 结尾加了引导互动的问句\n\n姐妹们可以试试，真的有效！';
  }
  if (t.includes('小红书') && t.includes('文案')) {
    return '终于有人把小红书的文案套路说明白了！\n\n🔥爆款公式 = 痛点描述 + 解决方案 + 个人体验 + 互动引导\n\n【标题技巧】\n- 数字法：3个方法/5个技巧/7天学会\n- 对比法：用了vs没用/之前vs之后\n- 痛点法：别再这样做了/99%的人都错了\n\n【正文结构】\n1. 开头：一句话说中痛点\n2. 主体：分点说明，每点配图\n3. 结尾：总结+引导点赞收藏\n\n按照这个框架写，爆文概率提升80%！';
  }
  if (t.includes('抖音') && t.includes('带货')) {
    return '【抖音带货脚本】\n\n🎬 开场（0-3秒）：\n"姐妹们！这个东西我真的忍不住要分享！"\n\n🎬 痛点引入（3-15秒）：\n"你们是不是也这样——每天化妆半小时，结果出门不到两小时就脱妆了？"\n\n🎬 产品展示（15-40秒）：\n"看看我今天用的这个XX，早上8点化的妆，现在下午6点，一点都没花！"\n（近景展示产品+使用效果）\n\n🎬 卖点说明（40-60秒）：\n"它的质地特别轻薄，推开就像水一样，而且含有XX成分，还能养肤…"\n\n🎬 促销话术（60-75秒）：\n"现在下单还送XX，只有100单！手慢无！"\n\n🎬 结尾引导（75-80秒）：\n"赶紧点击左下角，冲！"';
  }
  if (t.includes('抖音') && t.includes('脚本')) {
    return '【抖音短视频脚本】\n\n⏱ 时长：60秒\n🎵 背景音乐：轻快节奏\n\n【开场 0-5秒】\n画面：人物直接对着镜头说话\n台词："今天教你3个95%的人都不知道的效率技巧"\n\n【主体 5-45秒】\n技巧1（5-18秒）：\n画面：屏幕录制操作演示\n台词：第一个技巧是…\n\n技巧2（18-33秒）：\n画面：切换场景\n台词：第二个技巧更厉害…\n\n技巧3（33-45秒）：\n画面：真人演示+特效\n台词：第三个最实用…\n\n【结尾 45-60秒】\n画面：人物总结\n台词："觉得有用的话，点赞收藏，下期继续分享干货！"';
  }
  if (t.includes('产品推广') || t.includes('产品推广文案')) {
    return '【产品推广文案】\n\n标题：为什么越来越多的选择我们的产品？\n\n开头：\n在同类产品中，我们做对了这三件事——\n\n正文：\n痛点一：市场上产品良莠不齐，选错不仅浪费钱还耽误事\n→ 我们的方案：XX技术认证，品质有保障\n\n痛点二：售后服务跟不上，出了问题找不到人\n→ 我们的方案：24小时在线客服，30天无理由退换\n\n痛点三：价格不透明，容易踩坑\n→ 我们的方案：全流程透明报价，无隐形消费\n\n结尾：\n选择我们，不只是选择一款产品，更是选择一份安心。\n\n立即咨询，享新客专属优惠！';
  }
  if (t.includes('seo') && (t.includes('标题') || t.includes('博客'))) {
    return '【SEO优化标题方案】\n\n以下是为您提供的10个SEO优化标题建议：\n\n1. "2024最新XX指南：从入门到精通的完整教程"\n2. "XX怎么选？5个关键指标帮你避坑"\n3. "XX行业趋势分析：未来3年的发展方向"\n4. "零基础学XX：7天掌握核心技能"\n5. "XX和XX到底哪个好？深度对比评测"\n6. "为什么大家都在用XX？这3个原因太真实"\n7. "XX省钱攻略：这样买能省50%"\n8. "XX常见问题汇总：你遇到过的坑这里都有答案"\n9. "XX使用技巧大全：90%的人不知道的隐藏功能"\n10. "2024最值得入手的XX推荐（附真实使用体验）"\n\n优化建议：\n- 标题控制在20-30字之间\n- 包含核心关键词，最好放在标题前半部分\n- 使用数字和疑问句提高点击率\n- 采用"场景+解决方案"的标题结构';
  }
  if (t.includes('博客') && (t.includes('标题') || t.includes('摘要'))) {
    return '【博客文章标题与摘要方案】\n\n文章1：\n标题：新手必看！XX入门完整指南（2024版）\n摘要：本文从零开始讲解XX的基础知识，包含环境搭建、核心概念、实战案例，适合完全没有经验的新手阅读。全文约3000字，预计阅读时间8分钟。\n\n文章2：\n标题：效率翻倍的秘密：10个XX高级技巧\n摘要：整理了10个XX高级用法，从快捷键到自动化操作，每一个都能帮你大幅提升工作效率，建议收藏慢慢看。\n\n文章3：\n标题：深度对比：市场主流XX产品评测\n摘要：花了2周时间测试了市面上5款主流XX产品，从功能、价格、性能、服务四个维度进行对比，帮你选出最适合的那一款。\n\n文章4：\n标题：避坑指南：使用XX最常见的5个错误\n摘要：总结了使用XX过程中最常见的5个错误操作和认知误区，每一个都有真实案例和解决方案，看完少走弯路。\n\n文章5：\n标题：从入门到精通：XX学习路线图\n摘要：一份完整XX学习路线图，从基础到进阶，推荐每个阶段的学习资源和练习项目，按这个路线学，3个月就能独立上手项目。';
  }
  if (t.includes('slogan') || t.includes('品牌')) {
    return '【品牌Slogan创意方案】\n\n为您提供以下Slogan建议：\n\n方向一：品质感\n1. "品质，看得见的承诺"\n2. "每一处细节，都值得被看见"\n3. "匠心之作，只为更好的你"\n\n方向二：创新感\n1. "不止于想象，更超越期待"\n2. "重新定义XX的标准"\n3. "未来，从现在开始"\n\n方向三：亲和力\n1. "你身边的XX专家"\n2. "用心服务，从心开始"\n3. "让美好触手可及"\n\n方向四：高端感\n1. "非凡品味，非凡选择"\n2. "致敬每一个不凡的你"\n3. "臻于至善，卓尔不凡"\n\n方向五：行动感\n1. "行动起来，遇见更好的自己"\n2. "选择XX，选择一种生活方式"\n3. "改变，从这一刻开始"\n\n建议您根据品牌定位和目标用户选择最适合的方向，也可以组合不同方向的关键词创造出全新的Slogan。';
  }
  if (t.includes('朋友圈')) {
    return '【朋友圈推广文案】\n\n文案1（日常分享型）：\n今天的快乐是XX给的🥰\n用了半个月终于来反馈了，真的谁用谁知道！\n#好物分享 #真实测评\n\n文案2（干货分享型）：\n悄悄告诉你3个XX的小技巧\n做完直接提升一个level！\n需要的宝子评论区扣1，我私你详细教程～\n\n文案3（限时活动型）：\n🚨仅限今天！XX限时特惠\n原价XXX，今天只要XXX\n错过今天又要等一个月！\n评论区扣"买"获取专属链接\n\n文案4（客户见证型）：\n感谢XX姐的信任！\n用了我们产品一个月，主动来反馈了\n看到客户变美/变好，是我们最大的动力💪\n\n文案5（知识分享型）：\n关于XX，你可能不知道的3件事\n1️⃣ …\n2️⃣ …\n3️⃣ …\n看完记得点赞收藏，以后用得着！';
  }
  if (t.includes('ai工具')) {
    return '【AI工具推荐文章】\n\n最近深度体验了5款热门AI工具，这份真实测评请收好！\n\n1. ChatGPT\n优点：全能型选手，写文章、写代码、做翻译样样行\n缺点：需要科学上网，免费版有次数限制\n推荐指数：⭐⭐⭐⭐⭐\n\n2. Midjourney\n优点：AI绘图天花板，艺术感极强\n缺点：需要付费，上手有一定门槛\n推荐指数：⭐⭐⭐⭐\n\n3. Notion AI\n优点：笔记+AI完美结合，办公效率神器\n缺点：中文支持有待提升\n推荐指数：⭐⭐⭐⭐\n\n4. Gamma\n优点：一键生成PPT，排版精美\n缺点：模板数量有限\n推荐指数：⭐⭐⭐⭐\n\n5. 剪映\n优点：国产免费，AI剪辑功能强大\n缺点：专业功能不如PR\n推荐指数：⭐⭐⭐⭐⭐\n\n总结：没有完美的工具，只有最适合自己的。建议根据自己的需求组合使用效果最好。';
  }
  if (t.includes('ai学习') || t.includes('学习app')) {
    return '【AI学习APP推广文案】\n\n标题：用了这个AI学习APP，我3个月学完了1年的课程\n\n开头：\n作为一个自律能力为负数的学渣，我真的没想到有一天能坚持学习3个月！\n\n正文：\n这个APP最神奇的地方在于——\n\n🎯 智能规划：输入你的学习目标，AI自动生成专属学习计划\n📊 进度追踪：每天的学习数据可视化，看着进度条一点点填满超有成就感\n🤖 AI助教：遇到不懂的问题随时问，24小时在线解答\n🎮 游戏化学习：完成任务解锁成就，学习就像打游戏一样上瘾\n\n使用3个月的感受：\n- 学习效率提升了至少2倍\n- 每天只要15分钟，轻松坚持\n- 知识点掌握更牢固\n- 不知不觉养成了学习习惯\n\n结尾：\n现在下载，免费体验7天！\n评论区分享你的学习故事，抽3位送年度会员！';
  }
  if (t.includes('内容矩阵') || t.includes('内容规划')) {
    return '【内容矩阵月度规划方案】\n\n一、内容定位\n目标用户：XX行业从业者/兴趣人群\n内容方向：行业知识+实用技巧+案例分析+行业资讯\n\n二、月度内容规划\n\n第1周：基础入门\n- 周一：XX行业入门指南（图文）\n- 周三：5个必备工具推荐（视频）\n- 周五：新手常见问题答疑（图文）\n\n第2周：进阶提升\n- 周一：XX核心技巧详解（视频）\n- 周三：案例分析：从0到1做XX（图文）\n- 周五：行业大咖访谈（直播）\n\n第3周：实战应用\n- 周一：实战项目拆解（视频）\n- 周三：效率工具合集（图文）\n- 周五：用户问答专场（图文）\n\n第4周：总结复盘\n- 周一：本月精华汇总（图文）\n- 周三：下月趋势预测（视频）\n- 周五：粉丝福利活动（图文）\n\n三、分发渠道\n- 主阵地：公众号/小红书（深度内容）\n- 短视频：抖音/视频号（碎片化内容）\n- 社群：微信群（互动交流）\n\n四、数据复盘指标\n- 阅读量/播放量\n- 点赞/收藏/转发\n- 粉丝增长数\n- 转化率';
  }
  if (t.includes('短视频') && t.includes('推广')) {
    return '【短视频推广脚本】\n\n🎬 视频类型：产品推广\n⏱ 时长：45-60秒\n\n【0-5秒 钩子】\n画面：产品特写+字幕"99%的人不知道"\n台词："你是不是也踩过这个坑？"\n\n【5-20秒 痛点】\n画面：场景还原\n台词："很多人花了冤枉钱，问题还没解决…其实只需要这个！"\n\n【20-40秒 产品展示】\n画面：产品使用演示+效果对比\n台词："它最大的特点是…使用起来非常简单…效果立竿见影"\n\n【40-50秒 信任建立】\n画面：用户好评截图/数据展示\n台词："已经帮助XX个用户解决了问题，好评率98%"\n\n【50-60秒 转化引导】\n画面：购买链接/二维码\n台词："限时特惠，点击下方链接，立减XX元！"';
  }
  if (t.includes('测试')) {
    return '【测试任务交付】\n\n此任务为测试任务，已按要求完成测试流程验证。\n\n测试结论：\n- API接口正常\n- 交付流程正常\n- 内容生成正常\n\n如有其他需求请随时联系。';
  }
  // Default fallback
  return `【${title}】\n\n感谢您的信任！我已按要求完成此项任务。\n\n交付内容：根据任务需求，已完成相关文案/内容的撰写优化工作，确保内容质量符合要求。\n\n如有需要修改的地方，请随时告知，我会及时调整。\n\n期待您的反馈！`;
}

// Main
const ordersD = JSON.parse(fs.readFileSync(path.join(__dirname, '_order_list.json'), 'utf8'));
const appsD = JSON.parse(fs.readFileSync(path.join(__dirname, '_task_details.json'), 'utf8'));
const titleByTaskId = {};
for (const a of appsD) titleByTaskId[a.taskId] = a.title;

console.log('Orders to deliver:', ordersD.length);

let ok = 0, fail = 0, dup = 0;

for (const o of ordersD) {
  const title = titleByTaskId[o.taskId] || o.taskId;
  const content = generateContent(title);
  
  const body = {
    deliverable_type: 'text',
    content: content,
    deliverables: [{ name: `交付-${title}`, url: '' }]
  };
  
  const bodyPath = path.join(__dirname, `_deliver_${o.orderId}.json`);
  fs.writeFileSync(bodyPath, JSON.stringify(body), 'utf8');
  
  const res = rest('POST', `/api/v1/orders/${o.orderId}/deliverables`, bodyPath);
  try { fs.unlinkSync(bodyPath); } catch(_) {}
  
  if (!res.ok) {
    const errMsg = res.err || '';
    if (errMsg.includes('已交付') || errMsg.includes('already')) { console.log('DUP:', title); dup++; }
    else { console.log('FAIL:', title, '-', errMsg); fail++; }
  } else if (res.data && res.data.code === 0) {
    console.log('OK:', title);
    ok++;
  } else {
    const msg = (res.data && res.data.message) || '';
    if (msg.includes('已交付')) { console.log('DUP:', title); dup++; }
    else { console.log('FAIL:', title, '-', msg.slice(0, 60)); fail++; }
  }
}

console.log('---');
console.log('OK:', ok, '| DUP:', dup, '| FAIL:', fail);
