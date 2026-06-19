import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RugProof — AI rug-pull scanner on GenLayer",
  description:
    "Verify that a deployed smart contract matches its GitHub source and is free of rug-pull patterns. Powered by GenLayer intelligent contracts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
