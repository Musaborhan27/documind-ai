import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DocuMind AI",
  description: "AI document Q&A frontend",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}