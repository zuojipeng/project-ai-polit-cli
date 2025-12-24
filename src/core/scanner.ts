import { Project, SourceFile, SyntaxKind, Node } from 'ts-morph';
import { globby } from 'globby';
import path from 'path';
import fs from 'fs';

/**
 * 文件角色类型
 */
export enum FileRole {
  COMPONENT = 'Component',      // React 组件
  HOOK = 'Hook',                // React Hook
  UTILITY = 'Utility',          // 工具函数
  SERVICE = 'Service',          // 服务类/API
  TYPE = 'Type',                // 类型定义
  CONFIG = 'Config',            // 配置文件
  UNKNOWN = 'Unknown',          // 未知类型
}

/**
 * 文件分析结果
 */
export interface FileAnalysis {
  filePath: string;
  relativePath: string;
  role: FileRole;
  exports: string[];
  dependencies: string[];      // 本地文件依赖
  imports: ImportInfo[];
  functions: FunctionInfo[];
  classes: ClassInfo[];
  interfaces: InterfaceInfo[];
}

export interface ImportInfo {
  moduleSpecifier: string;
  namedImports: string[];
  defaultImport?: string;
  isLocal: boolean;           // 是否为本地文件
  resolvedPath?: string;      // 解析后的绝对路径
}

export interface FunctionInfo {
  name?: string;
  parameters: string[];
  isAsync: boolean;
  isExported: boolean;
  returnsJSX: boolean;        // 是否返回 JSX
}

export interface ClassInfo {
  name?: string;
  methods: string[];
  properties: string[];
  isExported: boolean;
}

export interface InterfaceInfo {
  name?: string;
  properties: string[];
  isExported: boolean;
}

/**
 * 项目逻辑地图
 */
export interface ProjectMap {
  projectName: string;
  rootPath: string;
  totalFiles: number;
  filesByRole: Record<FileRole, number>;
  files: FileAnalysis[];
  dependencyGraph: Record<string, string[]>;
}

/**
 * 项目扫描器
 * 负责扫描项目文件并进行 AST 分析
 */
export class ProjectScanner {
  private project: Project;
  private fileAnalysisMap: Map<string, FileAnalysis> = new Map();

  constructor(private rootPath: string) {
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
   * 扫描指定模式的文件
   */
  async scanFiles(patterns?: string[]): Promise<SourceFile[]> {
    // 如果没有指定模式，自动检测项目结构
    if (!patterns) {
      patterns = await this.detectProjectStructure();
    }

    const files = await globby(patterns, {
      cwd: this.rootPath,
      ignore: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.next/**',
        '**/.nuxt/**',
        '**/out/**',
        '**/*.d.ts',
        '**/*.spec.*',
        '**/*.test.*',
        '**/*.min.js',
        '**/coverage/**',
        '**/.git/**',
      ],
      absolute: true,
      onlyFiles: true,
      deep: 10, // 限制深度
    });

    // 批量添加文件，避免一次性加载太多
    console.log(`找到 ${files.length} 个文件，开始解析...`);
    
    if (files.length > 5000) {
      console.warn(`⚠️  文件数量过多 (${files.length})，建议使用 --path 参数聚焦特定目录`);
    }
    
    return files.map(filePath => this.project.addSourceFileAtPath(filePath));
  }

  /**
   * 自动检测项目结构
   */
  private async detectProjectStructure(): Promise<string[]> {
    const fs = await import('fs');
    const possiblePatterns = [
      // Monorepo 结构
      'apps/*/src/**/*.{ts,tsx,js,jsx}',
      'packages/*/src/**/*.{ts,tsx,js,jsx}',
      'apps/**/*.{ts,tsx,js,jsx}',
      'packages/**/*.{ts,tsx,js,jsx}',
      // 普通项目结构
      'src/**/*.{ts,tsx,js,jsx}',
      // 根目录直接有代码文件
      '*.{ts,tsx,js,jsx}',
    ];

    // 检测是否为 monorepo
    const hasApps = fs.existsSync(path.join(this.rootPath, 'apps'));
    const hasPackages = fs.existsSync(path.join(this.rootPath, 'packages'));
    const hasSrc = fs.existsSync(path.join(this.rootPath, 'src'));

    if (hasApps || hasPackages) {
      // Monorepo 项目
      const patterns = [];
      if (hasApps) {
        patterns.push('apps/*/src/**/*.{ts,tsx,js,jsx}');
        patterns.push('apps/**/*.{ts,tsx,js,jsx}');
      }
      if (hasPackages) {
        patterns.push('packages/*/src/**/*.{ts,tsx,js,jsx}');
        patterns.push('packages/**/*.{ts,tsx,js,jsx}');
      }
      return patterns;
    } else if (hasSrc) {
      // 普通项目
      return ['src/**/*.{ts,tsx,js,jsx}'];
    } else {
      // 根目录查找
      return ['**/*.{ts,tsx,js,jsx}'];
    }
  }

  /**
   * 扫描并生成项目逻辑地图
   */
  async generateProjectMap(): Promise<ProjectMap> {
    const sourceFiles = await this.scanFiles();
    const fileAnalyses: FileAnalysis[] = [];

    // 第一轮：分析所有文件
    for (const sourceFile of sourceFiles) {
      const analysis = this.analyzeFile(sourceFile);
      fileAnalyses.push(analysis);
      this.fileAnalysisMap.set(analysis.filePath, analysis);
    }

    // 统计文件角色分布
    const filesByRole: Record<FileRole, number> = {
      [FileRole.COMPONENT]: 0,
      [FileRole.HOOK]: 0,
      [FileRole.UTILITY]: 0,
      [FileRole.SERVICE]: 0,
      [FileRole.TYPE]: 0,
      [FileRole.CONFIG]: 0,
      [FileRole.UNKNOWN]: 0,
    };

    fileAnalyses.forEach(analysis => {
      filesByRole[analysis.role]++;
    });

    // 构建依赖图
    const dependencyGraph: Record<string, string[]> = {};
    fileAnalyses.forEach(analysis => {
      dependencyGraph[analysis.relativePath] = analysis.dependencies;
    });

    return {
      projectName: path.basename(this.rootPath),
      rootPath: this.rootPath,
      totalFiles: fileAnalyses.length,
      filesByRole,
      files: fileAnalyses,
      dependencyGraph,
    };
  }

  /**
   * 分析文件结构
   */
  analyzeFile(sourceFile: SourceFile): FileAnalysis {
    const filePath = sourceFile.getFilePath();
    const relativePath = path.relative(this.rootPath, filePath);

    const imports = this.extractImports(sourceFile, filePath);
    const functions = this.extractFunctions(sourceFile);
    const classes = this.extractClasses(sourceFile);
    const interfaces = this.extractInterfaces(sourceFile);
    const exportedNames = this.extractExportedNames(sourceFile);

    // 判断文件角色
    const role = this.determineFileRole(sourceFile, exportedNames, functions);

    // 提取本地依赖
    const dependencies = imports
      .filter(imp => imp.isLocal && imp.resolvedPath)
      .map(imp => path.relative(this.rootPath, imp.resolvedPath!));

    return {
      filePath,
      relativePath,
      role,
      exports: exportedNames,
      dependencies,
      imports,
      functions,
      classes,
      interfaces,
    };
  }

  /**
   * 提取导入信息
   */
  private extractImports(sourceFile: SourceFile, currentFilePath: string): ImportInfo[] {
    return sourceFile.getImportDeclarations().map(imp => {
      const moduleSpecifier = imp.getModuleSpecifierValue();
      const isLocal = moduleSpecifier.startsWith('.') || moduleSpecifier.startsWith('/');
      
      let resolvedPath: string | undefined;
      if (isLocal) {
        const currentDir = path.dirname(currentFilePath);
        resolvedPath = this.resolveLocalImport(currentDir, moduleSpecifier);
      }

      return {
        moduleSpecifier,
        namedImports: imp.getNamedImports().map(n => n.getName()),
        defaultImport: imp.getDefaultImport()?.getText(),
        isLocal,
        resolvedPath,
      };
    });
  }

  /**
   * 解析本地导入路径
   */
  private resolveLocalImport(currentDir: string, importPath: string): string {
    let resolved = path.resolve(currentDir, importPath);
    
    // 尝试添加常见扩展名
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
    for (const ext of extensions) {
      const testPath = resolved + ext;
      if (this.project.getSourceFile(testPath)) {
        return testPath;
      }
    }
    
    return resolved;
  }

  /**
   * 提取导出的名称
   */
  private extractExportedNames(sourceFile: SourceFile): string[] {
    const exportedNames: string[] = [];
    const exportedDeclarations = sourceFile.getExportedDeclarations();

    exportedDeclarations.forEach((declarations, name) => {
      exportedNames.push(name);
    });

    return exportedNames;
  }

  /**
   * 提取函数信息
   */
  private extractFunctions(sourceFile: SourceFile): FunctionInfo[] {
    const functions: FunctionInfo[] = [];

    // 提取函数声明
    sourceFile.getFunctions().forEach(fn => {
      functions.push({
        name: fn.getName(),
        parameters: fn.getParameters().map(p => p.getName()),
        isAsync: fn.isAsync(),
        isExported: fn.isExported(),
        returnsJSX: this.checkReturnsJSX(fn),
      });
    });

    // 提取箭头函数和函数表达式
    sourceFile.getVariableDeclarations().forEach(varDecl => {
      const initializer = varDecl.getInitializer();
      if (initializer && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))) {
        functions.push({
          name: varDecl.getName(),
          parameters: initializer.getParameters().map(p => p.getName()),
          isAsync: Node.isArrowFunction(initializer) ? initializer.isAsync() : initializer.isAsync(),
          isExported: varDecl.isExported(),
          returnsJSX: this.checkReturnsJSX(initializer),
        });
      }
    });

    return functions;
  }

  /**
   * 检查函数是否返回 JSX
   */
  private checkReturnsJSX(fn: any): boolean {
    try {
      const returnStatements = fn.getDescendantsOfKind(SyntaxKind.ReturnStatement);
      for (const stmt of returnStatements) {
        const expression = stmt.getExpression();
        if (expression && Node.isJsxElement(expression) || Node.isJsxSelfClosingElement(expression) || Node.isJsxFragment(expression)) {
          return true;
        }
      }
      
      // 检查箭头函数的直接返回
      if (Node.isArrowFunction(fn)) {
        const body = fn.getBody();
        if (body && (Node.isJsxElement(body) || Node.isJsxSelfClosingElement(body) || Node.isJsxFragment(body))) {
          return true;
        }
      }
    } catch (error) {
      // 忽略错误
    }
    return false;
  }

  /**
   * 提取类信息
   */
  private extractClasses(sourceFile: SourceFile): ClassInfo[] {
    return sourceFile.getClasses().map(cls => ({
      name: cls.getName(),
      methods: cls.getMethods().map(m => m.getName()),
      properties: cls.getProperties().map(p => p.getName()),
      isExported: cls.isExported(),
    }));
  }

  /**
   * 提取接口信息
   */
  private extractInterfaces(sourceFile: SourceFile): InterfaceInfo[] {
    return sourceFile.getInterfaces().map(iface => ({
      name: iface.getName(),
      properties: iface.getProperties().map(p => p.getName()),
      isExported: iface.isExported(),
    }));
  }

  /**
   * 判断文件角色
   */
  private determineFileRole(sourceFile: SourceFile, exportedNames: string[], functions: FunctionInfo[]): FileRole {
    const fileName = path.basename(sourceFile.getFilePath());

    // 检查是否为配置文件
    if (fileName.includes('config') || fileName.includes('.config.')) {
      return FileRole.CONFIG;
    }

    // 检查导出的名称
    for (const name of exportedNames) {
      // Hook: 以 use 开头的导出
      if (name.startsWith('use') && name.length > 3 && name[3] === name[3].toUpperCase()) {
        return FileRole.HOOK;
      }

      // Component: 大写开头的函数且可能返回 JSX
      if (name[0] === name[0].toUpperCase()) {
        const func = functions.find(f => f.name === name);
        if (func && func.returnsJSX) {
          return FileRole.COMPONENT;
        }
      }
    }

    // 检查函数是否返回 JSX
    const hasJSXFunction = functions.some(fn => fn.returnsJSX && fn.isExported);
    if (hasJSXFunction) {
      return FileRole.COMPONENT;
    }

    // 检查是否只有类型定义
    const hasOnlyTypes = sourceFile.getInterfaces().length > 0 || 
                        sourceFile.getTypeAliases().length > 0;
    const hasNoLogic = functions.length === 0 && sourceFile.getClasses().length === 0;
    if (hasOnlyTypes && hasNoLogic) {
      return FileRole.TYPE;
    }

    // 检查是否为服务类
    if (fileName.includes('service') || fileName.includes('api') || fileName.includes('client')) {
      return FileRole.SERVICE;
    }

    // 检查类
    const classes = sourceFile.getClasses();
    if (classes.length > 0) {
      const className = classes[0].getName();
      if (className && (className.includes('Service') || className.includes('API') || className.includes('Client'))) {
        return FileRole.SERVICE;
      }
    }

    // 默认为工具函数
    if (functions.length > 0) {
      return FileRole.UTILITY;
    }

    return FileRole.UNKNOWN;
  }
}

