import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 正式资料上传不再使用 8MB 业务阈值；保留 64MB 运行时上限以防异常请求耗尽资源。
  experimental: {
    serverActions: {
      bodySizeLimit: "64mb",
    },
  },
};

export default nextConfig;
