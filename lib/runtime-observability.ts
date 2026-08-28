// 本文件提供 API 请求 ID、最小结构化日志和安全响应封装；禁止记录正文、凭证、密钥或 D4 内容。
const REQUEST_ID_HEADER = "x-request-id";
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;

export type RuntimeActor = { id: string; name?: string } | null | undefined;

/**
 * 读取或生成请求 ID。输入为 HTTP Request；输出是可安全写入响应、日志和审计的随机关联标识。
 */
export function getRequestId(request: Request) {
  const incoming = request.headers.get(REQUEST_ID_HEADER)?.trim();
  return incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : crypto.randomUUID();
}

/**
 * 输出最小结构化运行日志。输入只允许路由、结果、耗时和错误类别，不接受正文、凭证或异常堆栈。
 */
export function writeStructuredLog(input: { requestId: string; route: string; user?: RuntimeActor; result: string; latencyMs: number; errorCode?: string }) {
  console.info(JSON.stringify({ event: "api_request", request_id: input.requestId, user_id: input.user?.id || null, route: input.route, result: input.result, latency_ms: input.latencyMs, error_code: input.errorCode || null }));
}

/**
 * 为 API 响应补充 request_id 并记录最小结果日志。输入不读取响应正文，因此不会意外写入私有内容。
 */
export function observeResponse(request: Request, route: string, startedAt: number, response: Response, user?: RuntimeActor, errorCode?: string) {
  const requestId = getRequestId(request); const headers = new Headers(response.headers); headers.set(REQUEST_ID_HEADER, requestId);
  writeStructuredLog({ requestId, route, user, result: response.ok ? "success" : "failure", latencyMs: Date.now() - startedAt, errorCode: errorCode || (response.ok ? undefined : `http_${response.status}`) });
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * 生成包含 request_id 的安全错误响应。输入为固定错误类别；输出不会返回内部错误、堆栈、密钥或用户正文。
 */
export function observedError(request: Request, route: string, startedAt: number, status: number, message: string, errorCode: string, user?: RuntimeActor) {
  const requestId = getRequestId(request); writeStructuredLog({ requestId, route, user, result: "failure", latencyMs: Date.now() - startedAt, errorCode });
  return Response.json({ error: message, request_id: requestId }, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

/** 将 request_id 附加到既有最小审计详情，便于审计与运行日志关联，且不接收敏感正文。 */
export function withAuditRequestId(detail: string, request: Request) { return `${detail}｜request_id=${getRequestId(request)}`; }
