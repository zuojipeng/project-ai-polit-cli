import { Project, SourceFile, SyntaxKind, Node } from 'ts-morph';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import fse from 'fs-extra';

const execAsync = promisify(exec);

/**
 * 文件变更信息
 */
export interface FileChange {
  filePath: string;
  relativePath: string;
  status: 'added' | 'modified' | 'deleted';
  changedLines: ChangedLine[];
  affectedBlocks: CodeBlock[];
}

/**
 * 变更行信息
 */
export interface ChangedLine {
  lineNumber: number;
  type: 'add' | 'delete' | 'modify';
  content: string;
}

/**
 * 受影响的代码块
 */
export interface CodeBlock {
  type: 'function' | 'method' | 'class' | 'interface' | 'component';
  name: string;
  startLine: number;
  endLine: number;
  signature: string;
  fullCode: string;
  changedLineNumbers: number[];
}

/**
 * Diff 分析结果
 */
export interface DiffAnalysis {
  totalFiles: number;
  fileChanges: FileChange[];
  summary: {
    added: number;
    modified: number;
    deleted: number;
  };
}

/**
 * Git Diff 分析器
 */
export class GitDiffAnalyzer {
  private project: Project;
  private rootPath: string;

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
   * 分析 Git 暂存区的变更
   */
  async analyzeStagedChanges(): Promise<DiffAnalysis> {
    // 1. 获取暂存文件列表
    const stagedFiles = await this.getStagedFiles();
    
    if (stagedFiles.length === 0) {
      return {
        totalFiles: 0,
        fileChanges: [],
        summary: { added: 0, modified: 0, deleted: 0 },
      };
    }

    // 2. 分析每个文件的变更
    const fileChanges: FileChange[] = [];
    const summary = { added: 0, modified: 0, deleted: 0 };

    for (const file of stagedFiles) {
      const absolutePath = path.join(this.rootPath, file.path);
      
      // 只处理源代码文件
      if (!this.isSourceFile(file.path)) {
        continue;
      }

      const fileChange = await this.analyzeFileChange(file.path, file.status, absolutePath);
      if (fileChange) {
        fileChanges.push(fileChange);
        summary[file.status]++;
      }
    }

    return {
      totalFiles: fileChanges.length,
      fileChanges,
      summary,
    };
  }

  /**
   * 获取暂存区文件列表
   */
  private async getStagedFiles(): Promise<Array<{ path: string; status: 'added' | 'modified' | 'deleted' }>> {
    try {
      // 获取暂存文件列表和状态
      const { stdout } = await execAsync('git diff --cached --name-status', {
        cwd: this.rootPath,
      });

      if (!stdout.trim()) {
        return [];
      }

      const files: Array<{ path: string; status: 'added' | 'modified' | 'deleted' }> = [];
      const lines = stdout.trim().split('\n');

      for (const line of lines) {
        const [status, filePath] = line.split('\t');
        
        let fileStatus: 'added' | 'modified' | 'deleted';
        if (status === 'A') {
          fileStatus = 'added';
        } else if (status === 'M') {
          fileStatus = 'modified';
        } else if (status === 'D') {
          fileStatus = 'deleted';
        } else {
          continue; // 跳过其他状态（重命名等）
        }

        files.push({ path: filePath, status: fileStatus });
      }

      return files;
    } catch (error: any) {
      if (error.message.includes('not a git repository')) {
        throw new Error('当前目录不是 Git 仓库');
      }
      throw error;
    }
  }

  /**
   * 分析单个文件的变更
   */
  private async analyzeFileChange(
    relativePath: string,
    status: 'added' | 'modified' | 'deleted',
    absolutePath: string
  ): Promise<FileChange | null> {
    // 删除的文件不需要分析
    if (status === 'deleted') {
      return {
        filePath: absolutePath,
        relativePath,
        status,
        changedLines: [],
        affectedBlocks: [],
      };
    }

    // 获取文件的 diff
    const changedLines = await this.getChangedLines(relativePath);
    
    if (changedLines.length === 0) {
      return null;
    }

    // 定位受影响的代码块
    const affectedBlocks = await this.locateAffectedBlocks(absolutePath, changedLines);

    return {
      filePath: absolutePath,
      relativePath,
      status,
      changedLines,
      affectedBlocks,
    };
  }

  /**
   * 获取文件的变更行信息
   */
  private async getChangedLines(relativePath: string): Promise<ChangedLine[]> {
    try {
      // 获取详细的 diff（包含行号）
      const { stdout } = await execAsync(`git diff --cached -U0 -- "${relativePath}"`, {
        cwd: this.rootPath,
      });

      const changedLines: ChangedLine[] = [];
      const lines = stdout.split('\n');
      
      let currentLine = 0;
      for (const line of lines) {
        // 解析 @@ 行号标记
        const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
        if (hunkMatch) {
          currentLine = parseInt(hunkMatch[1], 10);
          continue;
        }

        // 新增行
        if (line.startsWith('+') && !line.startsWith('+++')) {
          changedLines.push({
            lineNumber: currentLine,
            type: 'add',
            content: line.substring(1),
          });
          currentLine++;
        }
        // 删除行
        else if (line.startsWith('-') && !line.startsWith('---')) {
          changedLines.push({
            lineNumber: currentLine,
            type: 'delete',
            content: line.substring(1),
          });
          // 删除行不增加行号
        }
        // 未改变的行
        else if (line.startsWith(' ')) {
          currentLine++;
        }
      }

      return changedLines;
    } catch (error) {
      return [];
    }
  }

  /**
   * 定位受影响的代码块
   */
  private async locateAffectedBlocks(filePath: string, changedLines: ChangedLine[]): Promise<CodeBlock[]> {
    if (!await fse.pathExists(filePath)) {
      return [];
    }

    const sourceFile = this.project.addSourceFileAtPath(filePath);
    const blocks: CodeBlock[] = [];
    const processedBlocks = new Set<string>();

    // 只处理新增和修改的行
    const relevantLines = changedLines.filter(l => l.type === 'add' || l.type === 'modify');

    for (const changedLine of relevantLines) {
      const block = this.findCodeBlockAtLine(sourceFile, changedLine.lineNumber);
      
      if (block) {
        const blockKey = `${block.type}-${block.name}-${block.startLine}`;
        
        if (!processedBlocks.has(blockKey)) {
          processedBlocks.add(blockKey);
          blocks.push(block);
        } else {
          // 如果已存在，添加变更行号
          const existingBlock = blocks.find(b => 
            b.type === block.type && b.name === block.name && b.startLine === block.startLine
          );
          if (existingBlock && !existingBlock.changedLineNumbers.includes(changedLine.lineNumber)) {
            existingBlock.changedLineNumbers.push(changedLine.lineNumber);
          }
        }
      }
    }

    return blocks;
  }

  /**
   * 查找指定行所在的代码块
   */
  private findCodeBlockAtLine(sourceFile: SourceFile, lineNumber: number): CodeBlock | null {
    // 通过文本计算位置
    const text = sourceFile.getFullText();
    const lines = text.split('\n');
    let pos = 0;
    for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
      pos += lines[i].length + 1; // +1 for newline
    }
    
    const node = sourceFile.getDescendantAtPos(pos);

    if (!node) return null;

    // 向上查找最近的函数、方法、类或接口
    let current: Node | undefined = node;
    while (current) {
      // 函数声明
      if (current.getKind() === SyntaxKind.FunctionDeclaration) {
        const func = current.asKind(SyntaxKind.FunctionDeclaration);
        if (func) {
          const name = func.getName() || 'anonymous';
          const isComponent = this.isReactComponent(func.getText());
          
          return {
            type: isComponent ? 'component' : 'function',
            name,
            startLine: sourceFile.getLineAndColumnAtPos(func.getStart()).line,
            endLine: sourceFile.getLineAndColumnAtPos(func.getEnd()).line,
            signature: this.extractFunctionSignature(func),
            fullCode: func.getText(),
            changedLineNumbers: [lineNumber],
          };
        }
      }

      // 箭头函数（变量声明）
      if (current.getKind() === SyntaxKind.VariableDeclaration) {
        const varDecl = current.asKind(SyntaxKind.VariableDeclaration);
        if (varDecl) {
          const initializer = varDecl.getInitializer();
          if (initializer && initializer.getKind() === SyntaxKind.ArrowFunction) {
            const name = varDecl.getName();
            const code = varDecl.getParent().getParent().getText(); // 获取整个 const 声明
            const isComponent = this.isReactComponent(code);
            
            return {
              type: isComponent ? 'component' : 'function',
              name,
              startLine: sourceFile.getLineAndColumnAtPos(varDecl.getStart()).line,
              endLine: sourceFile.getLineAndColumnAtPos(varDecl.getEnd()).line,
              signature: `const ${name} = ${initializer.getText().split('{')[0]}=> {...}`,
              fullCode: code,
              changedLineNumbers: [lineNumber],
            };
          }
        }
      }

      // 方法声明
      if (current.getKind() === SyntaxKind.MethodDeclaration) {
        const method = current.asKind(SyntaxKind.MethodDeclaration);
        if (method) {
          const name = method.getName();
          const className = method.getParent().asKind(SyntaxKind.ClassDeclaration)?.getName() || 'Unknown';
          
          return {
            type: 'method',
            name: `${className}.${name}`,
            startLine: sourceFile.getLineAndColumnAtPos(method.getStart()).line,
            endLine: sourceFile.getLineAndColumnAtPos(method.getEnd()).line,
            signature: this.extractMethodSignature(method),
            fullCode: method.getText(),
            changedLineNumbers: [lineNumber],
          };
        }
      }

      // 类声明
      if (current.getKind() === SyntaxKind.ClassDeclaration) {
        const cls = current.asKind(SyntaxKind.ClassDeclaration);
        if (cls) {
          const name = cls.getName() || 'anonymous';
          
          return {
            type: 'class',
            name,
            startLine: sourceFile.getLineAndColumnAtPos(cls.getStart()).line,
            endLine: sourceFile.getLineAndColumnAtPos(cls.getEnd()).line,
            signature: `class ${name}`,
            fullCode: cls.getText(),
            changedLineNumbers: [lineNumber],
          };
        }
      }

      // 接口声明
      if (current.getKind() === SyntaxKind.InterfaceDeclaration) {
        const iface = current.asKind(SyntaxKind.InterfaceDeclaration);
        if (iface) {
          const name = iface.getName();
          
          return {
            type: 'interface',
            name,
            startLine: sourceFile.getLineAndColumnAtPos(iface.getStart()).line,
            endLine: sourceFile.getLineAndColumnAtPos(iface.getEnd()).line,
            signature: `interface ${name}`,
            fullCode: iface.getText(),
            changedLineNumbers: [lineNumber],
          };
        }
      }

      current = current.getParent();
    }

    return null;
  }

  /**
   * 提取函数签名
   */
  private extractFunctionSignature(func: any): string {
    const name = func.getName() || 'anonymous';
    const params = func.getParameters().map((p: any) => p.getText()).join(', ');
    const returnType = func.getReturnType().getText();
    const isAsync = func.isAsync() ? 'async ' : '';
    
    return `${isAsync}function ${name}(${params}): ${returnType}`;
  }

  /**
   * 提取方法签名
   */
  private extractMethodSignature(method: any): string {
    const name = method.getName();
    const params = method.getParameters().map((p: any) => p.getText()).join(', ');
    const returnType = method.getReturnType().getText();
    const isAsync = method.isAsync() ? 'async ' : '';
    
    return `${isAsync}${name}(${params}): ${returnType}`;
  }

  /**
   * 判断是否为 React 组件
   */
  private isReactComponent(code: string): boolean {
    return code.includes('return (') && (code.includes('<') || code.includes('jsx'));
  }

  /**
   * 判断是否为源代码文件
   */
  private isSourceFile(filePath: string): boolean {
    const ext = path.extname(filePath);
    return ['.ts', '.tsx', '.js', '.jsx'].includes(ext) && !filePath.includes('.test.') && !filePath.includes('.spec.');
  }
}


