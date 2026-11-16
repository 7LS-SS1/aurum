import type { Metadata } from "next";
import localFont from "next/font/local";
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
    <html lang="th" className={`${roboto.variable} ${playfair.variable}`}>
      <body suppressHydrationWarning><AppRouterCacheProvider><AurumTheme>{children}</AurumTheme></AppRouterCacheProvider></body>
    </html>
  );
}
