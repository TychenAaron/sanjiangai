// 本文件补充本项目 Vite 与 Cloudflare Worker 运行时的最小类型声明，不包含任何密钥或运行时配置值。
declare module "cloudflare:workers" {
  export const env: Record<string, string | undefined>;
}

interface ImportMeta {
  readonly env: { DEV: boolean };
}
