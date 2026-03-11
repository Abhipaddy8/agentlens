import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentLens Studio",
  description: "Chat interface for AgentLens-routed AI agents",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-lens-bg text-lens-text antialiased">
        {children}
      </body>
    </html>
  );
}
