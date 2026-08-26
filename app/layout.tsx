import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://sanjiang-ai-workbench.myrtleperes403.chatgpt.site"),
  title: "三江集团智能问答与智能办公系统",
  description: "面向三江集团员工的知识中枢、智能搜索、知识会话、智能写作与政策监测平台。",
  openGraph: {
    title: "三江集团智能问答与智能办公系统",
    description: "知识中枢｜智能搜索｜知识会话｜智能写作",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "三江集团智能问答与智能办公系统" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "三江集团智能问答与智能办公系统",
    description: "知识中枢｜智能搜索｜知识会话｜智能写作",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
