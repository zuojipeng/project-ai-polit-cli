import { Project, SourceFile, SyntaxKind } from 'ts-morph';
import path from 'path';
import fs from 'fs';
import fse from 'fs-extra';

/**
 * 依赖信息
 */
export interface DependencyInfo {
  filePath: string;
  relativePath: string;
  type: 'component' | 'hook' | 'util' | 'service' | 'type' | 'other';
  imports: string[]; // 从该文件导入的内容
}

/**
 * 依赖者信息（上游）
 */
export interface DependentInfo {
  filePath: string;
  relativePath: string;
  importedItems: string[]; // 从目标文件导入了什么
  usageCount: number; // 使用次数
}

/**
 * 影响分析结果
 */
export interface ImpactAnalysis {
  targetFile: string;
  targetRelativePath: string;
  exports: ExportedItem[];
  dependencies: DependencyInfo[]; // 下游：该文件依赖的文件
  dependents: DependentInfo[]; // 上游：依赖该文件的文件
}

export interface ExportedItem {
  name: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'const' | 'default';
  isUsedExternally: boolean; // 是否被其他文件使用
}

/**
 * 依赖追踪器
 */
export class DependencyTracer {
  private project: Project;
  private rootPath: string;
  private visited = new Set<string>();

  constructor(rootPath: string) {
    this.rootPath = rootPath;
    const tsConfigPath = path.join(rootPath, 'tsconfig.json');
    const hasTsConfig = fs.existsSync(tsConfigPath);
    
    this.project = new Project({
      tsConfigFilePath: hasTsConfig ? tsConfigPath : undefined,
      skipAddingFilesFromTsConfig: true,
      compilerOptions: hasTsConfig ? undefined : {
        target: 99, // ESNext
        module: 99, // ESNext
        moduleResolution: 2, // Node
        jsx: 4, // React JSX
        esModuleInterop: true,
        skipLibCheck: true,
      },
    });
  }

  /**
   * 分析指定文件的影响范围
   */
  async analyzeImpact(filePath: string): Promise<ImpactAnalysis> {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(this.rootPath, filePath);
    
    if (!await fse.pathExists(absolutePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }

    // 添加目标文件
    const sourceFile = this.project.addSourceFileAtPath(absolutePath);
    const relativePath = path.relative(this.rootPath, absolutePath);

    // 提取导出项
    const exports = this.extractExports(sourceFile);

    // 分析下游依赖
    this.visited.clear();
    const dependencies = this.analyzeDependencies(sourceFile);

    // 分析上游依赖者
    const dependents = await this.analyzeDependents(absolutePath);

    return {
      targetFile: absolutePath,
      targetRelativePath: relativePath,
      exports,
      dependencies,
      dependents,
    };
  }

  /**
   * 提取导出项
   */
  private extractExports(sourceFile: SourceFile): ExportedItem[] {
    const exports: ExportedItem[] = [];

    // 导出的函数
    sourceFile.getFunctions().forEach(func => {
      if (func.isExported()) {
        exports.push({
          name: func.getName() || 'anonymous',
          type: 'function',
          isUsedExternally: false, // 稍后更新
        });
      }
    });

    // 导出的类
    sourceFile.getClasses().forEach(cls => {
      if (cls.isExported()) {
        exports.push({
          name: cls.getName() || 'anonymous',
          type: 'class',
          isUsedExternally: false,
        });
      }
    });

    // 导出的接口
    sourceFile.getInterfaces().forEach(iface => {
      if (iface.isExported()) {
        exports.push({
          name: iface.getName(),
          type: 'interface',
          isUsedExternally: false,
        });
      }
    });

    // 导出的类型
    sourceFile.getTypeAliases().forEach(typeAlias => {
      if (typeAlias.isExported()) {
        exports.push({
          name: typeAlias.getName(),
          type: 'type',
          isUsedExternally: false,
        });
      }
    });

    // 导出的变量
    sourceFile.getVariableStatements().forEach(stmt => {
      if (stmt.isExported()) {
        stmt.getDeclarations().forEach(decl => {
          exports.push({
            name: decl.getName(),
            type: 'const',
            isUsedExternally: false,
          });
        });
      }
    });

    // 默认导出
    const defaultExport = sourceFile.getDefaultExportSymbol();
    if (defaultExport) {
      exports.push({
        name: 'default',
        type: 'default',
        isUsedExternally: false,
      });
    }

    return exports;
  }

  /**
   * 分析下游依赖（该文件引用了哪些文件）
   */
  private analyzeDependencies(sourceFile: SourceFile, depth: number = 0, maxDepth: number = 3): DependencyInfo[] {
    if (depth > maxDepth) return [];

    const filePath = sourceFile.getFilePath();
    if (this.visited.has(filePath)) return [];
    this.visited.add(filePath);

    const dependencies: DependencyInfo[] = [];

    sourceFile.getImportDeclarations().forEach(importDecl => {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      
      // 只处理本地文件
      if (!moduleSpecifier.startsWith('.') && !moduleSpecifier.startsWith('/')) {
        return;
      }

      const resolvedPath = this.resolveImportPath(path.dirname(filePath), moduleSpecifier);
      if (!resolvedPath || !resolvedPath.includes(this.rootPath)) {
        return;
      }

      const relativePath = path.relative(this.rootPath, resolvedPath);
      const type = this.determineFileType(resolvedPath);

      // 提取导入项
      const imports: string[] = [];
      const defaultImport = importDecl.getDefaultImport();
      if (defaultImport) {
        imports.push(defaultImport.getText());
      }
      importDecl.getNamedImports().forEach(named => {
        imports.push(named.getName());
      });

      dependencies.push({
        filePath: resolvedPath,
        relativePath,
        type,
        imports,
      });

      // 递归分析依赖的依赖
      if (depth < maxDepth) {
        const depSourceFile = this.project.addSourceFileAtPath(resolvedPath);
        const subDeps = this.analyzeDependencies(depSourceFile, depth + 1, maxDepth);
        dependencies.push(...subDeps);
      }
    });

    return dependencies;
  }

  /**
   * 分析上游依赖者（哪些文件引用了该文件）
   */
  private async analyzeDependents(targetPath: string): Promise<DependentInfo[]> {
    const dependents: DependentInfo[] = [];
    
    // 扫描项目中所有源文件
    const patterns = ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.js', 'src/**/*.jsx'];
    const { globby } = await import('globby');
    const files = await globby(patterns, {
      cwd: this.rootPath,
      ignore: ['node_modules/**', 'dist/**', 'build/**', '**/*.d.ts', '**/*.spec.*', '**/*.test.*'],
      absolute: true,
    });

    const targetRelative = path.relative(this.rootPath, targetPath);

    for (const file of files) {
      if (file === targetPath) continue;

      const sourceFile = this.project.addSourceFileAtPath(file);
      const importedItems: string[] = [];
      let usageCount = 0;

      // 检查是否导入了目标文件
      sourceFile.getImportDeclarations().forEach(importDecl => {
        const moduleSpecifier = importDecl.getModuleSpecifierValue();
        const resolvedPath = this.resolveImportPath(path.dirname(file), moduleSpecifier);
        
        if (resolvedPath === targetPath) {
          // 统计导入项
          const defaultImport = importDecl.getDefaultImport();
          if (defaultImport) {
            importedItems.push(defaultImport.getText());
            usageCount++;
          }
          importDecl.getNamedImports().forEach(named => {
            importedItems.push(named.getName());
            usageCount++;
          });
        }
      });

      if (importedItems.length > 0) {
        dependents.push({
          filePath: file,
          relativePath: path.relative(this.rootPath, file),
          importedItems,
          usageCount,
        });
      }
    }

    return dependents;
  }

  /**
   * 解析导入路径
   */
  private resolveImportPath(currentDir: string, moduleSpecifier: string): string | null {
    try {
      // 移除路径别名（简单处理）
      let specifier = moduleSpecifier;
      if (specifier.startsWith('@/')) {
        specifier = specifier.replace('@/', 'src/');
        currentDir = this.rootPath;
      }

      const possibleExtensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
      
      for (const ext of possibleExtensions) {
        const fullPath = path.resolve(currentDir, specifier + ext);
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }
    } catch (error) {
      // 忽略解析错误
    }
    
    return null;
  }

  /**
   * 判断文件类型
   */
  private determineFileType(filePath: string): DependencyInfo['type'] {
    const fileName = path.basename(filePath).toLowerCase();
    const content = fs.readFileSync(filePath, 'utf-8');

    // Hook
    if (fileName.startsWith('use') && fileName.match(/use[A-Z]/)) {
      return 'hook';
    }

    // Component (JSX/TSX 或包含 React 组件)
    if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
      return 'component';
    }
    if (content.includes('return (') && content.includes('<') && content.includes('/>')) {
      return 'component';
    }

    // Service
    if (fileName.includes('service') || fileName.includes('api') || fileName.includes('client')) {
      return 'service';
    }

    // Type
    if (fileName.includes('type') || fileName.endsWith('.d.ts')) {
      return 'type';
    }

    // Util
    if (fileName.includes('util') || fileName.includes('helper') || fileName.includes('tool')) {
      return 'util';
    }

    return 'other';
  }
}


