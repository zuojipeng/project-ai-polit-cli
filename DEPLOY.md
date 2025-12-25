# AI Pilot CLI 部署指南

## 方案一：本地 Verdaccio（开发阶段）

### 1. 启动 Verdaccio

```bash
# 如果还没安装
npm install -g verdaccio

# 启动（默认 http://localhost:4873）
verdaccio
```

### 2. 配置 npm registry

```bash
# 设置 registry 指向本地 Verdaccio
npm set registry http://localhost:4873

# 或者只为当前项目设置
npm config set registry http://localhost:4873 --location project
```

### 3. 创建用户并登录

```bash
npm adduser --registry http://localhost:4873
# 输入用户名、密码、邮箱
```

### 4. 发布到 Verdaccio

```bash
# 在 CLI 项目目录
cd /Users/edy/Desktop/learning/project-ai-polit-cli

# 构建
npm run build

# 发布
npm publish --registry http://localhost:4873
```

### 5. 在其他项目安装

```bash
# 在你的其他项目
cd /path/to/your/project

# 安装
npm install ai-pilot --registry http://localhost:4873

# 使用
npx ai-pilot scan
```

### 6. 恢复 npm 官方源

```bash
npm set registry https://registry.npmjs.org
```

---

## 方案二：部署到云服务器

### 1. 服务器配置

```bash
# SSH 登录服务器
ssh user@your-server.com

# 安装 Node.js 和 Verdaccio
npm install -g verdaccio pm2

# 启动 Verdaccio（使用 pm2 保持运行）
pm2 start verdaccio
pm2 save
pm2 startup
```

### 2. 配置 Nginx 反向代理（推荐）

```nginx
server {
    listen 80;
    server_name npm.your-domain.com;

    location / {
        proxy_pass http://localhost:4873;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 3. 配置 SSL（推荐）

```bash
# 使用 Let's Encrypt
sudo certbot --nginx -d npm.your-domain.com
```

### 4. 发布到云端私仓

```bash
# 本地配置 registry
npm set registry https://npm.your-domain.com

# 登录
npm adduser --registry https://npm.your-domain.com

# 发布
npm publish
```

### 5. 团队使用

```bash
# 团队成员配置
npm set registry https://npm.your-domain.com
npm adduser

# 安装使用
npm install -g ai-pilot
ai-pilot scan
```

---

## 方案三：发布到 npm 公共仓库（未来考虑）

### 1. 注册 npm 账号

```bash
# 访问 https://www.npmjs.com/signup 注册

# 本地登录
npm login
```

### 2. 修改 package.json

```json
{
  "name": "ai-pilot",  // 可能需要改名，这个可能被占用了
  "version": "1.0.0",
  "description": "AI-friendly CLI tool for frontend projects",
  "keywords": ["cli", "ai", "frontend", "ast", "code-analysis"],
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/ai-pilot.git"
  },
  "author": "Your Name",
  "license": "MIT"
}
```

### 3. 发布

```bash
# 构建
npm run build

# 发布
npm publish

# 如果包名被占用，需要改名
npm publish --access public
```

### 4. 全球使用

```bash
# 任何人都可以安装
npm install -g ai-pilot
ai-pilot scan
```

---

## Verdaccio 配置优化

### 编辑配置文件

```bash
# 配置文件位置
~/.config/verdaccio/config.yaml
```

### 推荐配置

```yaml
storage: ./storage

auth:
  htpasswd:
    file: ./htpasswd
    max_users: 10  # 限制用户数

uplinks:
  npmjs:
    url: https://registry.npmjs.org/

packages:
  '@your-scope/*':
    access: $authenticated
    publish: $authenticated
    unpublish: $authenticated

  'ai-pilot':
    access: $authenticated  # 需要登录才能访问
    publish: $authenticated  # 需要登录才能发布

  '**':
    access: $all
    publish: $authenticated
    proxy: npmjs

middlewares:
  audit:
    enabled: true

logs: { type: stdout, format: pretty, level: http }
```

---

## 推荐工作流

### 开发阶段（现在）
```bash
# 使用 npm link 本地测试
npm link
```

### 内部测试阶段
```bash
# 发布到本地 Verdaccio
npm publish --registry http://localhost:4873
```

### 团队协作阶段
```bash
# 部署到云服务器
# 团队成员从私仓安装
```

### 开源阶段（如果决定开源）
```bash
# 发布到 npm 公共仓库
npm publish
```

---

## 常见问题

### Q: Verdaccio 数据会丢失吗？
A: Verdaccio 会将数据存储在本地，云端部署建议挂载持久化存储

### Q: 如何备份？
A: 备份 `~/.config/verdaccio` 目录即可

### Q: 如何切换 registry？
```bash
# 查看当前
npm get registry

# 切换到官方
npm set registry https://registry.npmjs.org

# 切换到私仓
npm set registry http://localhost:4873
```

### Q: 如何使用 .npmrc 管理多个源？
```bash
# 项目根目录创建 .npmrc
registry=http://localhost:4873
```

---

## 我的建议时间线

1. **现在**：继续使用 `npm link` 开发调试
2. **本周**：熟悉 Verdaccio，本地发布测试
3. **下周**：部署到云服务器（如果需要团队协作）
4. **未来**：如果想开源，发布到 npm 公共仓库


