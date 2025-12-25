# Monorepo 支持路线图

## 当前状态

✅ **已支持**：
- 自动检测 apps/ 和 packages/ 目录
- 深度 AST 分析所有文件
- 提取函数、类、接口定义
- 依赖关系追踪

❌ **局限性**：
- 大型项目性能问题（10,000+ 文件）
- 生成的文档可能太大
- 缺少模块化视图
- 没有按 app/package 分组

---

## 改进方案

### 方案一：选择性扫描（立即可用）

```bash
# 只扫描特定 app
ai-pilot scan --path apps/arch-app

# 只扫描特定 package
ai-pilot scan --path packages/my-ui

# 扫描多个目标
ai-pilot scan --scope apps/arch-app,packages/my-ui
```

**优势**：
- 快速聚焦
- 文档体积可控
- 适合日常开发

### 方案二：模块化输出（推荐）

生成按模块分组的文档结构：

```
ai-context/
├── overview.md              # 整体概览
├── apps/
│   ├── arch-app/
│   │   ├── summary.md       # app 概要
│   │   ├── components.md    # 组件列表
│   │   └── dependencies.md  # 依赖分析
│   └── ui-app-interface/
│       └── ...
├── packages/
│   ├── my-ui/
│   │   ├── summary.md
│   │   └── api.md           # 导出 API
│   ├── my-hooks/
│   └── utils/
└── cross-dependencies.md    # 跨模块依赖图
```

**优势**：
- 结构清晰
- AI 可以按需读取
- 方便导航

### 方案三：智能采样（大型项目）

对于超大型项目，采用采样策略：

1. **关键文件优先**：
   - 入口文件（index.ts, main.ts）
   - 路由配置
   - 全局状态管理
   - 公共组件

2. **统计摘要**：
   - 文件数量、代码行数
   - 技术栈分析
   - 依赖关系图谱

3. **按需深入**：
   - 用 `trace` 分析具体文件
   - 用 `task` 查找相关代码

### 方案四：增量分析（性能优化）

```bash
# 只分析变更的文件
ai-pilot scan --incremental

# 基于 Git 变更
ai-pilot scan --since main

# 缓存机制
ai-pilot scan --cache
```

---

## 推荐使用策略

### 场景一：新接手项目
```bash
# 1. 快速了解整体结构（轻量级）
ai-pilot scan --summary-only

# 2. 深入分析关键模块
ai-pilot scan --path apps/main-app
ai-pilot scan --path packages/core
```

### 场景二：日常开发
```bash
# 1. 扫描当前工作的 app
ai-pilot scan --path apps/arch-app

# 2. 生成任务文档
ai-pilot task "优化登录流程"

# 3. 分析依赖影响
ai-pilot trace apps/arch-app/src/auth/login.ts
```

### 场景三：代码审查
```bash
# 1. 分析变更影响
ai-pilot diff

# 2. 检查跨模块影响
ai-pilot trace <changed-file>
```

### 场景四：架构梳理
```bash
# 1. 生成完整项目地图
ai-pilot scan --full

# 2. 导出依赖关系图
ai-pilot analyze --dependencies --output deps.json
```

---

## 立即可用的优化

### 1. 使用 --path 聚焦
```bash
# 当前就支持，推荐用法
cd /Users/edy/Desktop/learning/my-mono-repo

# 只扫描一个 app
ai-pilot scan --path apps/arch-app

# 只扫描一个 package
ai-pilot scan --path packages/my-ui
```

### 2. 配置忽略规则
创建 `.ai-pilot-ignore`：
```
# 忽略测试文件
**/*.test.ts
**/*.spec.ts

# 忽略特定目录
apps/legacy-app/**
packages/deprecated/**

# 只关注核心代码
!apps/main-app/**
!packages/core/**
```

### 3. 分批处理
```bash
# 先扫描 packages（公共库）
for pkg in packages/*; do
  ai-pilot scan --path $pkg --output ai-context/$(basename $pkg)
done

# 再扫描 apps
for app in apps/*; do
  ai-pilot scan --path $app --output ai-context/$(basename $app)
done
```

---

## 下一步开发优先级

1. **P0 - 立即实现**：
   - [ ] 添加 `--scope` 参数支持多个路径
   - [ ] 输出文件按 app/package 分组
   - [ ] 添加进度条显示

2. **P1 - 近期计划**：
   - [ ] 生成模块化文档结构
   - [ ] 添加 `--summary-only` 轻量级扫描
   - [ ] 跨模块依赖关系可视化

3. **P2 - 长期规划**：
   - [ ] 增量分析和缓存
   - [ ] 智能采样策略
   - [ ] 性能优化（并行处理）

---

## 性能基准

| 项目规模 | 文件数 | 当前耗时 | 优化目标 |
|---------|--------|---------|---------|
| 小型 | <100 | <5s | ✅ |
| 中型 | 100-1000 | 10-30s | ⚠️ 可接受 |
| 大型 | 1000-5000 | 1-3min | ⚠️ 需优化 |
| 超大型 | 5000+ | 5min+ | ❌ 需采样 |

---

## 总结

**当前能力**：
- ✅ 能深入分析代码（AST 级别）
- ✅ 能追踪依赖关系
- ✅ 支持 monorepo 结构

**最佳实践**：
- 使用 `--path` 聚焦特定模块
- 按需分析，不要一次扫描全部
- 结合 `task`/`trace`/`diff` 命令

**未来方向**：
- 模块化输出
- 智能采样
- 增量分析


