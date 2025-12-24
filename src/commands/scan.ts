import { Command } from 'commander';
import path from 'path';
import chalk from 'chalk';
import fs from 'fs-extra';
import { ProjectScanner, FileRole } from '../core/scanner.js';
import { TaskHydrator } from '../core/hydrator.js';
import { MarkdownGenerator } from '../core/generator.js';
import { ProductDocGenerator } from '../core/product-doc-generator.js';

/**
 * scan 命令实现
 * 扫描项目并生成文档
 */
export function createScanCommand(): Command {
  const scanCommand = new Command('scan');

  scanCommand
    .description('扫描项目结构并生成 AI 友好的上下文文档')
    .option('-p, --path <path>', '项目路径', process.cwd())
    .option('-o, --output <output>', '输出目录', './ai-context')
    .option('--no-tsconfig', '不使用 tsconfig.json（适用于 monorepo）')
    .action(async (options) => {
      try {
        const projectPath = path.resolve(options.path);
        const outputPath = path.resolve(options.output);

        console.log(chalk.blue('🔍 扫描项目...'));
        console.log(chalk.gray(`📂 ${projectPath}`));

        // 初始化扫描器
        const scanner = new ProjectScanner(projectPath);
        const hydrator = new TaskHydrator();
        const generator = new MarkdownGenerator();
        const productDocGen = new ProductDocGenerator();

        // 生成项目地图
        const projectMap = await scanner.generateProjectMap();
        
        console.log(chalk.gray(`📊 发现 ${projectMap.totalFiles} 个文件`));

        // 提取任务
        const sourceFiles = await scanner.scanFiles();
        const allTasks = sourceFiles.map(file => ({
          file: file.getFilePath(),
          tasks: hydrator.extractTasks(file),
        }));

        const allAITasks = sourceFiles.flatMap(file => hydrator.extractAITasks(file));

        // 生成文档
        await generator.generateFullDoc(
          projectMap.projectName, 
          projectMap.files as any, 
          allTasks, 
          outputPath
        );

        // 保存项目地图 JSON
        await fs.ensureDir(outputPath);
        await fs.writeJson(
          path.join(outputPath, 'project-map.json'),
          projectMap,
          { spaces: 2 }
        );

        // 生成产品级文档
        const productDoc = productDocGen.generateProductDoc(projectMap);
        await fs.writeFile(
          path.join(outputPath, 'PRODUCT_OVERVIEW.md'),
          productDoc,
          'utf-8'
        );

        // 保存 AI 任务上下文
        if (allAITasks.length > 0) {
          await hydrator.saveAITasks(allAITasks, outputPath);
          const aiTasksMarkdown = generator.generateAITasksDocument(allAITasks, projectMap.projectName);
          await fs.writeFile(
            path.join(outputPath, 'AI_TASKS.md'),
            aiTasksMarkdown,
            'utf-8'
          );
        }

        // 保存任务清单
        await hydrator.saveToJson(
          { 
            projectMap,
            tasks: allTasks.filter(t => t.tasks.length > 0)
          },
          outputPath
        );

        console.log(chalk.green(`✅ 扫描完成 (${projectMap.totalFiles} 个文件)`));
        console.log(chalk.gray(`📁 ${outputPath}/`));
        console.log(chalk.green(`   ⭐ PRODUCT_OVERVIEW.md - 产品级项目文档`));
        console.log(chalk.gray(`   📊 project-map.json - 项目地图数据`));
        console.log(chalk.gray(`   📝 PROJECT_CONTEXT.md - 技术文档`));
      } catch (error) {
        console.error(chalk.red('❌ 扫描失败:'), error);
        process.exit(1);
      }
    });

  return scanCommand;
}

/**
 * 获取文件角色对应的 emoji
 */
function getRoleEmoji(role: FileRole): string {
  const emojiMap: Record<FileRole, string> = {
    [FileRole.COMPONENT]: '🧩',
    [FileRole.HOOK]: '🪝',
    [FileRole.UTILITY]: '🔧',
    [FileRole.SERVICE]: '🌐',
    [FileRole.TYPE]: '📘',
    [FileRole.CONFIG]: '⚙️',
    [FileRole.UNKNOWN]: '❓',
  };
  return emojiMap[role] || '📄';
}

