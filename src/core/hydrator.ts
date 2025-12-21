import { SourceFile, Node, SyntaxKind, FunctionDeclaration, MethodDeclaration, ArrowFunction, FunctionExpression } from 'ts-morph';
import fs from 'fs-extra';

/**
 * AI 任务上下文
 * 包含任务描述和所需的完整代码上下文
 */
export interface TaskContext {
  taskId: string;                    // 任务唯一标识
  filePath: string;                  // 文件路径
  line: number;                      // 任务所在行号
  taskDescription: string;           // 任务描述
  codeBlock: {
    type: 'function' | 'method' | 'arrow' | 'class';
    name?: string;
    code: string;                    // 完整代码块
    startLine: number;
    endLine: number;
  };
  relatedTypes: TypeDefinition[];    // 相关的类型定义
  relatedInterfaces: InterfaceDefinition[];  // 相关的接口定义
  imports: string[];                 // 该代码块的导入依赖
  referencedFunctions: FunctionSignature[];  // 被引用的工具函数（用于 Token 压缩）
}

/**
 * 函数签名（用于 Token 压缩）
 */
export interface FunctionSignature {
  name: string;
  signature: string;                 // 函数签名
  isUtility: boolean;                // 是否为工具函数
}

/**
 * 类型定义
 */
export interface TypeDefinition {
  name: string;
  code: string;
  kind: 'type' | 'enum';
}

/**
 * 接口定义
 */
export interface InterfaceDefinition {
  name: string;
  code: string;
  properties: string[];
}

/**
 * 任务水合器
 * 负责提取关键代码片段和生成任务清单
 */
export class TaskHydrator {
  /**
   * 提取文件的关键代码
   */
  extractKeyCode(sourceFile: SourceFile): string {
    const fullText = sourceFile.getFullText();
    const lines = fullText.split('\n');
    
    // 简单示例：返回前50行或全部内容
    const preview = lines.slice(0, 50).join('\n');
    const hasMore = lines.length > 50;
    
    return hasMore ? `${preview}\n\n// ... ${lines.length - 50} more lines` : preview;
  }

  /**
   * 从注释中提取 TODO 任务（简单版本，向后兼容）
   */
  extractTasks(sourceFile: SourceFile): Array<{ type: string; text: string; line: number }> {
    const tasks: Array<{ type: string; text: string; line: number }> = [];
    const fullText = sourceFile.getFullText();
    const lines = fullText.split('\n');

    lines.forEach((line, index) => {
      const todoMatch = line.match(/\/\/\s*(TODO|FIXME|HACK|NOTE):\s*(.+)/i);
      if (todoMatch) {
        tasks.push({
          type: todoMatch[1].toUpperCase(),
          text: todoMatch[2].trim(),
          line: index + 1,
        });
      }
    });

    return tasks;
  }

  /**
   * 扫描并提取 @AI-TODO 任务及其完整上下文
   * 这是核心亮点功能
   */
  extractAITasks(sourceFile: SourceFile): TaskContext[] {
    const aiTasks: TaskContext[] = [];
    const filePath = sourceFile.getFilePath();
    
    // 遍历所有注释
    const allComments = this.findAllComments(sourceFile);
    
    allComments.forEach((comment, index) => {
      const match = comment.text.match(/@AI-TODO\s+(.+)/);
      if (match) {
        const taskDescription = match[1].trim();
        const taskId = `task-${aiTasks.length + 1}`;
        
        // 找到注释之后的代码块（注释通常在函数上方）
        const codeBlock = this.findFollowingCodeBlock(sourceFile, comment.line);
        
        if (codeBlock) {
          // 提取代码块中使用的类型
          const usedTypes = this.extractUsedTypes(codeBlock.node);
          
          // 从文件中查找这些类型的定义
          const relatedTypes = this.findTypeDefinitions(sourceFile, usedTypes);
          const relatedInterfaces = this.findInterfaceDefinitions(sourceFile, usedTypes);
          
          // 提取代码块的导入依赖
          const imports = this.extractCodeBlockImports(sourceFile, usedTypes);
          
          // 提取被引用的函数（用于 Token 压缩）
          const referencedFunctions = this.extractReferencedFunctions(sourceFile, codeBlock.node);
          
          aiTasks.push({
            taskId,
            filePath,
            line: comment.line,
            taskDescription,
            codeBlock: {
              type: codeBlock.type,
              name: codeBlock.name,
              code: codeBlock.code,
              startLine: codeBlock.startLine,
              endLine: codeBlock.endLine,
            },
            relatedTypes,
            relatedInterfaces,
            imports,
            referencedFunctions,
          });
        }
      }
    });
    
    return aiTasks;
  }

  /**
   * 查找文件中的所有注释（排除字符串和模板字符串中的注释）
   */
  private findAllComments(sourceFile: SourceFile): Array<{ text: string; pos: number; line: number }> {
    const comments: Array<{ text: string; pos: number; line: number }> = [];
    const fullText = sourceFile.getFullText();
    const lines = fullText.split('\n');
    
    lines.forEach((line, index) => {
      // 跳过明显在字符串中的注释
      const trimmed = line.trim();
      
      // 检查是否在字符串字面量中
      const beforeComment = line.substring(0, line.indexOf('//'));
      const singleQuotes = (beforeComment.match(/'/g) || []).length;
      const doubleQuotes = (beforeComment.match(/"/g) || []).length;
      const backticks = (beforeComment.match(/`/g) || []).length;
      
      // 如果引号数量是奇数，说明注释在字符串内
      if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0 || backticks % 2 !== 0) {
        return;
      }
      
      const commentMatch = line.match(/\/\/\s*(.+)/);
      if (commentMatch) {
        // 计算注释在文件中的位置
        const linesBefore = lines.slice(0, index).join('\n');
        const pos = linesBefore.length + line.indexOf('//');
        
        comments.push({
          text: commentMatch[1].trim(),
          pos,
          line: index + 1,
        });
      }
    });
    
    return comments;
  }

  /**
   * 找到注释之后的代码块（用于 @AI-TODO）
   */
  private findFollowingCodeBlock(
    sourceFile: SourceFile,
    commentLine: number
  ): { type: TaskContext['codeBlock']['type']; name?: string; code: string; node: Node; startLine: number; endLine: number } | null {
    let result: { type: TaskContext['codeBlock']['type']; name?: string; code: string; node: Node; startLine: number; endLine: number } | null = null;
    let minDistance = Infinity;
    
    // 查找所有可能的代码块
    sourceFile.forEachDescendant((node) => {
      const sf = node.getSourceFile();
      const startLine = sf.getLineAndColumnAtPos(node.getStart()).line;
      
      // 只查找注释之后的代码块，并且距离最近的
      if (startLine > commentLine && startLine - commentLine < minDistance) {
        let blockType: TaskContext['codeBlock']['type'] | null = null;
        let blockName: string | undefined;
        
        if (Node.isFunctionDeclaration(node)) {
          blockType = 'function';
          blockName = node.getName();
        } else if (Node.isMethodDeclaration(node)) {
          blockType = 'method';
          blockName = node.getName();
        } else if (Node.isArrowFunction(node)) {
          blockType = 'arrow';
          const parent = node.getParent();
          if (parent && Node.isVariableDeclaration(parent)) {
            blockName = parent.getName();
          }
        } else if (Node.isClassDeclaration(node)) {
          blockType = 'class';
          blockName = node.getName();
        }
        
        if (blockType) {
          const endLine = sf.getLineAndColumnAtPos(node.getEnd()).line;
          result = {
            type: blockType,
            name: blockName,
            code: node.getText(),
            node: node,
            startLine: startLine,
            endLine: endLine,
          };
          minDistance = startLine - commentLine;
        }
      }
    });
    
    return result;
  }

  /**
   * 找到包含指定位置的最小代码块（保留以备用）
   */
  private findContainingCodeBlock(
    sourceFile: SourceFile,
    position: number
  ): { type: TaskContext['codeBlock']['type']; name?: string; code: string; node: Node; startLine: number; endLine: number } | null {
    let result: { type: TaskContext['codeBlock']['type']; name?: string; code: string; node: Node; startLine: number; endLine: number } | null = null;
    let maxStart = -1;
    
    // 遍历所有节点，找到包含该位置的最小函数/方法
    sourceFile.forEachDescendant((node) => {
      const start = node.getStart();
      const end = node.getEnd();
      
      if (position >= start && position <= end && start > maxStart) {
        let blockType: TaskContext['codeBlock']['type'] | null = null;
        let blockName: string | undefined;
        
        // 检查是否为函数声明
        if (Node.isFunctionDeclaration(node)) {
          blockType = 'function';
          blockName = node.getName();
        }
        // 检查是否为方法
        else if (Node.isMethodDeclaration(node)) {
          blockType = 'method';
          blockName = node.getName();
        }
        // 检查是否为箭头函数
        else if (Node.isArrowFunction(node)) {
          blockType = 'arrow';
          // 尝试获取变量名
          const parent = node.getParent();
          if (parent && Node.isVariableDeclaration(parent)) {
            blockName = parent.getName();
          }
        }
        // 检查是否为类
        else if (Node.isClassDeclaration(node)) {
          blockType = 'class';
          blockName = node.getName();
        }
        
        if (blockType) {
          const startPos = node.getStart();
          const endPos = node.getEnd();
          const sf = node.getSourceFile();
          
          result = {
            type: blockType,
            name: blockName,
            code: node.getText(),
            node: node,
            startLine: sf.getLineAndColumnAtPos(startPos).line,
            endLine: sf.getLineAndColumnAtPos(endPos).line,
          };
          maxStart = start;
        }
      }
    });
    
    return result;
  }

  /**
   * 提取代码块中使用的类型名称
   */
  private extractUsedTypes(node: Node): Set<string> {
    const usedTypes = new Set<string>();
    
    // 遍历节点中的所有类型引用
    node.forEachDescendant((descendant) => {
      // 检查类型引用
      if (Node.isTypeReference(descendant)) {
        const typeName = descendant.getTypeName();
        if (Node.isIdentifier(typeName)) {
          usedTypes.add(typeName.getText());
        }
      }
      
      // 检查接口引用
      if (Node.isInterfaceDeclaration(descendant)) {
        usedTypes.add(descendant.getName());
      }
      
      // 检查参数类型（使用 ParameterDeclaration）
      if (Node.isParameterDeclaration(descendant)) {
        const typeNode = descendant.getTypeNode();
        if (typeNode) {
          this.extractTypeNamesFromTypeNode(typeNode, usedTypes);
        }
      }
      
      // 检查变量类型
      if (Node.isVariableDeclaration(descendant)) {
        const typeNode = descendant.getTypeNode();
        if (typeNode) {
          this.extractTypeNamesFromTypeNode(typeNode, usedTypes);
        }
      }
    });
    
    return usedTypes;
  }

  /**
   * 从类型节点中提取类型名称
   */
  private extractTypeNamesFromTypeNode(typeNode: Node, usedTypes: Set<string>): void {
    if (Node.isTypeReference(typeNode)) {
      const typeName = typeNode.getTypeName();
      if (Node.isIdentifier(typeName)) {
        usedTypes.add(typeName.getText());
      }
    }
    
    // 递归处理子节点
    typeNode.forEachChild((child) => {
      this.extractTypeNamesFromTypeNode(child, usedTypes);
    });
  }

  /**
   * 查找类型定义
   */
  private findTypeDefinitions(sourceFile: SourceFile, typeNames: Set<string>): TypeDefinition[] {
    const definitions: TypeDefinition[] = [];
    
    // 查找 type 定义
    sourceFile.getTypeAliases().forEach((typeAlias) => {
      const name = typeAlias.getName();
      if (typeNames.has(name)) {
        definitions.push({
          name,
          code: typeAlias.getText(),
          kind: 'type',
        });
      }
    });
    
    // 查找 enum 定义
    sourceFile.getEnums().forEach((enumDecl) => {
      const name = enumDecl.getName();
      if (typeNames.has(name)) {
        definitions.push({
          name,
          code: enumDecl.getText(),
          kind: 'enum',
        });
      }
    });
    
    return definitions;
  }

  /**
   * 查找接口定义
   */
  private findInterfaceDefinitions(sourceFile: SourceFile, typeNames: Set<string>): InterfaceDefinition[] {
    const definitions: InterfaceDefinition[] = [];
    
    sourceFile.getInterfaces().forEach((iface) => {
      const name = iface.getName();
      if (typeNames.has(name)) {
        definitions.push({
          name,
          code: iface.getText(),
          properties: iface.getProperties().map(p => p.getName()),
        });
      }
    });
    
    return definitions;
  }

  /**
   * 提取代码块相关的导入语句
   */
  private extractCodeBlockImports(sourceFile: SourceFile, usedTypes: Set<string>): string[] {
    const imports: string[] = [];
    
    sourceFile.getImportDeclarations().forEach((importDecl) => {
      const namedImports = importDecl.getNamedImports().map(n => n.getName());
      const defaultImport = importDecl.getDefaultImport()?.getText();
      
      // 检查导入的符号是否被使用
      const isUsed = namedImports.some(name => usedTypes.has(name)) || 
                     (defaultImport && usedTypes.has(defaultImport));
      
      if (isUsed) {
        imports.push(importDecl.getText());
      }
    });
    
    return imports;
  }

  /**
   * 提取被引用的函数（用于 Token 压缩）
   */
  private extractReferencedFunctions(sourceFile: SourceFile, codeBlockNode: Node): FunctionSignature[] {
    const referencedFunctions: FunctionSignature[] = [];
    const calledFunctionNames = new Set<string>();
    
    // 查找代码块中调用的所有函数
    codeBlockNode.forEachDescendant((node) => {
      if (Node.isCallExpression(node)) {
        const expression = node.getExpression();
        if (Node.isIdentifier(expression)) {
          calledFunctionNames.add(expression.getText());
        } else if (Node.isPropertyAccessExpression(expression)) {
          // 处理 obj.method() 形式
          const name = expression.getName();
          calledFunctionNames.add(name);
        }
      }
    });
    
    // 查找这些函数的定义
    sourceFile.getFunctions().forEach((func) => {
      const funcName = func.getName();
      if (funcName && calledFunctionNames.has(funcName)) {
        // 生成函数签名
        const params = func.getParameters().map(p => {
          const name = p.getName();
          const type = p.getTypeNode()?.getText() || 'any';
          return `${name}: ${type}`;
        }).join(', ');
        
        const returnType = func.getReturnTypeNode()?.getText() || 'void';
        const asyncKeyword = func.isAsync() ? 'async ' : '';
        const signature = `${asyncKeyword}function ${funcName}(${params}): ${returnType}`;
        
        referencedFunctions.push({
          name: funcName,
          signature,
          isUtility: true,
        });
      }
    });
    
    // 查找变量声明的箭头函数
    sourceFile.getVariableDeclarations().forEach((varDecl) => {
      const funcName = varDecl.getName();
      if (calledFunctionNames.has(funcName)) {
        const initializer = varDecl.getInitializer();
        if (initializer && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))) {
          const params = initializer.getParameters().map(p => {
            const name = p.getName();
            const type = p.getTypeNode()?.getText() || 'any';
            return `${name}: ${type}`;
          }).join(', ');
          
          const type = varDecl.getTypeNode()?.getText() || 'unknown';
          const signature = `const ${funcName}: ${type} = (${params}) => { /* ... */ }`;
          
          referencedFunctions.push({
            name: funcName,
            signature,
            isUtility: true,
          });
        }
      }
    });
    
    return referencedFunctions;
  }

  /**
   * 生成文件摘要
   */
  generateFileSummary(analysis: any) {
    const summary = {
      path: analysis.filePath,
      imports: analysis.imports.length,
      exports: Object.keys(analysis.exports).length,
      functions: analysis.functions.length,
      classes: analysis.classes.length,
      interfaces: analysis.interfaces.length,
    };

    return summary;
  }

  /**
   * 保存提取的数据到 JSON
   */
  async saveToJson(data: any, outputPath: string): Promise<void> {
    await fs.ensureDir(outputPath);
    const jsonPath = `${outputPath}/project-context.json`;
    await fs.writeJson(jsonPath, data, { spaces: 2 });
  }

  /**
   * 保存 AI 任务上下文到独立文件
   */
  async saveAITasks(aiTasks: TaskContext[], outputPath: string): Promise<void> {
    await fs.ensureDir(outputPath);
    const jsonPath = `${outputPath}/ai-tasks.json`;
    await fs.writeJson(jsonPath, { tasks: aiTasks, total: aiTasks.length }, { spaces: 2 });
  }

}

