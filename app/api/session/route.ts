import { accessError, publicUser, requireAccessUser } from "../../../lib/access";

export const runtime = "edge";

export async function GET(request: Request) {
  try {
    const user = await requireAccessUser(request);
    return Response.json({ user: publicUser(user) });
  } catch (error) { return accessError(error, "读取登录账号失败"); }
}
