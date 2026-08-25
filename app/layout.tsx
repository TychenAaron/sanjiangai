import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "三江集团AI知识工作台",
  description: "面向三江集团员工的知识库问答、公文写作与政策监测平台。",
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
