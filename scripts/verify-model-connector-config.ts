// 验证治理后台模型配置的最小安全契约：凭证加密脱敏、数据库优先运行时映射及三类 OpenAI-compatible 检测响应。
import assert from "node:assert/strict";
import { decryptModelApiKey, encryptModelApiKey, testModelConnector, toPublicModelConnector, validateModelConnectorInput } from "../lib/model-connector-config.ts";

const encryptionKey = "local-model-config-verification-key";
const ciphertext = await encryptModelApiKey("test-secret", encryptionKey);
assert.ok(ciphertext && !ciphertext.includes("test-secret"));
assert.equal(await decryptModelApiKey(ciphertext, encryptionKey), "test-secret");
const publicRow = toPublicModelConnector({ id: "m1", purpose: "MAIN_MODEL", baseUrl: "http://localhost:1234/v1", model: "qwen-test", credentialCiphertext: ciphertext, timeoutMs: 15000, endpointPath: null, enabled: true, lastCheckStatus: null, lastCheckHttpStatus: null, lastCheckDurationMs: null, lastCheckedAt: null, updatedAt: "2026-08-29" });
assert.equal("credentialCiphertext" in publicRow, false); assert.equal(publicRow.hasCredentials, true);
assert.equal(validateModelConnectorInput({ purpose: "RERANKER", baseUrl: "http://localhost:1234/v1", model: "rerank", endpointPath: "/rerank" }).endpointPath, "/rerank");

const chat = await testModelConnector({ purpose: "MAIN_MODEL", baseUrl: "http://model.local/v1", model: "chat", timeoutMs: 500, endpointPath: null, enabled: true }, "", async () => Response.json({ choices: [{ message: { content: "非空正文" } }] }));
const embedding = await testModelConnector({ purpose: "EMBEDDING", baseUrl: "http://model.local/v1", model: "embed", timeoutMs: 500, endpointPath: null, enabled: true }, "", async () => Response.json({ data: [{ embedding: [0.1, 0.2] }] }));
const reranker = await testModelConnector({ purpose: "RERANKER", baseUrl: "http://model.local/v1", model: "rerank", timeoutMs: 500, endpointPath: "/rerank", enabled: true }, "", async () => Response.json({ results: [{ index: 0, relevance_score: 1 }] }));
assert.equal(chat.status, "CONNECTED"); assert.equal(embedding.status, "CONNECTED"); assert.equal(reranker.status, "CONNECTED");
console.log("model connector configuration verification passed");
