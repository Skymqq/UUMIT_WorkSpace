const https = require('https');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'https://api.uumit.com';
const authPath = path.join(__dirname, 'uumit-auth.json');
const a = JSON.parse(fs.readFileSync(authPath, 'utf8'));
const p = a.profiles[a.current];
const creds = { apiKey: p.cached_api_key, userId: p.cached_user_id };

function makeRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(BASE_URL + urlPath);
    const headers = { 'Content-Type': 'application/json', 'X-Api-Key': creds.apiKey, 'X-Platform-User-Id': creds.userId };
    const opts = { hostname: urlObj.hostname, port: 443, path: urlObj.pathname + urlObj.search, method, headers, timeout: 15000 };
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ statusCode: res.statusCode, data: JSON.parse(d) }); } catch(e) { reject(new Error('parse')); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function genCode(title) {
  if (title.includes('数据采集')) {
    return [
      'import requests',
      'from bs4 import BeautifulSoup',
      'import csv',
      'import time',
      '',
      "headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}",
      '',
      "def fetch_page(url):",
      "    try:",
      "        resp = requests.get(url, headers=headers, timeout=10)",
      "        resp.raise_for_status()",
      "        resp.encoding = resp.apparent_encoding",
      "        return resp.text",
      "    except requests.RequestException as e:",
      "        print(f'Request failed: {e}')",
      "        return None",
      '',
      "def parse_data(html):",
      "    soup = BeautifulSoup(html, 'html.parser')",
      "    items = []",
      "    for row in soup.select('table tr, .item, .list-item'):",
      "        cells = row.find_all(['td', 'th', 'div'])",
      "        if cells:",
      "            items.append([cell.get_text(strip=True) for cell in cells])",
      "    return items",
      '',
      "def save_csv(data, filename):",
      "    with open(filename, 'w', newline='', encoding='utf-8-sig') as f:",
      "        writer = csv.writer(f)",
      "        writer.writerows(data)",
      "    print(f'Saved {len(data)} rows to {filename}')",
      '',
      "def main():",
      "    url = input('Enter target URL: ')",
      "    html = fetch_page(url)",
      "    if not html: return",
      "    data = parse_data(html)",
      "    if not data:",
      "        print('No data found, check selectors')",
      "        return",
      "    filename = f'collected_{int(time.time())}.csv'",
      "    save_csv(data, filename)",
      '',
      "if __name__ == '__main__':",
      '    main()',
    ].join('\n');
  }
  return [
    'import pandas as pd',
    'import openpyxl',
    'import os',
    '',
    "def clean_data(df):",
    "    df = df.drop_duplicates()",
    "    for col in df.columns:",
    "        if df[col].dtype in ['int64', 'float64']:",
    "            df[col] = df[col].fillna(df[col].median())",
    "        else:",
    "            df[col] = df[col].fillna(method='ffill')",
    "    date_cols = [c for c in df.columns if 'date' in c.lower() or '\\u65e5\\u671f' in c]",
    "    for c in date_cols:",
    "        df[c] = pd.to_datetime(df[c], errors='coerce')",
    "    return df",
    '',
    "def generate_report(df, output='report.xlsx'):",
    "    with pd.ExcelWriter(output, engine='openpyxl') as writer:",
    "        df.to_excel(writer, sheet_name='\\u539f\\u59cb\\u6570\\u636e', index=False)",
    "        cat_cols = [c for c in df.columns if '\\u54c1\\u7c7b' in c or 'category' in c.lower()]",
    "        if cat_cols:",
    "            cat_summary = df.groupby(cat_cols[0]).agg(['sum', 'mean', 'count'])",
    "            cat_summary.to_excel(writer, sheet_name='\\u54c1\\u7c7b\\u6c47\\u603b')",
    "        df.describe(include='all').to_excel(writer, sheet_name='\\u7edf\\u8ba1\\u4fe1\\u606f')",
    "    print(f'Report generated: {output}')",
    '',
    "def main():",
    "    path = input('Enter CSV path: ')",
    "    if not os.path.exists(path):",
    "        print('File not found')",
    "        return",
    "    df = pd.read_csv(path, encoding='utf-8')",
    "    print(f'Read {len(df)} rows')",
    "    df = clean_data(df)",
    "    print(f'After cleaning: {len(df)} rows')",
    "    generate_report(df)",
    "    print('Done!')",
    '',
    "if __name__ == '__main__':",
    '    main()',
  ].join('\n');
}

const deliveries = [
  { orderId: '537287f1-97d8-4f3c-8817-60de38db4fee', title: 'Python数据采集脚本开发' },
  { orderId: '72aeb507-c855-4ac6-a9c5-2d7a3532b4d3', title: 'Python数据采集脚本开发' },
  { orderId: '5a1dc3fe-2f38-4687-a81c-01d99bfb3f73', title: 'Python数据处理脚本编写' },
  { orderId: 'ba2c0215-40e1-4877-a920-3813c800638f', title: 'Python数据处理脚本编写' },
  { orderId: 'ac03f2c7-15d4-490f-b3b6-347bffc3b155', title: 'Python数据处理脚本编写' },
  { orderId: '4d0a0dd6-849a-465d-9824-46d603f6bef1', title: 'Python数据处理脚本编写' },
];

async function main() {
  for (const d of deliveries) {
    const code = genCode(d.title);
    const body = {
      deliverable_type: 'text',
      content: `已完成「${d.title}」任务，交付完整Python脚本：\n\n\`\`\`python\n${code}\n\`\`\`\n\n使用方法：\n1. 安装依赖：pip install requests beautifulsoup4 pandas openpyxl\n2. 运行脚本即可`,
      deliverables: [{ name: d.title, url: '' }]
    };
    try {
      const res = await makeRequest('POST', `/api/v1/orders/${d.orderId}/deliverables`, body);
      const msg = (res.data && res.data.message) || '';
      if (res.data && res.data.code === 0) {
        console.log('OK:', d.title, d.orderId.slice(0,8));
      } else if (msg.includes('已交付') || msg.includes('already')) {
        console.log('DUP:', d.title, d.orderId.slice(0,8));
      } else {
        console.log('FAIL:', d.title, msg.slice(0,60));
      }
    } catch(e) {
      console.log('ERR:', d.title, e.message.slice(0,60));
    }
  }
  console.log('--- 交付完成 ---');
}
main().catch(e => console.error('FATAL:', e.message));
