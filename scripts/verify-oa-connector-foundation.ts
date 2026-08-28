// 本脚本使用完全离线的 mock fetch 核验 OA 配置安全边界和连接检测状态；不访问真实 OA、模型或资料。
import { readFile } from "node:fs/promises";
import { createOaConnector } from "../lib/oa-connector.ts";
import { decryptOaCredentials, encryptOaCredentials, testOaConnection, validateOaConnectorInput } from "../lib/oa-connector-config.ts";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

const input = { name: "虚构 OA 连接", baseUrl: "https://oa.example.invalid", endpointPath: "/health", requestMethod: "GET" as const, authType: "BEARER_TOKEN" as const, headers: { "Accept-Language": "zh-CN" }, timeoutMs: 15000, enabled: true };
const normalized = validateOaConnectorInput(input);
assert(normalized.baseUrl === "https://oa.example.invalid" && normalized.endpointPath === "/health", "OA 配置应保留通用 HTTPS 地址和 Endpoint");
let rejectedHttp = false; try { validateOaConnectorInput({ ...input, baseUrl: "http://oa.example.invalid" }); } catch { rejectedHttp = true; }
let rejectedPost = false; try { validateOaConnectorInput({ ...input, requestMethod: "POST" as "GET" }); } catch { rejectedPost = true; }
assert(rejectedHttp, "测试连接不得允许跳过 TLS");
assert(rejectedPost, "测试连接不得使用写方法");

const cipher = await encryptOaCredentials({ token: "local-only-secret", password: "local-only-password" }, "offline-test-encryption-key");
const plain = await decryptOaCredentials(cipher, "offline-test-encryption-key");
assert(!cipher.includes("local-only-secret") && plain.token === "local-only-secret", "凭证必须加密保存且可仅在服务端解密");

const baseConfig = { ...normalized, contentType: "application/json", authType: "NONE" as const, customAuthHeaderName: null, credentials: {} };
const connected = await testOaConnection(baseConfig, async () => new Response("ok", { status: 200 }));
const authFailed = await testOaConnection(baseConfig, async () => new Response("denied", { status: 401 }));
const httpFailed = await testOaConnection(baseConfig, async () => new Response("error", { status: 503 }));
const networkFailed = await testOaConnection(baseConfig, async () => { throw new TypeError("offline network failure"); });
const timeout = await testOaConnection(baseConfig, async () => { throw new DOMException("aborted", "AbortError"); });
assert(connected.status === "CONNECTED" && authFailed.status === "AUTH_FAILED" && httpFailed.status === "HTTP_ERROR" && networkFailed.status === "DNS_NETWORK_ERROR" && timeout.status === "TIMEOUT", "连接检测必须区分成功、认证、HTTP、网络和超时状态");

const connector = createOaConnector(async () => connected, true);
assert((await connector.fetchDocuments()).status === "NOT_IMPLEMENTED" && (await connector.fetchDocumentDetail("virtual-document")).status === "NOT_IMPLEMENTED", "本轮不得实现 OA 文档读取或同步");

const [routes, page, publicMapper, legacyConnector] = await Promise.all([
  Promise.all([readFile(new URL("../app/api/oa-connectors/route.ts", import.meta.url), "utf8"), readFile(new URL("../app/api/oa-connectors/[id]/route.ts", import.meta.url), "utf8"), readFile(new URL("../app/api/oa-connectors/[id]/test/route.ts", import.meta.url), "utf8")]),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/oa-connector-config.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/oa-connector.ts", import.meta.url), "utf8"),
]);
assert(routes.every((route) => route.includes('user.role !== "system_admin"')), "普通员工不得读取、保存或测试 OA 配置");
assert(routes[2].includes("testOaConnection") && publicMapper.includes('["GET", "HEAD"]'), "测试连接必须通过保存的安全方法调用统一检测器");
assert(!publicMapper.slice(publicMapper.indexOf("toPublicOaConnector"), publicMapper.indexOf("testOaConnection")).includes("credentialCiphertext,"), "公开配置映射不得返回凭证明文或密文");
assert(page.includes("OA 接入配置") && page.includes("测试连接") && page.includes("凭证从不回填到浏览器"), "治理后台必须提供管理员配置和测试连接入口");
assert(legacyConnector.includes('throw new Error("oa_not_implemented")'), "本轮旧 OA 同步入口必须明确保持未实现");
console.log("OA connector foundation verification passed.");
