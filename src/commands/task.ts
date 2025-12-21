import { Command } from 'commander';
import path from 'path';
import chalk from 'chalk';
import fs from 'fs-extra';
import { ProjectMap } from '../core/scanner.js';
import { ContextFinder, ContextMatch } from '../core/context-finder.js';

/**
 * task 命令实现
 * 根据用户需求生成 AI 任务文档
 */
export function createTaskCommand(): Command {
  const taskCommand = new Command('task');

  taskCommand
    .description('根据需求生成 AI 任务文档')
    .argument('<requirement>', '你想对项目进行的改动')
    .option('-p, --path <path>', '项目路径', process.cwd())
    .action(async (requirement: string, options) => {
      try {
        const projectPath = path.resolve(options.path);
        const mapFile = path.join(projectPath, 'ai-context', 'project-map.json');
        const outputFile = path.join(projectPath, 'AI_READY_TASKS.md');

        // 检查项目地图是否存在
        if (!await fs.pathExists(mapFile)) {
          console.log(chalk.yellow('⚠️  未找到项目地图，请先运行 scan 命令'));
          console.log(chalk.gray('   运行: ai-pilot scan'));
          process.exit(1);
        }

        console.log(chalk.blue('🔍 分析需求...'));

        // 读取项目地图
        const projectMap: ProjectMap = await fs.readJson(mapFile);

        // 初始化上下文查找器
        const contextFinder = new ContextFinder(projectPath);
        contextFinder.setProjectMap(projectMap);

        // 提取关键词
        const keywords = contextFinder.extractKeywords(requirement);

        // 匹配相关文件
        const matches = contextFinder.findMatchingFiles(keywords);

        if (matches.length === 0) {
          console.log(chalk.yellow('⚠️  未找到匹配的相关文件'));
          
          // 生成基础文档
          const markdown = generateTaskDocument(requirement, [], projectPath);
          await fs.writeFile(outputFile, markdown, 'utf-8');
          
          console.log(chalk.green('✅ 任务文档已生成，请将其交给 AI 执行'));
          console.log(chalk.gray(`📄 ${outputFile}`));
          process.exit(0);
        }

        // 取前5个匹配结果
        const topMatches = matches.slice(0, 5);

        // 生成任务文档
        const markdown = generateTaskDocument(requirement, topMatches, projectPath);
        await fs.writeFile(outputFile, markdown, 'utf-8');

        console.log(chalk.green(`✅ 任务文档已生成，请将其交给 AI 执行`));
        console.log(chalk.gray(`📄 ${outputFile}`));
        console.log(chalk.gray(`🎯 匹配到 ${matches.length} 个相关文件`));

      } catch (error: any) {
        console.error(chalk.red('❌ 生成失败:'), error.message);
        process.exit(1);
      }
    });

  return taskCommand;
}

/**
 * 生成任务文档
 */
function generateTaskDocument(
  userRequest: string,
  matches: ContextMatch[],
  projectPath: string
): string {
  const projectName = path.basename(projectPath);
  const timestamp = new Date().toLocaleString('zh-CN');

  let markdown = `# AI 任务执行文档

**项目**: ${projectName}  
**生成时间**: ${timestamp}  

---

## 📋 用户需求

${userRequest}

---

## 🎯 相关代码上下文

`;

  if (matches.length === 0) {
    markdown += `> ⚠️ 未找到匹配的代码文件。

`;
  } else {
    matches.forEach((match, index) => {
      const relPath = match.file.relativePath;
      const summary = match.codeSummary;

      markdown += `### ${index + 1}. \`${relPath}\`

**文件角色**: ${match.file.role} | **匹配关键词**: ${match.matchedKeywords.join(', ')}

`;

      // 如果有完整源代码，优先展示
      if (summary.sourceCode) {
        markdown += `**完整源代码**:\n\n\`\`\`typescript\n${summary.sourceCode}\n\`\`\`\n\n`;
      } else {
        // 否则展示代码摘要
        
        // 导出内容
        if (summary.exports.length > 0) {
          markdown += `**导出**:\n`;
          summary.exports.forEach(exp => {
            if (exp.signature) {
              markdown += `\n\`\`\`typescript\n${exp.signature}\n\`\`\`\n`;
            } else {
              markdown += `- ${exp.type}: \`${exp.name}\`\n`;
            }
          });
          markdown += '\n';
        }

        // 接口定义
        if (summary.interfaces.length > 0) {
          markdown += `**接口**:\n`;
          summary.interfaces.forEach(iface => {
            markdown += `\n\`\`\`typescript\ninterface ${iface.name} {\n`;
            markdown += iface.properties.map(p => `  ${p.name}${p.optional ? '?' : ''}: ${p.type};`).join('\n');
            markdown += `\n}\n\`\`\`\n`;
          });
          markdown += '\n';
        }

        // 类型定义
        if (summary.types.length > 0) {
          markdown += `**类型**:\n`;
          summary.types.forEach(type => {
            markdown += `\n\`\`\`typescript\ntype ${type.name} = ${type.definition};\n\`\`\`\n`;
          });
          markdown += '\n';
        }

        // 关联文件
        if (match.relatedFiles.length > 0) {
          markdown += `**关联文件**: `;
          markdown += match.relatedFiles.map(r => `\`${path.relative(projectPath, r.filePath)}\``).join(', ');
          markdown += '\n\n';
        }
      }

      markdown += '---\n\n';
    });
  }

  markdown += `## 🚀 执行建议

1. 理解用户需求，分析要实现的功能
2. 查看匹配到的代码模块，了解现有实现
3. 基于现有代码结构设计方案
4. 编写代码，遵循项目风格
5. 确保新功能不影响现有功能

---

*由 AI Pilot 自动生成*
`;

  return markdown;
}
