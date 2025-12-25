# 本地开发使用指南

## 快速开始（推荐）

### 1. 构建并链接

```bash
# 在 CLI 项目目录
cd /Users/edy/Desktop/learning/project-ai-polit-cli

# 安装依赖（如果还没有）
pnpm install

# 构建项目
npm run build

# 创建全局链接
npm link
```

### 2. 在其他项目使用

```bash
# 切换到你的项目
cd /path/to/your/project

# 直接使用命令
ai-pilot scan
ai-pilot task "你的需求"
ai-pilot trace src/utils/auth.ts
ai-pilot diff
```

## 开发调试

如果你在修改 CLI 代码：

```bash
# 修改代码后重新构建
npm run build

# 无需重新 link，直接在其他项目使用即可
# 因为 link 是软链接，会自动使用最新的构建结果
```

## 取消链接

```bash
# 在 CLI 项目目录
npm unlink -g ai-pilot

# 或者在其他项目中
npm unlink ai-pilot
```

## 常见问题

### Q: 命令找不到
A: 确保已经执行 `npm run build` 和 `npm link`

### Q: 修改代码后不生效
A: 重新执行 `npm run build`

### Q: 权限错误
A: 可能需要 `sudo npm link`（不推荐），或者配置 npm 全局目录

### Q: 想用开发模式快速测试
A: 使用 `pnpm dev scan` 等命令在 CLI 项目目录内测试


