import type { Metadata } from "next";
import localFont from "next/font/local";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import "./ui-foundation.css";
import "./workspace.css";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { AurumTheme } from "@/components/ui/AurumTheme";

const roboto = localFont({
  src: "./fonts/Roboto.woff2",
  weight: "100 900",
  variable: "--font-roboto",
  display: "swap",
});

// Thai loopless sans with a width axis: condensed + heavy for headings
// (poster style), normal width for body text.
const notoThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: "variable",
  axes: ["wdth"],
  variable: "--font-thai",
  display: "swap",
});

const playfair = localFont({
  src: "./fonts/PlayfairDisplay.woff2",
  weight: "400 900",
  variable: "--font-playfair",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AURUM",
  description: "AURUM content distribution platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${notoThai.variable} ${roboto.variable} ${playfair.variable}`}>
      <body suppressHydrationWarning><AppRouterCacheProvider><AurumTheme>{children}</AurumTheme></AppRouterCacheProvider></body>
    </html>
  );
}
