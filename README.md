# AI Pilot

一个用于扫描前端项目结构并生成 AI 友好的上下文文档和任务清单的 CLI 工具。

## 功能特性

- ⭐ **智能需求分析**: 根据自然语言需求自动匹配相关代码
  - 从需求中提取关键词（中英文、驼峰拆分）
  - 在项目地图中智能匹配相关文件
  - 自动提取函数签名、接口定义、类型定义
  - 追溯依赖文件和类型引用
  - 生成完整的 AI 执行上下文
- 🔗 **依赖关系追踪**: 分析文件的上下游影响范围
  - 下游分析：递归查找文件引用的 Hook、组件、工具
  - 上游分析：找出依赖该文件的所有文件
  - 影响评估：标注导出项是否被外部使用
  - 修改建议：提供安全重构指导
- 🔄 **Git 变更分析** (新): 智能分析代码变更影响
  - Git 联动：自动检测暂存区文件变更
  - 精准定位：找出修改行所属的函数/类/Hook
  - 代码块提取：提取完整的变更代码块
  - 影响评估：分析变更对上下游的影响
  - 审查建议：自动生成代码审查清单
- 🔍 **AST 深度扫描**: 使用 ts-morph 进行代码语法树分析
- 🧩 **智能文件角色识别**: 自动识别 Component、Hook、Utility、Service 等
- 📊 **项目逻辑地图**: 生成完整的项目结构和依赖关系图
- 🎯 **语义匹配**: 基于关键词的文件匹配和打分系统
- 📝 **文档自动生成**: Markdown + JSON 双格式输出
- 🚀 **简洁高效**: 无交互式提问，命令行直接传参

## 技术栈

- Node.js 22+
- TypeScript
- Commander.js - 命令行框架
- ts-morph - TypeScript AST 分析
- globby - 文件匹配
- chalk - 终端样式
- fs-extra - 文件系统

## 安装依赖

```bash
pnpm install
```

## 本地开发

```bash
# 开发模式运行
pnpm dev

# 构建项目
pnpm build

# 运行构建后的版本
pnpm start
```

## 快速开始

### 1. 扫描项目生成地图

```bash
# 扫描当前目录
pnpm dev scan

# 扫描指定目录
pnpm dev scan --path ./your-project
```

### 2. 根据需求生成任务文档

```bash
# 生成任务文档
pnpm dev task "我想添加用户登录功能"

# 指定项目路径
pnpm dev task "优化首页加载性能" --path ./your-project
```

### 3. 分析文件依赖关系（可选）

```bash
# 分析指定文件的上下游依赖
pnpm dev trace src/utils/auth.ts

# 指定项目路径
pnpm dev trace src/components/Login.tsx --path ./your-project
```

### 4. 分析 Git 变更（可选）

```bash
# 先暂存你的改动
git add .

# 分析暂存区的变更
pnpm dev diff

# 指定项目路径
pnpm dev diff --path ./your-project
```

### 5. 查看结果

**`scan` 命令输出**：
- `ai-context/project-map.json` - 项目逻辑地图
- `ai-context/PROJECT_CONTEXT.md` - 项目文档
- `ai-context/ai-tasks.json` - 任务数据

**`task` 命令输出**：
- `AI_READY_TASKS.md` - 可直接提供给 AI 的任务文档 ⭐

**`trace` 命令输出**：
- `IMPACT_ANALYSIS.md` - 文件依赖关系影响分析 ⭐

**`diff` 命令输出**：
- `AI_DIFF_CONTEXT.md` - Git 变更上下文分析 ⭐

## 命令说明

### `ai-pilot scan` 
扫描项目结构并生成项目地图。

**选项**:
- `-p, --path <path>` - 项目路径（默认：当前目录）
- `-o, --output <output>` - 输出目录（默认：./ai-context）

### `ai-pilot task <requirement>` 
根据需求生成 AI 任务文档。

**参数**:
- `<requirement>` - 你想对项目进行的改动（必填）

**选项**:
- `-p, --path <path>` - 项目路径（默认：当前目录）

**示例**:
```bash
ai-pilot task "给登录页面添加记住密码功能"
ai-pilot task "修改用户管理模块的接口调用方式"
ai-pilot task "优化首页的加载性能"
```

**工作原理**:
1. 读取 scan 生成的项目地图
2. 从需求中提取关键词
3. 匹配相关的代码文件和模块
4. 提取代码摘要（函数签名、接口、类型）
5. 追溯依赖和关联文件
6. 生成 `AI_READY_TASKS.md`

**输出**：`AI_READY_TASKS.md` - 包含需求和相关代码上下文

---

### `ai-pilot trace <file>` 
分析指定文件的上下游依赖关系。

**参数**:
- `<file>` - 要分析的文件路径（相对或绝对路径）

**选项**:
- `-p, --path <path>` - 项目根路径（默认：当前目录）

**示例**:
```bash
ai-pilot trace src/utils/auth.ts
ai-pilot trace src/components/UserProfile.tsx
ai-pilot trace src/hooks/useAuth.ts
```

**功能**:
- **下游分析**: 递归找出该文件引用的 Hook、组件、工具函数
- **上游分析**: 找出项目中哪些文件引用了该文件
- **影响评估**: 标注哪些导出项被外部使用
- **修改建议**: 提供安全修改和删除的指导

**输出**：`IMPACT_ANALYSIS.md` - 包含完整的依赖关系图和修改建议

---

### `ai-pilot diff` 
分析 Git 暂存区的代码变更。

**选项**:
- `-p, --path <path>` - 项目根路径（默认：当前目录）

**前置条件**:
```bash
# 需要先将改动添加到暂存区
git add <files>
```

**示例**:
```bash
git add src/utils/auth.ts src/components/Login.tsx
ai-pilot diff
```

**功能**:
- **Git 联动**: 自动检测暂存区的文件变更
- **精准定位**: 找出被修改的代码行所属的函数/类/Hook
- **上下文水合**: 自动触发 trace 逻辑获取依赖关系
- **影响分析**: 标注变更会影响哪些上游文件
- **AI 任务**: 自动生成代码审查和测试建议

**输出**：`AI_DIFF_CONTEXT.md` - 包含变更概要、完整代码、影响范围和审查清单

## 项目结构

```
project-ai-polit-cli/
├── src/
│   ├── index.ts              # 入口文件
│   ├── commands/             # 命令定义
│   │   ├── scan.ts           # scan 命令
│   │   ├── task.ts           # task 命令
│   │   ├── trace.ts          # trace 命令
│   │   └── diff.ts           # diff 命令（新）
│   ├── core/                 # 核心功能
│   │   ├── scanner.ts        # AST 扫描器
│   │   ├── context-finder.ts # 上下文查找器
│   │   ├── tracer.ts         # 依赖追踪器
│   │   ├── diff-analyzer.ts  # Git Diff 分析器（新）
│   │   ├── hydrator.ts       # 任务水合
│   │   └── generator.ts      # 文档生成器
│   └── utils/                # 工具函数
├── package.json
├── tsconfig.json
└── README.md
```

## 核心亮点：@AI-TODO 任务水合

这是工具的**最强功能**，为 AI 辅助编程设计：

### 它能做什么？

1. **智能定位**: 找到 `@AI-TODO` 注释所在的最小代码块
2. **类型追溯**: 自动提取代码块使用的所有接口和类型定义
3. **依赖分析**: 找出相关的 import 语句
4. **完整上下文**: 将所有信息封装为 AI 可直接使用的 TaskContext

### 示例

代码：
```typescript
interface User {
  id: string;
  name: string;
  points: number;
}

// @AI-TODO 添加缓存机制提升性能
export function getUser(id: string): User {
  return database.find(id);
}
```

生成的上下文：
```json
{
  "taskId": "task-1",
  "taskDescription": "添加缓存机制提升性能",
  "codeBlock": {
    "type": "function",
    "name": "getUser",
    "code": "export function getUser(id: string): User { ... }",
    "startLine": 8,
    "endLine": 10
  },
  "relatedInterfaces": [
    {
      "name": "User",
      "code": "interface User { id: string; name: string; points: number; }",
      "properties": ["id", "name", "points"]
    }
  ],
  "imports": []
}
```

### 为什么这很重要？

- ✅ AI 获得完整上下文，无需猜测类型定义
- ✅ 减少来回沟通，一次性提供所需信息
- ✅ 保持代码一致性，使用项目中已有的类型
- ✅ 加速开发，快速定位需要处理的代码

### Token 压缩示例

**原始代码**（包含工具函数实现）：
```typescript
function validateEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

// @AI-TODO 添加错误处理
export function createUser(email: string) {
  if (!validateEmail(email)) {
    throw new Error('Invalid');
  }
  // ...
}
```

**压缩后**（仅保留签名）：
```typescript
// 🔧 引用的工具函数 (仅签名，节省 Token)
function validateEmail(email: string): boolean

// 💻 当前代码（需要修改的部分）
export function createUser(email: string) {
  if (!validateEmail(email)) {
    throw new Error('Invalid');
  }
  // ...
}
```

**效果**：节省约 50% Token，AI 专注于核心任务！

## 输出文件说明

运行扫描后，会在输出目录生成：

### AI 任务相关 ⭐
- `AI_TASKS.md` - AI 任务清单（Markdown 格式，人类可读）
- `ai-tasks.json` - AI 任务上下文（JSON 格式，机器友好）

### 项目分析
- `PROJECT_CONTEXT.md` - 项目文档
- `project-map.json` - 项目逻辑地图
- `project-context.json` - 详细数据

## License

MIT

