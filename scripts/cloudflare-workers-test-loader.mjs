// 本 loader 仅供 Node 原生测试导入已构建的 Cloudflare Worker；它提供空 env binding，不影响 Vite、Worker 或部署运行时。
const workersStubUrl = `data:text/javascript,${encodeURIComponent("export const env = {};\n")}`;

// 将 Worker 专用模块映射为最小测试替身。输入是 ESM specifier，输出是 Node 可加载 URL；其他模块继续交给默认 resolver。
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return { url: workersStubUrl, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
