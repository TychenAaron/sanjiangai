# Windows本地开发说明

本文档用于记录三江集团智能问答与智能办公系统在 Windows 环境下的本地开发方式。

原来的 `dev` 命令使用了 Linux 风格的环境变量写法：`WRANGLER_LOG_PATH=.wrangler/wrangler.log vite`。这种写法在 Windows 的命令环境中无法直接识别，因此执行 `npm run dev` 会在启动阶段报错。

现在项目的本地开发启动命令直接执行 `vite`，由构建配置统一处理本地运行所需的环境变量。

`vite.config.ts` 会在加载 Cloudflare 相关插件前设置 `WRANGLER_WRITE_LOGS`、`WRANGLER_LOG_PATH` 和 `MINIFLARE_REGISTRY_PATH`，因此本地开发不需要再在 `package.json` 的 `dev` 命令里重复写 Linux 风格的环境变量。

本次修改只影响 Windows 本地开发启动方式，不修改线上生产部署逻辑。`build`、`start`、`test`、`lint` 等脚本保持原状，线上流程仍按既有方式执行。

## 本机数据库初始化

本机 D1 数据库初始化命令如下：

- `npm run db:migrate:local`

这个命令固定使用 `wrangler d1 migrations apply DB --local --config wrangler.local.toml`，只会操作当前项目目录下的本机开发数据库，不会连接、迁移或清空线上 D1。

首次在本机完成数据库初始化后，再访问 `localhost`，系统会通过统一认证入口自动创建本地测试管理员：

- 邮箱：`local.admin@sanjiang.test`
- 姓名：`本地测试管理员`
- 部门：`试用管理组`
- 角色：`system_admin`
- 岗位级别：`5`
- 数据级别：`3`

严禁在本机开发数据库中放入集团真实敏感资料。本机数据库只允许存放脱敏测试数据和本地调试用数据。

如需补齐本机测试员工账号，可执行：

- `npm run db:seed:local:test-users`

这个命令只会向本机 local D1 写入四个虚构测试账号及其试用部门，不会连接线上环境。

## 本机测试资料清单和预期可见范围

执行下面命令可写入五份仅含虚构元数据的本机测试资料：

- `npm run db:seed:local:test-documents`

这些资料没有正文、附件、文件名、存储键或真实业务来源，全部标记为 `本机测试` / `local_test`。该命令固定使用 local D1，严禁用于线上环境。

- `本机测试｜集团公开通知`：所有四个测试账号可见。
- `本机测试｜内部工作指引`：所有四个测试账号可见。
- `本机测试｜试用业务部敏感资料`：本机管理员和试用业务部负责人可见；普通员工和财务负责人不可见。
- `本机测试｜财务试用部敏感资料`：本机管理员和财务负责人可见；普通员工和试用业务部负责人不可见。
- `本机测试｜本机机密测试资料`：仅本机系统管理员可见。

`document_acl` 若存在，只能在角色、部门、岗位和数据级别的既有判断基础上继续收窄，不能把原本无权的账号扩大为有权。

## 本地测试身份

本地测试身份由 [lib/access.ts](/e:/SanjiangAI/lib/access.ts) 的统一认证入口提供，不再依赖 Vite 中间件补请求头。

只有同时满足下面两个条件时，系统才会在缺少正式认证头的情况下回退到虚构测试身份：

- `process.env.NODE_ENV === "development"`
- 请求 URL 的主机名是 `localhost`、`127.0.0.1`、`::1` 或 `[::1]`

本地开发使用的虚构测试账号如下：

- 邮箱：`local.admin@sanjiang.test`
- 姓名：`本地测试管理员`
- 邮箱：`local.staff@sanjiang.test`
- 姓名：`本地测试员工`
- 邮箱：`local.manager@sanjiang.test`
- 姓名：`本地测试部门负责人`
- 邮箱：`local.finance@sanjiang.test`
- 姓名：`本地测试财务负责人`

四个本机测试账号的最小权限范围如下：

- `local.staff@sanjiang.test`：普通员工，试用业务部，`positionLevel=1`，`clearanceLevel=1`，可查看 `public` 和 `internal`。
- `local.manager@sanjiang.test`：部门负责人，试用业务部，`positionLevel=3`，`clearanceLevel=2`，可查看 `public`、`internal`、`sensitive`。
- `local.finance@sanjiang.test`：财务负责人，财务试用部，`positionLevel=4`，`clearanceLevel=3`，可查看 `public`、`internal`、`sensitive`。
- `local.admin@sanjiang.test`：系统管理员，试用管理组，`positionLevel=5`，`clearanceLevel=3`，可查看 `public`、`internal`、`sensitive`、`confidential`。

这个测试身份只用于本地开发调试，不能作为正式登录方案。生产环境仍必须使用 OA 单点登录或经过批准的身份平台。

这些账号仅用于本机测试，严禁用于生产环境，更严禁录入集团真实敏感资料。

## 本机测试身份切换与恢复

管理员在 `localhost`、`127.0.0.1` 或 `::1` 的 development 环境中，可以调用 `POST /api/local-test/accounts` 切换身份。请求只接受固定账号代号，例如：

```json
{ "action": "switch", "account": "staff" }
```

可用代号只有 `admin`、`staff`、`manager`、`finance`。接口会先确认当前账号在数据库中是 `system_admin`，再以 HttpOnly Cookie 保存已选择的本机测试身份；不接受邮箱、URL 参数或任意请求头直接伪造身份。

测试普通员工后，可以在同一地址调用：

```json
{ "action": "clear" }
```

该操作只会清除本机 Cookie；下一个本机 development 请求会自动恢复为 `local.admin@sanjiang.test`。Cookie 使用仅存在于开发 Worker 内存中的签名，重启开发服务后旧 Cookie 自动失效。

这套切换和恢复机制只是本机开发工具。生产环境、局域网 IP 和线上域名均不会启用，生产环境仍必须使用 OA 单点登录或批准的身份平台。

如果请求本身已经带有正式认证请求头，统一认证入口会优先使用正式身份，不会覆盖或替换。

此前尝试过用 Vite 中间件补请求头，但 Cloudflare 插件会重构 Worker Request，导致补进去的头没有传递到统一认证入口。该方案已经确认无效并删除。

当前项目即使完成了本地测试身份回退，下一层仍可能出现本地数据库尚未初始化、文件存储尚未配置等错误。这些问题需要在后续关卡中分别处理。

## 本机虚构上传安全验证

上传安全闭环只允许使用 `scripts/fixtures/` 下两份完全虚构的 `.txt` 文件，严禁使用集团或任何公司真实资料：

- `local-upload-blocked.txt`：含虚构禁止词条 `LOCAL_UPLOAD_BLOCK_TOKEN`，应返回 HTTP `400`，且不会写入本机 R2 或资料表。
- `local-upload-allowed.txt`：不含禁止词条，应返回 HTTP `201`，进入 `pending` 待审核状态。

先在本机管理员身份下启动 localhost 开发服务，然后执行：

- `npm run verify:local:upload-flow`

该验证会创建或复用一条虚构禁止词条，上传两份虚构文本，验证普通员工不能上传敏感资料、所有账号都不能上传机密资料，并由本机系统管理员审核通过未命中词条的资料。它只请求 `localhost`，使用 local D1 和 local R2，不会连接线上环境。

机密资料不得通过当前在线上传入口提交，应按后续机密资料专用流程处理。无论本机还是生产环境，都严禁把集团真实敏感资料放入本机测试目录、local D1 或 local R2。

## 本机知识问答可靠依据验证

当前问答是关键词分片检索，不是向量检索，也没有接入 Embedding 或 Reranker。系统先按当前账号权限过滤已审核分片，再按可靠依据门槛筛选；没有达到门槛的资料不会进入引用、摘录或未来模型上下文。

默认最低可靠分为 `12`，因为现有评分公式在完整标准化问题命中时额外加 `12` 分。仅在需要更严格门槛时，可由本机运行环境设置不低于 `12` 的 `RAG_MIN_RELIABLE_SCORE`；不要用它降低门槛。

先重新写入虚构资料种子并启动 localhost 开发服务，然后执行：

- `npm run db:seed:local:test-documents`
- `npm run verify:local:knowledge-reliability`

验证会检查公开资料的 extractive 引用是否显示“第1段”、无关问题是否返回 `no_basis`、普通员工是否完全看不到本机机密测试资料，以及系统管理员是否能按既有权限获得该虚构机密资料。没有可靠依据时，系统明确不回答；本关不配置或调用任何线上模型。

## 可替换模型网关本机验证

当前模型网关遵循“未配置时原文摘录、配置后依据问答”的安全方式。网关使用通用的 `MODEL_GATEWAY_BASE_URL`、`MODEL_GATEWAY_API_KEY`、`MODEL_GATEWAY_MODEL`；仅在通用配置缺失时兼容读取旧 `QWEN_*` 名称。真实模型地址和 Key 只能在经批准环境的安全变量中配置，绝不能写入 `package.json`、代码、Git 或本文档。

模型仅能接收已通过账号权限、已审核且达到可靠依据门槛的有限引用分片。模型超时、网关失败、无效 JSON、越界引用或无引用结论都会安全降级为原文摘录；没有可靠依据时保持 `no_basis`，不调用网关。

本机 mock 验证不启动服务、不联网，也不会读取 local D1：

- `npm run verify:local:model-gateway`

该命令覆盖未配置、合格引用、越界引用、无引用结论、超时、网关 500、无可靠依据和普通员工机密资料隔离。所有 mock 内容均为虚构文本，任何 Key 不得写入项目文件。

## 智能写作可替换模型网关

智能写作默认使用本地模拟结构化生成器。只有服务端明确设置 `AI_MODEL_ENABLED=true`，并同时配置 `AI_GATEWAY_BASE_URL`、`AI_GATEWAY_API_KEY` 后，才会通过 OpenAI-compatible `/chat/completions` 调用写作模型。逻辑模型名固定为 `Qwen3.8-27B`，可用 `AI_WRITING_MODEL` 覆盖实际请求模型名；`AI_MODEL_TIMEOUT_MS` 用于设置超时。

请以 `.env.example` 为变量清单，示例值均为虚构值。API Key 只能放在本机受控环境或部署平台的服务端密钥配置，绝不能放入 Git、浏览器、`package.json` 或日志。云端试运行阶段不得输入集团真实资料；后期切换集团本地部署时只需替换网关地址和模型名，智能写作业务代码不变。

模型输入只含用户填写的基础信息、当前账号有权且达到可靠门槛的正式依据，以及不含文件名和原文的私有材料结构提示。D4/机密/个人隐私等明显敏感标识会阻止外发并回退模拟生成。模型超时、401、429、500、空响应、拒答、非法 JSON 或非法结构也会回退，不会覆盖已有正文或把失败内容当成成功结果。

不启动服务、不联网的 mock 验证命令：

- `npm run verify:writing-model-gateway`

## 本机公文写作 V1 验证

公文工作区当前只支持请示、通知和工作情况汇报。选择参考文件后会立即绑定到当前私有工作区，但只有点击“开始正文编写并检索依据”才生成正文。刷新页面不会恢复上一次工作区；正文不会自动进入正式知识库、不会自动审批、不会自动发文，也不会接入 OA 或 NC。

先执行 `npm run db:migrate:local`，再启动 localhost 后运行 `npm run verify:local:writing`。验证仅使用虚构事实，检查普通员工只能查看自己的工作区、系统管理员可管理全部工作区、三类文种在未启用模型时生成模拟结构化正文、无权机密资料不会成为引用、正文不自动进入公共知识库。

## 本机公文 Word 导出

生成正文后即可导出 Word，不需要 `final` 状态。创建人只能导出自己的公文，`system_admin` 可以导出全部公文；每次导出都会先保存当前正文，再生成下载文件并记录最小审计信息，不代表审批、发文或进入 `documents` 公共知识库。

在本机页面中编辑正文后可随时多次点击“导出 Word”。下载文件包含标题、文种、连续正文、真实编号和表格、可选的正式引用依据核验附录，以及“仅供人工审核，导出不代表审批或发文”的提示；不会包含本机测试身份、模型配置、私有参考材料、历史版本或无权资料。

启动 localhost 后可运行 `npm run verify:local:writing-export`。脚本只创建虚构公文，验证 DOCX MIME 类型、`word/document.xml`、虚构标题和正文、创建人权限、普通员工跨账号拒绝、未定稿拒绝以及最终稿不自动进入知识库。严禁用真实集团资料进行本机导出测试。

## 本机公文私有参考材料验收

公文工作区的私有参考材料只服务于当前一份公文，创建人和 `system_admin` 可以访问；其他账号不能读取、上传或删除。材料不会写入 `documents`、知识资源、知识问答、正式 citations 或 Word 导出附录。

支持的上传格式是 `txt`、`md`、`csv`、`tsv`、`docx`、`xlsx`、`pptx`，会在上传后显示解析状态和定位摘要。旧格式 `doc`、`ppt` 会保存原文件并显示 `pending_conversion`，当前不会伪造正文；每份公文最多 3 个文件、每个文件最大 5MB。`confidential`（机密）会被明确拒绝。

上传顺序固定为：先解析，再检查后台 `blocked_terms`，命中时不写 local D1 或 local R2；通过后把原文件写入 local R2 的 `writing-references/` 私有前缀，再写入 `writing_private_references`。若 D1 写入失败，系统只回滚这一次创建的 R2 对象；删除时同步删除 D1 记录和对应私有 R2 原文件。

本机验证步骤：

- 执行 `npm run db:migrate:local`，它只使用 `wrangler.local.toml` 和 `--local`。
- 执行 `npm run db:seed:local:test-users`，再启动 `npm run dev`。
- 在另一个终端执行 `npm run verify:local:writing`。

该脚本只使用虚构内容，覆盖 0 份材料继续、文本+xlsx+pptx 三份混合、禁止词无保存、第 4 个拒绝、doc/ppt 待转换、confidential 拒绝、越权拒绝、D1/R2 同步删除以及资料库和知识问答零泄露。
