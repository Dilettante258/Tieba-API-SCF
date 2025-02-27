import fs from 'fs';
import path from 'path';

const logDirectory = './logs';
const postIdRegex = /主题帖(\d+)获取失败/g;

// 所有提取到的帖子号
let allPostIds: Set<string> = new Set();

// 递归读取文件夹下的所有日志文件
function readFileDirectory(directory: string) {
  const files = fs.readdirSync(directory);
  files.forEach((file: any) => {
    const fullPath = path.join(directory, file);
    if (fs.statSync(fullPath).isDirectory()) {
      // 如果是文件夹，则递归读取
      readFileDirectory(fullPath);
    } else {
      // 处理日志文件
      processLogFile(fullPath);
    }
  });
}

// 处理单个日志文件
function processLogFile(logFilePath: string) {
  const data = fs.readFileSync(logFilePath, 'utf8');
  const lines = data.split('\n');
  lines.forEach((line: string) => {
    // 提取帖子号
    const postIds = extractPostIdsFromLine(line);
    postIds.forEach((id) => allPostIds.add(id));
  });
}

// 从单行日志中提取帖子号
function extractPostIdsFromLine(line: string): string[] {
  const matches = [];
  let match;
  while ((match = postIdRegex.exec(line)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

// 主函数
function main() {
  try {
    console.log(`开始分析日志文件夹：${logDirectory}`);
    readFileDirectory(logDirectory);

    // 去重并输出结果
    const uniquePostIds = Array.from(allPostIds);
    console.log('提取到的失败帖子号（已去重）：');
    console.log(uniquePostIds);
  } catch (error) {
    console.error('分析日志时出错：', error);
  }
}


// 运行主函数
main();
