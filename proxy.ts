// API 代理入口统一透传或生成 x-request-id；不读取请求正文、不记录凭证，也不改变业务权限判断。
import { NextResponse, type NextRequest } from "next/server";
import { getRequestId } from "./lib/runtime-observability";

export function proxy(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestHeaders = new Headers(request.headers); requestHeaders.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers: requestHeaders } }); response.headers.set("x-request-id", requestId);
  return response;
}

export const config = { matcher: ["/api/:path*"] };
