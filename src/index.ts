#!/usr/bin/env node

import { Command } from 'commander';
import { createScanCommand } from './commands/scan.js';
import { createTaskCommand } from './commands/task.js';
import { createTraceCommand } from './commands/trace.js';
import { createDiffCommand } from './commands/diff.js';

const program = new Command();

program
  .name('ai-pilot')
  .description('CLI tool for scanning frontend projects and generating AI-friendly context documents')
  .version('1.0.0');

// 注册命令
program.addCommand(createScanCommand());
program.addCommand(createTaskCommand());
program.addCommand(createTraceCommand());
program.addCommand(createDiffCommand());

// 显示帮助信息
program.on('--help', () => {
  console.log('');
  console.log('Examples:');
  console.log('  $ ai-pilot scan                        # 扫描项目');
  console.log('  $ ai-pilot task "添加登录功能"         # 生成任务文档');
  console.log('  $ ai-pilot trace src/utils/auth.ts     # 分析依赖关系');
  console.log('  $ ai-pilot diff                        # 分析 Git 变更');
  console.log('');
});

program.parse();

