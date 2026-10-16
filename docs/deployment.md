# 部署说明

## 静态站点

先安装依赖并完成校验：

```sh
npm ci
npm test
npm run build
npx wrangler login
```

各站点的 Worker 名称、域名与静态目录已写入配置：

| 站点 | Worker | 配置 |
| --- | --- | --- |
| MC | `mc-teaching-overview` | `sites/mc/wrangler.jsonc` |
| Rocket | `rocket-reading-lab` | `sites/rocket/wrangler.jsonc` |
| AP CSP | `apcsp-teaching-materials` | `sites/apcsp/wrangler.jsonc` |

这些配置指向现有生产域名。部署到自己的账户时先修改 Worker 名称和域名。发布命令会更新相应线上站点：

```sh
npm run deploy:mc
npm run deploy:rocket
npm run deploy:apcsp
```

可先运行对应配置的 `npx wrangler deploy --dry-run --config <配置路径>`。MC/AP CSP 直接部署 `site/`；Rocket 只能部署构建生成的 `dist/`，不要部署项目目录。`site/.assetsignore` 排除系统元数据文件。

## 作业服务

[`services/assignment-upload/src/index.js`](../services/assignment-upload/src/index.js) 是当前接收服务源码。生产对象内容和 KV 数据不在仓库中。首次运行独立实例：

1. 创建一个私有 R2 桶和一个 KV 命名空间。
2. 将 `services/assignment-upload/wrangler.example.jsonc` 复制为同目录的 `wrangler.local.jsonc`（已忽略）。
3. 填入自己的 KV ID、桶名、账户域名和路由。生产资源 ID 不随源码发布。
4. 修改源码中的 `ALLOWED_ORIGINS`，使其与自己的教学站来源一致；并修改页面中的 API 地址。
5. 校验后使用该本地配置部署。

```sh
npx wrangler deploy --dry-run --config services/assignment-upload/wrangler.local.jsonc
npx wrangler deploy --config services/assignment-upload/wrangler.local.jsonc
```

API：

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| POST | `/api/assignments` | 接收 `className`、`studentName`、`work` 的 multipart 表单，保存到私有 R2 |
| GET | `/api/assignments/records` | 从对象元数据生成日期、班级、姓名、文件名列表 |
| OPTIONS | `/api/assignments*` | 为允许的来源提供 CORS 预检 |

附件接口未公开；文件名只作为记录文本展示。服务保留 25 MiB 上限、扩展名检查和基于 KV 的每 IP 限速。KV 计数不是严格的并发配额，来源检查也不等同于学生身份验证；这里记录现有实现，未引入新的认证系统。

## 凭据

使用本机 Wrangler 登录或平台的秘密管理。不要把 API Token、`.env`、`.dev.vars`、Cookie 或证书私钥加入 Git。当前 CI 无需任何部署凭据，也不会操作生产资源。
