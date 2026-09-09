import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mortgage Lens — Traditional vs. Bitcoin Collateralized",
  description: "Compare the cash flow and projected cost of a traditional mortgage with a Bitcoin-collateralized mortgage program.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
