import { Project, SourceFile, SyntaxKind } from 'ts-morph';
import path from 'path';
import { FileAnalysis, ProjectMap } from './scanner.js';

/**
 * 上下文匹配结果
 */
export interface ContextMatch {
  file: FileAnalysis;
  matchScore: number;
  matchedKeywords: string[];
  codeSummary: CodeSummary;
  relatedFiles: RelatedFileInfo[];
}

/**
 * 代码摘要
 */
export interface CodeSummary {
  filePath: string;
  exports: ExportInfo[];
  interfaces: InterfaceDefinition[];
  types: TypeDefinition[];
  dependencies: string[];
  sourceCode?: string; // 完整源代码
}

export interface ExportInfo {
  name: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'const';
  signature?: string;
  isDefault?: boolean;
}

export interface InterfaceDefinition {
  name: string;
  properties: PropertyInfo[];
}

export interface TypeDefinition {
  name: string;
  definition: string;
}

export interface PropertyInfo {
  name: string;
  type: string;
  optional: boolean;
}

export interface RelatedFileInfo {
  filePath: string;
  relationType: 'import' | 'type' | 'dependency';
  codeSummary: CodeSummary;
}

/**
 * 上下文查找器
 * 负责根据用户需求提取关键词、匹配文件、组装上下文
 */
export class ContextFinder {
  private project: Project;
  private projectMap: ProjectMap | null = null;

  constructor(private rootPath: string) {
    const tsConfigPath = path.join(rootPath, 'tsconfig.json');
    const hasTsConfig = require('fs').existsSync(tsConfigPath);
    
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
   * 设置项目地图
   */
  setProjectMap(projectMap: ProjectMap): void {
    this.projectMap = projectMap;
    
    // 添加所有文件到 ts-morph 项目中
    for (const file of projectMap.files) {
      if (!this.project.getSourceFile(file.filePath)) {
        this.project.addSourceFileAtPath(file.filePath);
      }
    }
  }

  /**
   * 从用户输入中提取关键词（简单按空格拆分 + 去停用词）
   */
  extractKeywords(userInput: string): string[] {
    const keywords: Set<string> = new Set();
    
    // 移除常见停用词
    const stopWords = new Set(['的', '是', '在', '我', '要', '请', '帮', '和', '或', '与', '为', '了', '到', '对', '进行', '实现', '添加', '修改', '删除', '更新', '给', '把']);
    
    // 按空格拆分
    const tokens = userInput.trim().split(/\s+/);
    
    tokens.forEach(token => {
      if (token.length === 0) return;
      
      // 提取中文词语
      const chineseWords = token.match(/[\u4e00-\u9fa5]{2,}/g) || [];
      chineseWords.forEach(word => {
        if (!stopWords.has(word)) {
          keywords.add(word.toLowerCase());
        }
      });
      
      // 提取英文单词
      const englishWords = token.match(/[a-zA-Z][a-zA-Z0-9]*/g) || [];
      englishWords.forEach(word => {
        if (word.length >= 2) {
          keywords.add(word.toLowerCase());
          
          // 分解驼峰命名
          const camelParts = word.split(/(?=[A-Z])/).filter(p => p.length > 1);
          camelParts.forEach(part => keywords.add(part.toLowerCase()));
        }
      });
      
      // 提取文件名
      if (token.match(/[\w-]+\.(ts|tsx|js|jsx)/)) {
        keywords.add(token);
      }
    });
    
    return Array.from(keywords);
  }

  /**
   * 在项目地图中检索匹配的文件
   */
  findMatchingFiles(keywords: string[]): ContextMatch[] {
    if (!this.projectMap) {
      throw new Error('项目地图未设置，请先调用 setProjectMap');
    }

    const matches: ContextMatch[] = [];

    for (const file of this.projectMap.files) {
      const matchResult = this.calculateMatchScore(file, keywords);
      
      if (matchResult.score > 0) {
        // 高分匹配（>=10分）提取完整源代码
        const includeSource = matchResult.score >= 10;
        const codeSummary = this.extractCodeSummary(file.filePath, includeSource);
        const relatedFiles = this.traceRelatedFiles(file);
        
        matches.push({
          file,
          matchScore: matchResult.score,
          matchedKeywords: matchResult.matchedKeywords,
          codeSummary,
          relatedFiles,
        });
      }
    }

    // 按匹配分数降序排序
    return matches.sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * 计算文件匹配分数
   */
  private calculateMatchScore(file: FileAnalysis, keywords: string[]): { score: number; matchedKeywords: string[] } {
    let score = 0;
    const matchedKeywords: string[] = [];
    
    // 文件路径匹配
    const filePathLower = file.relativePath.toLowerCase();
    const fileNameLower = path.basename(file.filePath).toLowerCase();
    
    for (const keyword of keywords) {
      // 文件名完全匹配 - 高分
      if (fileNameLower.includes(keyword)) {
        score += 10;
        matchedKeywords.push(keyword);
      }
      // 路径匹配 - 中分
      else if (filePathLower.includes(keyword)) {
        score += 5;
        matchedKeywords.push(keyword);
      }
      
      // 导出函数/类匹配 - 高分
      for (const exp of file.exports) {
        if (exp.toLowerCase().includes(keyword)) {
          score += 8;
          matchedKeywords.push(keyword);
        }
      }
      
      // 函数名匹配 - 中分
      for (const func of file.functions) {
        if (func.name?.toLowerCase().includes(keyword)) {
          score += 6;
          matchedKeywords.push(keyword);
        }
      }
      
      // 接口/类型名匹配 - 中分
      for (const iface of file.interfaces) {
        if (iface.name?.toLowerCase().includes(keyword)) {
          score += 6;
          matchedKeywords.push(keyword);
        }
      }
    }
    
    return { score, matchedKeywords: [...new Set(matchedKeywords)] };
  }

  /**
   * 提取文件的代码摘要
   */
  extractCodeSummary(filePath: string, includeSource: boolean = false): CodeSummary {
    const sourceFile = this.project.getSourceFile(filePath);
    
    if (!sourceFile) {
      return {
        filePath,
        exports: [],
        interfaces: [],
        types: [],
        dependencies: [],
      };
    }

    const summary: CodeSummary = {
      filePath,
      exports: this.extractExports(sourceFile),
      interfaces: this.extractInterfaces(sourceFile),
      types: this.extractTypes(sourceFile),
      dependencies: this.extractDependencies(sourceFile),
    };

    // 如果需要包含源代码
    if (includeSource) {
      summary.sourceCode = sourceFile.getFullText();
    }

    return summary;
  }

  /**
   * 提取导出信息
   */
  private extractExports(sourceFile: SourceFile): ExportInfo[] {
    const exports: ExportInfo[] = [];

    // 提取命名导出的函数
    sourceFile.getFunctions().forEach(func => {
      if (func.isExported()) {
        exports.push({
          name: func.getName() || 'anonymous',
          type: 'function',
          signature: func.getSignature().getDeclaration().getText(),
          isDefault: func.isDefaultExport(),
        });
      }
    });

    // 提取命名导出的类
    sourceFile.getClasses().forEach(cls => {
      if (cls.isExported()) {
        exports.push({
          name: cls.getName() || 'anonymous',
          type: 'class',
          signature: `class ${cls.getName()} { ... }`,
          isDefault: cls.isDefaultExport(),
        });
      }
    });

    // 提取命名导出的接口
    sourceFile.getInterfaces().forEach(iface => {
      if (iface.isExported()) {
        exports.push({
          name: iface.getName(),
          type: 'interface',
          isDefault: false,
        });
      }
    });

    // 提取命名导出的类型别名
    sourceFile.getTypeAliases().forEach(typeAlias => {
      if (typeAlias.isExported()) {
        exports.push({
          name: typeAlias.getName(),
          type: 'type',
          isDefault: false,
        });
      }
    });

    // 提取命名导出的变量
    sourceFile.getVariableStatements().forEach(stmt => {
      if (stmt.isExported()) {
        stmt.getDeclarations().forEach(decl => {
          exports.push({
            name: decl.getName(),
            type: 'const',
            isDefault: stmt.isDefaultExport(),
          });
        });
      }
    });

    return exports;
  }

  /**
   * 提取接口定义
   */
  private extractInterfaces(sourceFile: SourceFile): InterfaceDefinition[] {
    return sourceFile.getInterfaces().map(iface => ({
      name: iface.getName(),
      properties: iface.getProperties().map(prop => ({
        name: prop.getName(),
        type: prop.getType().getText(),
        optional: prop.hasQuestionToken(),
      })),
    }));
  }

  /**
   * 提取类型定义
   */
  private extractTypes(sourceFile: SourceFile): TypeDefinition[] {
    return sourceFile.getTypeAliases().map(typeAlias => ({
      name: typeAlias.getName(),
      definition: typeAlias.getType().getText(),
    }));
  }

  /**
   * 提取依赖
   */
  private extractDependencies(sourceFile: SourceFile): string[] {
    const dependencies: string[] = [];
    
    sourceFile.getImportDeclarations().forEach(importDecl => {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      
      // 只记录本地文件依赖
      if (moduleSpecifier.startsWith('.') || moduleSpecifier.startsWith('@/')) {
        dependencies.push(moduleSpecifier);
      }
    });
    
    return dependencies;
  }

  /**
   * 追溯相关文件
   */
  private traceRelatedFiles(file: FileAnalysis): RelatedFileInfo[] {
    const relatedFiles: RelatedFileInfo[] = [];
    const visited = new Set<string>([file.filePath]);

    // 追溯直接导入的本地文件
    for (const imp of file.imports) {
      if (imp.isLocal && imp.resolvedPath && !visited.has(imp.resolvedPath)) {
        visited.add(imp.resolvedPath);
        
        const codeSummary = this.extractCodeSummary(imp.resolvedPath);
        relatedFiles.push({
          filePath: imp.resolvedPath,
          relationType: 'import',
          codeSummary,
        });
      }
    }

    // 追溯类型依赖（从接口和类型中引用的其他文件）
    const sourceFile = this.project.getSourceFile(file.filePath);
    if (sourceFile) {
      sourceFile.getInterfaces().forEach(iface => {
        iface.getProperties().forEach(prop => {
          const typeNode = prop.getTypeNode();
          if (typeNode) {
            const referencedFiles = this.findTypeReferences(typeNode);
            referencedFiles.forEach(refPath => {
              if (!visited.has(refPath)) {
                visited.add(refPath);
                relatedFiles.push({
                  filePath: refPath,
                  relationType: 'type',
                  codeSummary: this.extractCodeSummary(refPath),
                });
              }
            });
          }
        });
      });
    }

    return relatedFiles;
  }

  /**
   * 查找类型引用的文件
   */
  private findTypeReferences(typeNode: any): string[] {
    const referencedFiles: string[] = [];
    
    try {
      const type = typeNode.getType();
      const symbol = type.getSymbol();
      
      if (symbol) {
        const declarations = symbol.getDeclarations();
        declarations.forEach((decl: any) => {
          const sourceFile = decl.getSourceFile();
          const filePath = sourceFile.getFilePath();
          
          // 只记录本地文件
          if (filePath.includes(this.rootPath)) {
            referencedFiles.push(filePath);
          }
        });
      }
    } catch (error) {
      // 忽略类型解析错误
    }
    
    return referencedFiles;
  }
}

