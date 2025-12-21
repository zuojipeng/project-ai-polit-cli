import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import type { TaskContext, FunctionSignature } from './hydrator.js';

/**
 * Markdown 文档生成器
 * 负责生成 AI 友好的项目上下文文档
 */
export class MarkdownGenerator {
  /**
   * 生成项目概览文档
   */
  generateOverview(projectName: string, fileCount: number, summary: any): string {
    let md = `# ${projectName} - 项目概览\n\n`;
    md += `> 自动生成的项目上下文文档\n\n`;
    md += `## 📊 项目统计\n\n`;
    md += `- 总文件数: ${fileCount}\n`;
    md += `- 总函数数: ${summary.totalFunctions || 0}\n`;
    md += `- 总类数: ${summary.totalClasses || 0}\n`;
    md += `- 总接口数: ${summary.totalInterfaces || 0}\n\n`;

    return md;
  }

  /**
   * 生成文件详情文档
   */
  generateFileDetails(fileAnalyses: any[]): string {
    let md = `## 📁 文件详情\n\n`;

    fileAnalyses.forEach(analysis => {
      const fileName = path.basename(analysis.filePath);
      md += `### ${fileName}\n\n`;
      md += `**路径**: \`${analysis.filePath}\`\n\n`;

      if (analysis.functions.length > 0) {
        md += `**函数**:\n`;
        analysis.functions.forEach((fn: any) => {
          md += `- \`${fn.name}\` ${fn.isAsync ? '(async)' : ''}\n`;
        });
        md += '\n';
      }

      if (analysis.classes.length > 0) {
        md += `**类**:\n`;
        analysis.classes.forEach((cls: any) => {
          md += `- \`${cls.name}\` - ${cls.methods.length} 个方法\n`;
        });
        md += '\n';
      }

      if (analysis.interfaces.length > 0) {
        md += `**接口**:\n`;
        analysis.interfaces.forEach((iface: any) => {
          md += `- \`${iface.name}\`\n`;
        });
        md += '\n';
      }

      md += '---\n\n';
    });

    return md;
  }

  /**
   * 生成任务清单文档
   */
  generateTaskList(tasks: Array<{ file: string; tasks: any[] }>): string {
    let md = `## ✅ 任务清单\n\n`;

    if (tasks.length === 0) {
      md += `暂无待办任务\n\n`;
      return md;
    }

    tasks.forEach(({ file, tasks: fileTasks }) => {
      if (fileTasks.length > 0) {
        md += `### ${path.basename(file)}\n\n`;
        fileTasks.forEach(task => {
          md += `- [${task.type}] ${task.text} (第 ${task.line} 行)\n`;
        });
        md += '\n';
      }
    });

    return md;
  }

  /**
   * 保存 Markdown 文档
   */
  async saveMarkdown(content: string, outputPath: string, fileName: string): Promise<void> {
    await fs.ensureDir(outputPath);
    const filePath = path.join(outputPath, fileName);
    await fs.writeFile(filePath, content, 'utf-8');
    console.log(chalk.green(`✓ 文档已生成: ${filePath}`));
  }

  /**
   * 生成 AI 友好的任务文档（核心功能）
   */
  generateAITasksDocument(tasks: TaskContext[], projectName: string): string {
    let md = '';

    // System Prompt
    md += this.generateSystemPrompt();
    md += '\n\n---\n\n';

    // 项目信息
    md += `# 🤖 AI 开发任务 - ${projectName}\n\n`;
    md += `> 本文档包含 ${tasks.length} 个需要 AI 协助的开发任务\n\n`;
    md += `**使用说明**：\n`;
    md += `- 每个任务都包含完整的代码上下文和类型定义\n`;
    md += `- 文件路径使用绝对路径，方便直接定位和编辑\n`;
    md += `- 已自动生成针对性的 Prompt，可直接使用或修改\n\n`;
    md += `---\n\n`;

    // 任务列表
    tasks.forEach((task, index) => {
      md += this.generateTaskSection(task, index + 1);
      md += '\n\n';
    });

    return md;
  }

  /**
   * 生成 System Prompt
   */
  private generateSystemPrompt(): string {
    let prompt = `# 📋 System Prompt for AI\n\n`;
    prompt += `你是一个专业的代码助手，正在协助开发者完成项目中的开发任务。\n\n`;
    prompt += `## 📌 使用指南\n\n`;
    prompt += `本文档通过 \`ai-pilot\` 工具自动生成，包含以下信息：\n\n`;
    prompt += `1. **任务描述**：来自代码中的 \`@AI-TODO\` 注释，描述了具体需求\n`;
    prompt += `2. **代码上下文**：任务所在的完整代码块（函数/方法/类）\n`;
    prompt += `3. **类型定义**：代码块中使用的所有接口和类型定义\n`;
    prompt += `4. **依赖导入**：相关的 import 语句\n`;
    prompt += `5. **工具函数签名**：引用的函数仅显示签名，隐藏实现（Token 压缩）\n`;
    prompt += `6. **文件位置**：精确的文件路径和行号\n\n`;
    prompt += `## 💡 Token 优化\n\n`;
    prompt += `为节省 Token 并避免干扰，工具函数仅显示签名。你只需关注主要任务代码块。\n\n`;
    prompt += `## 🎯 你的职责\n\n`;
    prompt += `- 仔细阅读任务描述和代码上下文\n`;
    prompt += `- 基于提供的类型定义，确保类型安全\n`;
    prompt += `- 保持代码风格与现有代码一致\n`;
    prompt += `- 提供完整可运行的代码，而非伪代码\n`;
    prompt += `- 如有疑问，提出明确的问题\n\n`;
    prompt += `## ⚠️ 注意事项\n\n`;
    prompt += `- **不要**修改类型定义，除非任务明确要求\n`;
    prompt += `- **不要**引入新的外部依赖，除非任务明确要求\n`;
    prompt += `- **保持**现有的函数签名和接口契约\n`;
    prompt += `- **确保**代码符合 TypeScript 严格模式\n`;

    return prompt;
  }

  /**
   * 生成单个任务区域
   */
  private generateTaskSection(task: TaskContext, index: number): string {
    let section = `## Task ${index}: ${task.taskId}\n\n`;

    // 任务元信息
    section += `**📝 任务描述**\n\n`;
    section += `> ${task.taskDescription}\n\n`;

    // 文件位置
    section += `**📍 位置信息**\n\n`;
    section += `- **文件路径**: \`${task.filePath}\`\n`;
    section += `- **行号**: ${task.line}\n`;
    section += `- **代码块**: ${task.codeBlock.type}`;
    if (task.codeBlock.name) {
      section += ` \`${task.codeBlock.name}\``;
    }
    section += ` (第 ${task.codeBlock.startLine}-${task.codeBlock.endLine} 行)\n\n`;

    // 自动生成的 Prompt
    section += this.generateTaskPrompt(task);
    section += '\n\n';

    // 当前代码
    section += `**💻 当前代码**\n\n`;
    section += `\`\`\`typescript\n`;
    section += `// 文件: ${task.filePath}\n`;
    section += `// 行: ${task.codeBlock.startLine}-${task.codeBlock.endLine}\n\n`;
    section += task.codeBlock.code;
    section += `\n\`\`\`\n\n`;

    // 相关类型定义
    if (task.relatedInterfaces.length > 0 || task.relatedTypes.length > 0) {
      section += `**🔷 相关类型定义**\n\n`;
      
      task.relatedInterfaces.forEach(iface => {
        section += `\`\`\`typescript\n`;
        section += `// Interface: ${iface.name}\n`;
        section += iface.code;
        section += `\n\`\`\`\n\n`;
      });

      task.relatedTypes.forEach(type => {
        section += `\`\`\`typescript\n`;
        section += `// Type: ${type.name} (${type.kind})\n`;
        section += type.code;
        section += `\n\`\`\`\n\n`;
      });
    }

    // 依赖导入
    if (task.imports.length > 0) {
      section += `**📥 相关导入**\n\n`;
      section += `\`\`\`typescript\n`;
      task.imports.forEach(imp => {
        section += `${imp}\n`;
      });
      section += `\`\`\`\n\n`;
    }

    // 工具函数签名（Token 压缩）
    if (task.referencedFunctions.length > 0) {
      section += `**🔧 引用的工具函数** (仅签名，节省 Token)\n\n`;
      section += `> 以下是代码中调用的工具函数，为节省 Token 仅显示签名\n\n`;
      task.referencedFunctions.forEach(func => {
        section += `\`\`\`typescript\n`;
        section += `// ${func.name}\n`;
        section += `${func.signature}\n`;
        section += `\`\`\`\n\n`;
      });
    }

    section += `---\n`;

    return section;
  }

  /**
   * 根据任务类型生成针对性的 Prompt
   */
  private generateTaskPrompt(task: TaskContext): string {
    const description = task.taskDescription.toLowerCase();
    let prompt = `**🎯 AI Prompt** (自动生成)\n\n`;
    prompt += `\`\`\`\n`;

    // 根据任务描述生成不同的 Prompt
    if (description.includes('优化') || description.includes('性能')) {
      prompt += `请优化以下代码：\n\n`;
      prompt += `任务：${task.taskDescription}\n`;
      prompt += `文件：${task.filePath}\n\n`;
      prompt += `要求：\n`;
      prompt += `1. 分析当前代码的性能瓶颈\n`;
      prompt += `2. 提供优化后的完整代码\n`;
      prompt += `3. 说明优化的原理和性能提升预期\n`;
      prompt += `4. 保持现有的类型定义和函数签名\n`;
    } else if (description.includes('重构')) {
      prompt += `请重构以下代码：\n\n`;
      prompt += `任务：${task.taskDescription}\n`;
      prompt += `文件：${task.filePath}\n\n`;
      prompt += `要求：\n`;
      prompt += `1. 保持功能不变\n`;
      prompt += `2. 提高代码可读性和可维护性\n`;
      prompt += `3. 遵循 SOLID 原则和最佳实践\n`;
      prompt += `4. 保持现有的类型定义\n`;
    } else if (description.includes('实现') || description.includes('添加')) {
      prompt += `请实现以下功能：\n\n`;
      prompt += `任务：${task.taskDescription}\n`;
      prompt += `文件：${task.filePath}\n\n`;
      prompt += `要求：\n`;
      prompt += `1. 提供完整的实现代码\n`;
      prompt += `2. 确保类型安全，使用提供的类型定义\n`;
      prompt += `3. 添加必要的错误处理\n`;
      prompt += `4. 包含简要的代码注释\n`;
    } else if (description.includes('修复') || description.includes('bug')) {
      prompt += `请修复以下问题：\n\n`;
      prompt += `任务：${task.taskDescription}\n`;
      prompt += `文件：${task.filePath}\n\n`;
      prompt += `要求：\n`;
      prompt += `1. 识别并说明问题所在\n`;
      prompt += `2. 提供修复后的完整代码\n`;
      prompt += `3. 解释修复方案\n`;
      prompt += `4. 考虑边界情况\n`;
    } else {
      prompt += `请根据以下任务描述，修改代码：\n\n`;
      prompt += `任务：${task.taskDescription}\n`;
      prompt += `文件：${task.filePath}\n\n`;
      prompt += `要求：\n`;
      prompt += `1. 仔细理解任务需求\n`;
      prompt += `2. 提供完整的修改后代码\n`;
      prompt += `3. 确保类型安全\n`;
      prompt += `4. 保持代码质量\n`;
    }

    prompt += `\n请直接提供可用的代码，包含完整的函数/方法实现。\n`;
    prompt += `\`\`\``;

    return prompt;
  }

  /**
   * 生成完整的项目文档
   */
  async generateFullDoc(
    projectName: string,
    fileAnalyses: any[],
    tasks: any[],
    outputPath: string
  ): Promise<void> {
    const summary = {
      totalFunctions: fileAnalyses.reduce((sum, f) => sum + f.functions.length, 0),
      totalClasses: fileAnalyses.reduce((sum, f) => sum + f.classes.length, 0),
      totalInterfaces: fileAnalyses.reduce((sum, f) => sum + f.interfaces.length, 0),
    };

    let fullDoc = this.generateOverview(projectName, fileAnalyses.length, summary);
    fullDoc += this.generateFileDetails(fileAnalyses);
    fullDoc += this.generateTaskList(tasks);

    await this.saveMarkdown(fullDoc, outputPath, 'PROJECT_CONTEXT.md');
  }
}

