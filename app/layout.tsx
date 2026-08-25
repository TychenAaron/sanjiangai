import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://sanjiang-ai-workbench.myrtleperes403.chatgpt.site"),
  title: "三江集团AI知识工作台",
  description: "面向三江集团员工的知识库问答、公文写作与政策监测平台。",
  openGraph: {
    title: "三江集团AI知识工作台",
    description: "知识问答｜公文写作｜政策监测",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "三江集团AI知识工作台" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "三江集团AI知识工作台",
    description: "知识问答｜公文写作｜政策监测",
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
