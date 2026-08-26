# Windows本地开发说明

本文档用于记录三江集团智能问答与智能办公系统在Windows环境下的本地开发方式。

原来的 `dev` 命令使用了 Linux 风格的环境变量写法：`WRANGLER_LOG_PATH=.wrangler/wrangler.log vite`。这种写法在 Windows 的命令环境中无法直接识别，因此执行 `npm run dev` 会在启动阶段报错。

现在项目的本地开发启动命令直接执行 `vite`，由构建配置统一处理本地运行所需的环境变量。

`vite.config.ts` 会在加载 Cloudflare 相关插件前设置 `WRANGLER_WRITE_LOGS`、`WRANGLER_LOG_PATH` 和 `MINIFLARE_REGISTRY_PATH`，因此本地开发不需要再在 `package.json` 的 `dev` 命令里重复写 Linux 风格的环境变量。

本次修改只影响 Windows 本地开发启动方式，不修改线上生产部署逻辑。`build`、`start`、`test`、`lint` 等脚本保持原状，线上流程仍按既有方式执行。

当前项目还没有完成本地登录身份、数据库初始化和文件存储配置，因此即使开发服务器可以启动，后续页面和接口仍可能继续暴露这些尚未完成的本地运行问题。
