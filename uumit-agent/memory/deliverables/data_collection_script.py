#!/usr/bin/env python3
"""
通用数据采集与自动化处理脚本

功能说明：
- 网页数据采集（requests + BeautifulSoup）
- 数据清洗与CSV导出
- 异常处理与日志记录
- 批量自动化处理

使用方式：
    python data_collection_script.py --url <目标URL> --output <导出文件.csv>

依赖安装：
    pip install requests beautifulsoup4 pandas
"""

import requests
from bs4 import BeautifulSoup
import csv
import json
import sys
import os
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def fetch_page(url, headers=None):
    """采集目标网页数据"""
    if headers is None:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    try:
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        logger.info(f"成功获取页面: {url}")
        return response.text
    except requests.RequestException as e:
        logger.error(f"请求失败: {e}")
        raise


def parse_html(html):
    """解析HTML提取结构化数据"""
    soup = BeautifulSoup(html, 'html.parser')
    data = []

    # 提取所有文本段落
    for tag in soup.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li']):
        text = tag.get_text(strip=True)
        if text:
            data.append({
                'tag': tag.name,
                'text': text,
                'timestamp': datetime.now().isoformat()
            })

    logger.info(f"解析完成，提取 {len(data)} 条数据")
    return data


def export_csv(data, output_path):
    """导出数据为CSV格式"""
    if not data:
        logger.warning("无数据可导出")
        return

    fieldnames = list(data[0].keys())
    with open(output_path, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(data)

    logger.info(f"数据已导出至: {output_path}")


def export_json(data, output_path):
    """导出数据为JSON格式"""
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.info(f"JSON已导出至: {output_path}")


def main():
    """主函数：支持命令行参数"""
    import argparse

    parser = argparse.ArgumentParser(description='通用数据采集与自动化处理脚本')
    parser.add_argument('--url', type=str, help='目标网页URL')
    parser.add_argument('--output', type=str, default='output.csv', help='输出文件路径')
    parser.add_argument('--format', type=str, choices=['csv', 'json'], default='csv', help='输出格式')

    args = parser.parse_args()

    if not args.url:
        logger.error("请提供目标URL (--url)")
        sys.exit(1)

    # 执行采集流程
    html = fetch_page(args.url)
    data = parse_html(html)

    # 按格式导出
    if args.format == 'csv':
        export_csv(data, args.output)
    else:
        export_json(data, args.output)

    logger.info("数据采集与处理完成")
    print(f"结果已保存至: {os.path.abspath(args.output)}")


if __name__ == '__main__':
    main()
