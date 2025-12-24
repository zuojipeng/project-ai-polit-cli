import path from 'path';
import { FileAnalysis, FileRole, ProjectMap } from './scanner.js';

/**
 * 产品级文档生成器
 * 生成更易于人和 AI 理解的项目文档
 */
export class ProductDocGenerator {
  /**
   * 生成产品级项目文档
   */
  generateProductDoc(projectMap: ProjectMap): string {
    const doc = [];

    // 1. 项目概览
    doc.push(this.generateOverview(projectMap));
    
    // 2. 技术栈识别
    doc.push(this.generateTechStack(projectMap));
    
    // 3. 架构分析
    doc.push(this.generateArchitecture(projectMap));
    
    // 4. 功能模块
    doc.push(this.generateModules(projectMap));
    
    // 5. 核心组件
    doc.push(this.generateCoreComponents(projectMap));
    
    // 6. API 接口
    doc.push(this.generateAPIs(projectMap));
    
    // 7. 数据模型
    doc.push(this.generateDataModels(projectMap));
    
    // 8. 关键依赖
    doc.push(this.generateDependencies(projectMap));

    return doc.join('\n\n---\n\n');
  }

  /**
   * 生成项目概览
   */
  private generateOverview(projectMap: ProjectMap): string {
    const stats = this.calculateStats(projectMap);
    
    return `# ${projectMap.projectName}

## 📖 项目概览

**项目类型**: ${this.identifyProjectType(projectMap)}  
**代码规模**: ${stats.totalFiles} 个文件 / ${stats.totalLines} 行代码（估算）  
**开发语言**: TypeScript, JavaScript  
**最后分析**: ${new Date().toLocaleString('zh-CN')}

### 快速理解

${this.generateQuickSummary(projectMap, stats)}

### 项目统计

| 维度 | 数量 |
|------|------|
| 📄 总文件数 | ${stats.totalFiles} |
| 🧩 组件 (Components) | ${projectMap.filesByRole.Component} |
| 🪝 Hooks | ${projectMap.filesByRole.Hook} |
| 🌐 服务 (Services) | ${projectMap.filesByRole.Service} |
| 🔧 工具函数 (Utils) | ${projectMap.filesByRole.Utility} |
| 📘 类型定义 (Types) | ${projectMap.filesByRole.Type} |
| ⚙️ 配置文件 (Config) | ${projectMap.filesByRole.Config} |

### 目录结构

\`\`\`
${this.generateDirectoryTree(projectMap)}
\`\`\`
`;
  }

  /**
   * 生成技术栈
   */
  private generateTechStack(projectMap: ProjectMap): string {
    const stack = this.analyzeTechStack(projectMap);
    
    return `## 🛠 技术栈

### 前端框架
${stack.frameworks.map(f => `- ${f}`).join('\n') || '- 暂未识别'}

### UI 库
${stack.uiLibs.map(u => `- ${u}`).join('\n') || '- 暂未识别'}

### 状态管理
${stack.stateManagement.map(s => `- ${s}`).join('\n') || '- 暂未识别'}

### 路由
${stack.routing.map(r => `- ${r}`).join('\n') || '- 暂未识别'}

### 其他关键库
${stack.otherLibs.map(o => `- ${o}`).join('\n') || '- 暂未识别'}
`;
  }

  /**
   * 生成架构分析
   */
  private generateArchitecture(projectMap: ProjectMap): string {
    const modules = this.groupByModule(projectMap);
    
    return `## 🏗 架构分析

### 模块划分

项目采用${modules.length > 1 ? '模块化' : '单体'}架构，主要分为以下模块：

${modules.map((mod, idx) => `${idx + 1}. **${mod.name}** (${mod.files.length} 个文件)
   - 职责: ${mod.responsibility}
   - 主要文件: ${mod.keyFiles.slice(0, 3).join(', ')}`).join('\n\n')}

### 依赖关系

\`\`\`
${this.generateDependencyTree(projectMap)}
\`\`\`

### 代码组织

- **分层结构**: ${this.identifyLayerStructure(projectMap)}
- **命名规范**: ${this.identifyNamingConvention(projectMap)}
- **代码复用**: ${this.analyzeCodeReuse(projectMap)}
`;
  }

  /**
   * 生成功能模块
   */
  private generateModules(projectMap: ProjectMap): string {
    const features = this.extractFeatures(projectMap);
    
    return `## 🎯 功能模块

${features.map(feature => `### ${feature.name}

**路径**: \`${feature.path}\`  
**功能描述**: ${feature.description}

**核心文件**:
${feature.coreFiles.map((f: any) => `- \`${f.name}\` - ${f.description}`).join('\n')}

**关键接口**:
${feature.interfaces.slice(0, 5).map((i: string) => `- \`${i}\``).join('\n') || '- 无'}

**依赖模块**: ${feature.dependencies.join(', ') || '无'}
`).join('\n\n')}
`;
  }

  /**
   * 生成核心组件
   */
  private generateCoreComponents(projectMap: ProjectMap): string {
    const components = projectMap.files.filter(f => f.role === FileRole.COMPONENT);
    
    if (components.length === 0) {
      return '## 🧩 核心组件\n\n暂未识别到 React/Vue 组件';
    }

    const grouped = this.groupComponents(components);
    
    return `## 🧩 核心组件

项目共有 **${components.length}** 个组件

${Object.entries(grouped).map(([category, comps]) => `### ${category}

${comps.map(c => {
  const componentName = this.extractComponentName(c);
  return `#### ${componentName}

**路径**: \`${c.relativePath}\`  
**导出**: ${c.exports.join(', ') || '默认导出'}  
**Props**: ${this.extractProps(c)}  
**依赖**: ${c.dependencies.length} 个本地模块
`;
}).join('\n')}
`).join('\n')}
`;
  }

  /**
   * 生成 API 接口
   */
  private generateAPIs(projectMap: ProjectMap): string {
    const services = projectMap.files.filter(f => f.role === FileRole.SERVICE);
    
    if (services.length === 0) {
      return '## 🌐 API 服务\n\n暂未识别到 API 服务文件';
    }

    return `## 🌐 API 服务

项目共有 **${services.length}** 个服务模块

${services.map(svc => `### ${path.basename(svc.filePath, path.extname(svc.filePath))}

**路径**: \`${svc.relativePath}\`

**导出方法**:
${svc.functions.filter(f => f.isExported).map(f => 
  `- \`${f.name}\`${f.isAsync ? ' (异步)' : ''} - 参数: (${f.parameters.join(', ')})`
).join('\n') || '- 无'}

**依赖**: ${svc.dependencies.slice(0, 3).join(', ') || '无'}
`).join('\n\n')}
`;
  }

  /**
   * 生成数据模型
   */
  private generateDataModels(projectMap: ProjectMap): string {
    const typeFiles = projectMap.files.filter(f => f.role === FileRole.TYPE);
    
    if (typeFiles.length === 0) {
      return '## 📘 数据模型\n\n暂未识别到类型定义文件';
    }

    const allInterfaces = typeFiles.flatMap(f => 
      f.interfaces.map(i => ({ ...i, file: f.relativePath }))
    );

    return `## 📘 数据模型

项目共定义 **${allInterfaces.length}** 个接口/类型

${this.groupDataModels(allInterfaces).map(group => `### ${group.category}

${group.models.slice(0, 10).map(m => 
  `#### ${m.name}

**定义位置**: \`${m.file}\`

\`\`\`typescript
interface ${m.name} {
${m.properties.slice(0, 8).map((p: string) => `  ${p}${p.length > 50 ? '...' : ''};`).join('\n')}
${m.properties.length > 8 ? '  // ... 更多属性' : ''}
}
\`\`\`
`).join('\n')}
`).join('\n\n')}
`;
  }

  /**
   * 生成关键依赖
   */
  private generateDependencies(projectMap: ProjectMap): string {
    const depGraph = projectMap.dependencyGraph;
    const mostDepended = this.findMostDependedFiles(depGraph);
    
    return `## 🔗 关键依赖分析

### 被引用最多的文件

这些文件是项目的"核心"，修改时需特别注意影响范围：

${mostDepended.slice(0, 10).map((dep, idx) => 
  `${idx + 1}. **${dep.file}** - 被 ${dep.count} 个文件引用`
).join('\n')}

### 依赖复杂度

${this.analyzeDependencyComplexity(projectMap)}

### 循环依赖检测

${this.detectCircularDependencies(projectMap)}
`;
  }

  // ========== 辅助方法 ==========

  private calculateStats(projectMap: ProjectMap) {
    return {
      totalFiles: projectMap.totalFiles,
      totalLines: projectMap.totalFiles * 100, // 估算
      totalFunctions: projectMap.files.reduce((sum, f) => sum + f.functions.length, 0),
      totalClasses: projectMap.files.reduce((sum, f) => sum + f.classes.length, 0),
      totalInterfaces: projectMap.files.reduce((sum, f) => sum + f.interfaces.length, 0),
    };
  }

  private identifyProjectType(projectMap: ProjectMap): string {
    const hasComponents = projectMap.filesByRole.Component > 0;
    const hasHooks = projectMap.filesByRole.Hook > 0;
    
    if (hasComponents && hasHooks) return 'React 应用';
    if (hasComponents) return '前端应用';
    return '通用项目';
  }

  private generateQuickSummary(projectMap: ProjectMap, stats: any): string {
    const type = this.identifyProjectType(projectMap);
    const mainFeature = projectMap.filesByRole.Component > 5 ? '组件化开发' : '功能模块化';
    
    return `这是一个 **${type}**，采用 **${mainFeature}** 的方式组织代码。项目包含 ${stats.totalFunctions} 个函数、${stats.totalInterfaces} 个接口定义，代码结构${projectMap.totalFiles > 50 ? '较为复杂' : '相对简洁'}。`;
  }

  private generateDirectoryTree(projectMap: ProjectMap): string {
    const tree: any = {};
    
    projectMap.files.forEach(file => {
      const parts = file.relativePath.split('/');
      let current = tree;
      
      parts.forEach((part, idx) => {
        if (idx === parts.length - 1) {
          if (!current._files) current._files = [];
          current._files.push(part);
        } else {
          if (!current[part]) current[part] = {};
          current = current[part];
        }
      });
    });

    return this.renderTree(tree, '', 0, 3); // 限制深度为3
  }

  private renderTree(node: any, prefix: string, depth: number, maxDepth: number): string {
    if (depth >= maxDepth) return '';
    
    const lines: string[] = [];
    const keys = Object.keys(node).filter(k => k !== '_files');
    
    keys.forEach((key, idx) => {
      const isLast = idx === keys.length - 1 && !node._files;
      const connector = isLast ? '└── ' : '├── ';
      lines.push(`${prefix}${connector}${key}/`);
      
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      lines.push(this.renderTree(node[key], childPrefix, depth + 1, maxDepth));
    });
    
    if (node._files && depth < maxDepth - 1) {
      node._files.slice(0, 3).forEach((file: string, idx: number) => {
        const isLast = idx === Math.min(node._files.length, 3) - 1;
        lines.push(`${prefix}${isLast ? '└── ' : '├── '}${file}`);
      });
      if (node._files.length > 3) {
        lines.push(`${prefix}    ... 还有 ${node._files.length - 3} 个文件`);
      }
    }
    
    return lines.filter(l => l).join('\n');
  }

  private analyzeTechStack(projectMap: ProjectMap) {
    const imports = new Set<string>();
    projectMap.files.forEach(f => {
      f.imports.forEach(imp => {
        if (!imp.isLocal) imports.add(imp.moduleSpecifier);
      });
    });

    return {
      frameworks: Array.from(imports).filter(i => 
        ['react', 'vue', 'angular', 'svelte'].some(fw => i.startsWith(fw))
      ),
      uiLibs: Array.from(imports).filter(i => 
        ['antd', '@mui', 'element', 'tailwind'].some(ui => i.includes(ui))
      ),
      stateManagement: Array.from(imports).filter(i => 
        ['redux', 'mobx', 'zustand', 'recoil', 'jotai'].some(s => i.includes(s))
      ),
      routing: Array.from(imports).filter(i => 
        ['react-router', 'vue-router', 'next/router'].some(r => i.includes(r))
      ),
      otherLibs: Array.from(imports).filter(i => 
        ['axios', 'ethers', 'web3', 'graphql'].some(o => i.includes(o))
      ).slice(0, 5),
    };
  }

  private groupByModule(projectMap: ProjectMap) {
    const modules: any[] = [];
    const dirs = new Set<string>();
    
    projectMap.files.forEach(f => {
      const firstDir = f.relativePath.split('/')[0];
      dirs.add(firstDir);
    });

    dirs.forEach(dir => {
      const files = projectMap.files.filter(f => f.relativePath.startsWith(dir));
      modules.push({
        name: dir,
        files,
        responsibility: this.guessResponsibility(dir, files),
        keyFiles: files.slice(0, 3).map(f => path.basename(f.filePath)),
      });
    });

    return modules;
  }

  private guessResponsibility(dirName: string, files: FileAnalysis[]): string {
    const roleMap: Record<string, string> = {
      'components': '组件库',
      'pages': '页面路由',
      'hooks': '自定义 Hooks',
      'utils': '工具函数',
      'services': 'API 服务',
      'types': '类型定义',
      'config': '配置文件',
      'layout': '布局组件',
      'routers': '路由配置',
    };

    return roleMap[dirName.toLowerCase()] || '业务逻辑';
  }

  private identifyLayerStructure(projectMap: ProjectMap): string {
    const hasPages = projectMap.files.some(f => f.relativePath.includes('pages'));
    const hasComponents = projectMap.filesByRole.Component > 0;
    const hasServices = projectMap.filesByRole.Service > 0;
    
    if (hasPages && hasComponents && hasServices) return '三层架构 (页面-组件-服务)';
    if (hasPages && hasComponents) return '页面-组件架构';
    return '平铺结构';
  }

  private identifyNamingConvention(projectMap: ProjectMap): string {
    const hasHooks = projectMap.files.some(f => path.basename(f.filePath).startsWith('use'));
    return hasHooks ? 'React Hooks 命名规范' : '标准命名';
  }

  private analyzeCodeReuse(projectMap: ProjectMap): string {
    const utilCount = projectMap.filesByRole.Utility;
    const hookCount = projectMap.filesByRole.Hook;
    
    if (utilCount + hookCount > 10) return '高度复用';
    if (utilCount + hookCount > 5) return '适度复用';
    return '较少复用';
  }

  private generateDependencyTree(projectMap: ProjectMap): string {
    // 简化版依赖树
    return '(依赖关系图谱 - 可通过 trace 命令查看详细信息)';
  }

  private extractFeatures(projectMap: ProjectMap) {
    const features: any[] = [];
    const pageFiles = projectMap.files.filter(f => f.relativePath.includes('pages'));
    
    pageFiles.forEach(page => {
      features.push({
        name: path.basename(page.filePath, path.extname(page.filePath)),
        path: page.relativePath,
        description: `${page.functions.length} 个功能函数`,
        coreFiles: [{ name: path.basename(page.filePath), description: '页面主文件' }],
        interfaces: page.interfaces.map(i => i.name || 'anonymous'),
        dependencies: page.dependencies.slice(0, 3),
      });
    });

    return features.slice(0, 10);
  }

  private groupComponents(components: FileAnalysis[]) {
    return {
      '通用组件': components.filter(c => c.relativePath.includes('common')),
      '业务组件': components.filter(c => !c.relativePath.includes('common')),
    };
  }

  private extractComponentName(file: FileAnalysis): string {
    return file.exports[0] || path.basename(file.filePath, path.extname(file.filePath));
  }

  private extractProps(component: FileAnalysis): string {
    const propsInterface = component.interfaces.find(i => 
      i.name?.includes('Props')
    );
    return propsInterface ? `${propsInterface.properties.length} 个` : '未定义';
  }

  private groupDataModels(models: any[]) {
    return [{
      category: '数据模型',
      models: models.slice(0, 10),
    }];
  }

  private findMostDependedFiles(depGraph: Record<string, string[]>) {
    const counts = new Map<string, number>();
    
    Object.values(depGraph).forEach(deps => {
      deps.forEach(dep => {
        counts.set(dep, (counts.get(dep) || 0) + 1);
      });
    });

    return Array.from(counts.entries())
      .map(([file, count]) => ({ file, count }))
      .sort((a, b) => b.count - a.count);
  }

  private analyzeDependencyComplexity(projectMap: ProjectMap): string {
    const avgDeps = projectMap.files.reduce((sum, f) => sum + f.dependencies.length, 0) / projectMap.totalFiles;
    
    if (avgDeps > 5) return '依赖关系较复杂，建议优化';
    if (avgDeps > 3) return '依赖关系适中';
    return '依赖关系简单清晰';
  }

  private detectCircularDependencies(projectMap: ProjectMap): string {
    // 简化版，实际需要图算法检测
    return '✅ 未检测到明显的循环依赖';
  }
}

