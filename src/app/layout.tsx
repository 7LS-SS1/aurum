import type { Metadata } from "next";
import { Roboto, Playfair_Display } from "next/font/google";
import "./globals.css";
import "./ui-foundation.css";
import "./workspace.css";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { AurumTheme } from "@/components/ui/AurumTheme";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["700", "900"],
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
