import { Command } from 'commander';
import path from 'path';
import chalk from 'chalk';
import fs from 'fs-extra';
import { GitDiffAnalyzer, FileChange, CodeBlock } from '../core/diff-analyzer.js';
import { DependencyTracer } from '../core/tracer.js';

/**
 * diff 命令实现
 * 分析 Git 暂存区变更并生成 AI 友好的上下文文档
 */
export function createDiffCommand(): Command {
  const diffCommand = new Command('diff');

  diffCommand
    .description('分析 Git 暂存区的代码变更')
    .option('-p, --path <path>', '项目根路径', process.cwd())
    .action(async (options) => {
      try {
        const projectPath = path.resolve(options.path);
        const outputFile = path.join(projectPath, 'AI_DIFF_CONTEXT.md');

        console.log(chalk.blue('🔍 分析 Git 变更...'));

        // 1. 分析 Git diff
        const analyzer = new GitDiffAnalyzer(projectPath);
        const diffAnalysis = await analyzer.analyzeStagedChanges();

        if (diffAnalysis.totalFiles === 0) {
          console.log(chalk.yellow('⚠️  暂存区没有变更'));
          console.log(chalk.gray('   使用 git add 添加文件到暂存区'));
          process.exit(0);
        }

        console.log(chalk.green(`✓ 检测到 ${diffAnalysis.totalFiles} 个文件变更`));

        // 2. 分析受影响的代码块
        const affectedBlocks = diffAnalysis.fileChanges.flatMap(f => f.affectedBlocks);
        console.log(chalk.gray(`📊 ${affectedBlocks.length} 个代码块受影响`));

        // 3. 追踪依赖关系
        console.log(chalk.blue('🔗 追踪依赖关系...'));
        const tracer = new DependencyTracer(projectPath);
        const impactMap = new Map<string, any>();

        for (const fileChange of diffAnalysis.fileChanges) {
          if (fileChange.status !== 'deleted') {
            try {
              const impact = await tracer.analyzeImpact(fileChange.filePath);
              impactMap.set(fileChange.relativePath, impact);
            } catch (error) {
              // 忽略单个文件的错误
            }
          }
        }

        console.log(chalk.gray(`✓ 分析了 ${impactMap.size} 个文件的影响范围`));

        // 4. 生成文档
        console.log(chalk.blue('📝 生成文档...'));
        const markdown = generateDiffDocument(diffAnalysis, impactMap, projectPath);
        await fs.writeFile(outputFile, markdown, 'utf-8');

        console.log(chalk.green('✅ 变更分析完成'));
        console.log(chalk.gray(`📄 ${outputFile}`));
        console.log(chalk.gray(`💡 将此文档提供给 AI 进行代码审查或编写测试`));

      } catch (error: any) {
        console.error(chalk.red('❌ 分析失败:'), error.message);
        process.exit(1);
      }
    });

  return diffCommand;
}

/**
 * 生成 Diff 上下文文档
 */
function generateDiffDocument(
  diffAnalysis: any,
  impactMap: Map<string, any>,
  projectPath: string
): string {
  const timestamp = new Date().toLocaleString('zh-CN');
  const projectName = path.basename(projectPath);

  let markdown = `# Git 变更上下文分析

**项目**: ${projectName}  
**分析时间**: ${timestamp}  
**变更文件**: ${diffAnalysis.totalFiles} 个  
**新增**: ${diffAnalysis.summary.added} | **修改**: ${diffAnalysis.summary.modified} | **删除**: ${diffAnalysis.summary.deleted}

---

## 🎯 AI 任务建议

**请基于以下变更进行以下操作之一：**

1. **代码审查**: 检查逻辑正确性、性能问题、安全隐患
2. **编写测试**: 为变更的函数编写单元测试
3. **文档更新**: 如接口变更，更新相关文档
4. **影响评估**: 确认变更不会破坏依赖此代码的其他模块

---

## 📊 变更概要

`;

  // 统计受影响的代码块
  const allBlocks = diffAnalysis.fileChanges.flatMap((f: FileChange) => f.affectedBlocks);
  const blocksByType = groupBlocksByType(allBlocks);

  Object.entries(blocksByType).forEach(([type, blocks]) => {
    if ((blocks as CodeBlock[]).length > 0) {
      markdown += `- **${capitalizeFirst(type)}**: ${(blocks as CodeBlock[]).length} 个\n`;
    }
  });

  markdown += `\n---\n\n## 📝 详细变更\n\n`;

  // 遍历每个文件的变更
  diffAnalysis.fileChanges.forEach((fileChange: FileChange, index: number) => {
    markdown += `### ${index + 1}. \`${fileChange.relativePath}\`\n\n`;
    markdown += `**状态**: ${getStatusEmoji(fileChange.status)} ${fileChange.status}\n\n`;

    if (fileChange.status === 'deleted') {
      markdown += `> 文件已删除\n\n`;
      markdown += `---\n\n`;
      return;
    }

    // 受影响的代码块
    if (fileChange.affectedBlocks.length > 0) {
      markdown += `#### 受影响的代码块\n\n`;

      fileChange.affectedBlocks.forEach((block: CodeBlock) => {
        markdown += `**${getBlockTypeEmoji(block.type)} ${block.type}: \`${block.name}\`**\n\n`;
        markdown += `- 位置: 第 ${block.startLine}-${block.endLine} 行\n`;
        markdown += `- 签名: \`${block.signature}\`\n`;
        markdown += `- 变更行: ${block.changedLineNumbers.join(', ')}\n\n`;

        // 完整代码
        markdown += `**完整代码**:\n\n\`\`\`typescript\n${block.fullCode}\n\`\`\`\n\n`;
      });
    }

    // 依赖关系影响
    const impact = impactMap.get(fileChange.relativePath);
    if (impact) {
      markdown += `#### 影响范围\n\n`;

      // 下游依赖
      if (impact.dependencies.length > 0) {
        markdown += `**下游依赖** (该文件引用了):\n`;
        impact.dependencies.slice(0, 5).forEach((dep: any) => {
          markdown += `- \`${dep.relativePath}\` (${dep.type})\n`;
        });
        if (impact.dependencies.length > 5) {
          markdown += `- ... 还有 ${impact.dependencies.length - 5} 个\n`;
        }
        markdown += `\n`;
      }

      // 上游依赖
      if (impact.dependents.length > 0) {
        markdown += `**上游依赖** (依赖该文件的):\n`;
        markdown += `> ⚠️ **${impact.dependents.length} 个文件依赖此文件，修改时需确保接口兼容**\n\n`;
        impact.dependents.slice(0, 5).forEach((dep: any) => {
          markdown += `- \`${dep.relativePath}\` - 引用: ${dep.importedItems.join(', ')}\n`;
        });
        if (impact.dependents.length > 5) {
          markdown += `- ... 还有 ${impact.dependents.length - 5} 个\n`;
        }
        markdown += `\n`;
      } else {
        markdown += `**上游依赖**: 无（可安全修改）\n\n`;
      }
    }

    markdown += `---\n\n`;
  });

  markdown += `## 🔍 代码审查检查清单

- [ ] 代码逻辑是否正确？
- [ ] 是否有潜在的性能问题？
- [ ] 错误处理是否完善？
- [ ] 变量命名是否清晰？
- [ ] 是否有代码重复？
- [ ] 接口变更是否向后兼容？
- [ ] 是否需要更新文档？
- [ ] 是否需要添加测试？

---

*由 AI Pilot 自动生成*
`;

  return markdown;
}

/**
 * 按类型分组代码块
 */
function groupBlocksByType(blocks: CodeBlock[]): Record<string, CodeBlock[]> {
  const grouped: Record<string, CodeBlock[]> = {
    function: [],
    method: [],
    class: [],
    interface: [],
    component: [],
  };

  blocks.forEach(block => {
    if (grouped[block.type]) {
      grouped[block.type].push(block);
    }
  });

  return grouped;
}

/**
 * 获取状态 emoji
 */
function getStatusEmoji(status: string): string {
  const emojiMap: Record<string, string> = {
    added: '➕',
    modified: '✏️',
    deleted: '🗑️',
  };
  return emojiMap[status] || '📄';
}

/**
 * 获取代码块类型 emoji
 */
function getBlockTypeEmoji(type: string): string {
  const emojiMap: Record<string, string> = {
    function: '⚡',
    method: '🔧',
    class: '📦',
    interface: '📘',
    component: '🧩',
  };
  return emojiMap[type] || '📄';
}

/**
 * 首字母大写
 */
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}


