// 本脚本以跨平台 Node 方式执行 Vinext 真实构建，保留项目级运行目录、Wrangler/Miniflare 环境变量和可配置超时，不依赖 Bash 或 GNU timeout。
import { existsSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRoot = process.env.SITES_RUNTIME_ROOT || join(projectRoot, ".sites-runtime");
const vinextCli = join(projectRoot, "node_modules", "vinext", "dist", "cli.js");

// 将原 GNU timeout 接受的常用时长文本转换为毫秒；非法值直接失败，避免无意取消构建时限。
function parseDuration(value, fallback) {
  const source = value || fallback;
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(source);
  if (!match) throw new Error(`无效的构建时长配置：${source}`);
  const unitMs = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 }[match[2]];
  return Number(match[1]) * unitMs;
}

// 启动真实 Vinext build。输入为项目路径和环境配置，输出为子进程退出结果；超时先终止进程，再按原默认宽限期强制结束。
async function runBuild() {
  if (!existsSync(vinextCli)) {
    throw new Error("vinext is unavailable. Run npm ci before building.");
  }

  for (const directory of ["home", "npm-cache", "xdg-config", "tmp", "wrangler/logs"]) {
    mkdirSync(join(runtimeRoot, directory), { recursive: true });
  }

  const childEnv = {
    ...process.env,
    SITES_ENV_READY: "1",
    SITES_PROJECT_ROOT: projectRoot,
    HOME: join(runtimeRoot, "home"),
    XDG_CONFIG_HOME: join(runtimeRoot, "xdg-config"),
    TMPDIR: join(runtimeRoot, "tmp"),
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_LOG_PATH: join(runtimeRoot, "wrangler/logs"),
    MINIFLARE_REGISTRY_PATH: join(runtimeRoot, "wrangler/registry"),
    npm_config_cache: join(runtimeRoot, "npm-cache"),
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
  };
  delete childEnv.NPM_CONFIG_CACHE;
  delete childEnv.npm_config_proxy;
  delete childEnv.npm_config_http_proxy;
  delete childEnv.npm_config_https_proxy;
  delete childEnv.NPM_CONFIG_PROXY;
  delete childEnv.NPM_CONFIG_HTTP_PROXY;
  delete childEnv.NPM_CONFIG_HTTPS_PROXY;

  const timeoutMs = parseDuration(process.env.SITES_BUILD_TIMEOUT, "3m");
  const killAfterMs = parseDuration(process.env.SITES_BUILD_KILL_AFTER, "10s");
  console.log("Running bounded vinext build...");

  const child = spawn(process.execPath, [vinextCli, "build"], {
    cwd: projectRoot,
    env: childEnv,
    stdio: "inherit",
    windowsHide: true,
  });

  let timedOut = false;
  let forceKillTimer;
  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    console.error(`Vinext build exceeded ${timeoutMs}ms; terminating.`);
    child.kill();
    forceKillTimer = setTimeout(() => child.kill("SIGKILL"), killAfterMs);
  }, timeoutMs);

  const result = await new Promise((resolveResult, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolveResult({ code, signal }));
  });
  clearTimeout(timeoutTimer);
  if (forceKillTimer) clearTimeout(forceKillTimer);

  if (timedOut) process.exitCode = 124;
  else if (result.code !== 0) process.exitCode = result.code || 1;
}

runBuild().catch((error) => {
  console.error(error instanceof Error ? error.message : "Vinext build failed.");
  process.exitCode = 1;
});
