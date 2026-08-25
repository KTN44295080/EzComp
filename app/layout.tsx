import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EzComp",
  description: "A local-first, non-generative image compositor for PSD and raster artwork.",
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
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
