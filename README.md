# MingCheng Learning · 课程与作业

当前教学网站的公开源码，包含课程目录、作业提交界面、提交记录页面和三个课程专题。首次收录日期：2026-10-16。

## 线上页面与源码

| 网站 / 功能 | 线上地址 | 源码 |
| --- | --- | --- |
| 课程目录与提交作业 | [mc.gaojihe.cn](https://mc.gaojihe.cn/) | [`sites/mc/site/`](sites/mc/site/) |
| 已提交记录 | [提交记录](https://mc.gaojihe.cn/submissions/) | [`sites/mc/site/submissions/`](sites/mc/site/submissions/) |
| Vibe Coding 实践指南 | [中英对照指南](https://mc.gaojihe.cn/vibe-coding/) | [`sites/mc/site/vibe-coding/`](sites/mc/site/vibe-coding/) |
| 火箭与轨道实验 | [rocket.gaojihe.cn](https://rocket.gaojihe.cn/) | [`sites/rocket/`](sites/rocket/) |
| AP CSP 数据与编程 | [apcsp.gaojihe.cn](https://apcsp.gaojihe.cn/) | [`sites/apcsp/site/`](sites/apcsp/site/) |
| 作业接收与记录 API | `share.gaojihe.cn/api/assignments` | [`services/assignment-upload/`](services/assignment-upload/) |

Rocket 包含火箭降落、绕地飞行、地月航行及配套英文阅读。AP CSP 包含 Big Idea 2 讲义、命令行日记编程练习与博客 CSV 清洗示例数据。课程资料中的外部参考链接仍指向其原始网站。

## 本地运行

需要 Node.js 22 或更新版本，以及 Python 3（静态预览）。

```sh
npm ci
npm test
npm run build
npm run preview:mc       # http://localhost:4173
# 另外两个终端可分别运行：
npm run preview:rocket   # http://localhost:4174
npm run preview:apcsp    # http://localhost:4175
```

`npm test` 校验公开文件清单、站内链接、JavaScript 语法和 Rocket 物理模型测试。`npm run build` 按明确清单构建 Rocket 的 23 个公开资源。MC 与 AP CSP 直接使用各自的 `site/` 目录。

预览保留线上链接和原有 API 地址。生产作业服务只接受指定教学域名的上传；本地预览不提供上传权限。独立运行该服务需要单独配置私有 R2、限速 KV 和允许的来源，见[部署说明](docs/deployment.md)。

## 数据范围

本仓库只保存页面、程序、公开课程示例数据和部署配置。提交记录页保留查询逻辑，**不保存实际学生提交记录、姓名清单或附件**。也不包含教师知识库、AP Classroom 受保护材料、本地日记记录、凭据、依赖缓存、备份或历史 Git 仓库。

作业附件继续保存于私有 R2；记录接口只提供日期、班级、姓名、文件名。`share.gaojihe.cn` 的既有文件分享目录不属于此次源码发布范围。外部参考网站的页面和资源没有复制到本仓库。

## 线上版本核对

[`docs/source-assets.json`](docs/source-assets.json) 记录此次收录的静态源码、对应线上地址与 SHA-256；不含作业 API 响应或学生数据。该清单记录仓库快照，不把网络超时视为线上版本已经核对通过。

```sh
npm run verify:live
```

该命令仅读取固定清单中的公开静态资源并比较字节，不调用作业记录 API，不上传文件，不下载学生附件。网络超时会明确报错；若未来网站更新，旧快照的线上校验会报告差异。首次导出已完成本地校验和构建，部分线上请求在导出时发生超时，因此不声称全部线上资源均已完成 HTTP 核对。

## 发布

静态站点使用 Cloudflare Workers Static Assets，三个站点分别有自己的配置。仓库创建不会触发线上重新部署；GitHub Actions 只进行校验和构建。手动发布命令与服务配置步骤见[部署说明](docs/deployment.md)。

公开仓库尚未指定开源许可证；页面中的第三方参考资料仍遵循各自来源的使用条件。
