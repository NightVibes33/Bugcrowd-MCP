import type { ReactNode } from "react";

export const metadata = {
  title: "Bugcrowd MCP Server",
  description: "Remote MCP bridge for the Bugcrowd API",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
