import { Command } from 'commander';
import path from 'path';
import chalk from 'chalk';
import fs from 'fs-extra';
import { DependencyTracer, ImpactAnalysis } from '../core/tracer.js';

/**
 * trace 命令实现
 * 分析文件的上下游依赖关系
 */
export function createTraceCommand(): Command {
  const traceCommand = new Command('trace');

  traceCommand
    .description('分析指定文件的上下游依赖关系')
    .argument('<file>', '要分析的文件路径')
    .option('-p, --path <path>', '项目根路径', process.cwd())
    .action(async (file: string, options) => {
      try {
        const projectPath = path.resolve(options.path);
        const targetFile = path.isAbsolute(file) ? file : path.join(projectPath, file);
        const outputFile = path.join(projectPath, 'IMPACT_ANALYSIS.md');

        console.log(chalk.blue('🔍 分析依赖关系...'));

        // 初始化追踪器
        const tracer = new DependencyTracer(projectPath);

        // 分析影响范围
        const analysis = await tracer.analyzeImpact(targetFile);

        // 生成文档
        const markdown = generateImpactDocument(analysis, projectPath);
        await fs.writeFile(outputFile, markdown, 'utf-8');

        console.log(chalk.green('✅ 影响分析完成'));
        console.log(chalk.gray(`📄 ${outputFile}`));
        console.log(chalk.gray(`📊 下游依赖: ${analysis.dependencies.length} 个文件`));
        console.log(chalk.gray(`📊 上游依赖: ${analysis.dependents.length} 个文件`));

      } catch (error: any) {
        console.error(chalk.red('❌ 分析失败:'), error.message);
        process.exit(1);
      }
    });

  return traceCommand;
}

/**
 * 生成影响分析文档
 */
function generateImpactDocument(analysis: ImpactAnalysis, projectPath: string): string {
  const timestamp = new Date().toLocaleString('zh-CN');
  const projectName = path.basename(projectPath);

  let markdown = `# 依赖关系影响分析

**项目**: ${projectName}  
**分析文件**: \`${analysis.targetRelativePath}\`  
**生成时间**: ${timestamp}

---

## ⚠️ 重要提示

**这是该文件的依赖关系图，请在修改代码时务必保持接口契约（Contract）的一致性。**

任何对该文件导出接口的修改都可能影响到依赖它的其他文件。请确保：
1. 不要随意修改导出函数的签名
2. 不要删除被外部使用的导出项
3. 修改接口定义时，同步更新所有使用方
4. 添加新功能时，考虑向后兼容性

---

## 📤 导出项

该文件导出了以下内容：

`;

  if (analysis.exports.length === 0) {
    markdown += `> 该文件没有导出任何内容\n\n`;
  } else {
    analysis.exports.forEach(exp => {
      const usageIndicator = exp.isUsedExternally ? '🔴 被外部使用' : '⚪ 未被外部使用';
      markdown += `- **${exp.type}** \`${exp.name}\` ${usageIndicator}\n`;
    });
    markdown += '\n';
  }

  markdown += `---

## 📥 下游依赖 (Dependencies)

该文件引用了以下自定义模块：

`;

  if (analysis.dependencies.length === 0) {
    markdown += `> 该文件没有依赖其他本地文件\n\n`;
  } else {
    // 按类型分组
    const grouped = groupByType(analysis.dependencies);

    Object.entries(grouped).forEach(([type, deps]) => {
      if (deps.length === 0) return;

      const typeEmoji = {
        component: '🧩',
        hook: '🪝',
        util: '🔧',
        service: '🌐',
        type: '📘',
        other: '📄',
      }[type] || '📄';

      markdown += `### ${typeEmoji} ${capitalizeFirst(type)} (${deps.length})\n\n`;

      deps.forEach(dep => {
        markdown += `**\`${dep.relativePath}\`**\n`;
        if (dep.imports.length > 0) {
          markdown += `- 导入: ${dep.imports.map((i: string) => `\`${i}\``).join(', ')}\n`;
        }
        markdown += '\n';
      });
    });
  }

  markdown += `---

## 📤 上游依赖 (Dependents)

以下文件依赖了当前文件：

`;

  if (analysis.dependents.length === 0) {
    markdown += `> ✅ 该文件未被其他文件引用，可以安全修改或删除\n\n`;
  } else {
    markdown += `> ⚠️ 共有 **${analysis.dependents.length}** 个文件依赖此文件，修改时需谨慎\n\n`;

    // 按使用次数排序
    const sortedDependents = [...analysis.dependents].sort((a, b) => b.usageCount - a.usageCount);

    sortedDependents.forEach((dep, index) => {
      markdown += `### ${index + 1}. \`${dep.relativePath}\`\n\n`;
      markdown += `**导入内容**: ${dep.importedItems.map(i => `\`${i}\``).join(', ')}\n`;
      markdown += `**使用次数**: ${dep.usageCount}\n\n`;
    });
  }

  markdown += `---

## 🎯 修改建议

### 如果要修改该文件：

1. **检查上游依赖**: 确认有 ${analysis.dependents.length} 个文件依赖此文件
2. **保持接口稳定**: 不要修改已导出的函数签名和类型定义
3. **测试影响范围**: 修改后需测试所有依赖文件
4. **渐进式重构**: 如需大改，考虑先添加新接口，再逐步迁移

### 如果要删除该文件：

`;

  if (analysis.dependents.length === 0) {
    markdown += `✅ 该文件未被引用，可以安全删除\n\n`;
  } else {
    markdown += `❌ 该文件被 ${analysis.dependents.length} 个文件引用，删除前需要：\n\n`;
    markdown += `1. 先移除所有引用\n`;
    markdown += `2. 或提供替代方案\n`;
    markdown += `3. 确保功能迁移完整\n\n`;
  }

  markdown += `---

*由 AI Pilot 自动生成*
`;

  return markdown;
}

/**
 * 按类型分组
 */
function groupByType(dependencies: any[]): Record<string, any[]> {
  const grouped: Record<string, any[]> = {
    component: [],
    hook: [],
    util: [],
    service: [],
    type: [],
    other: [],
  };

  dependencies.forEach(dep => {
    grouped[dep.type].push(dep);
  });

  return grouped;
}

/**
 * 首字母大写
 */
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}


