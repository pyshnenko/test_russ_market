import type { Metadata } from "next";
import localFont from "next/font/local";
import { SupportChat } from "@/components/features/support-chat";
import { VisitorNotification } from "@/components/features/visitor-notification";
import { AppThemeProvider } from "@/components/ui/theme-provider";
import { isRelayConfigured } from "@/lib/ws/visitor-relay";
import "./globals.css";

const latin = localFont({
  src: "../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-inter-latin",
  weight: "100 900",
  adjustFontFallback: false,
});

const cyrillic = localFont({
  src: "../node_modules/@fontsource-variable/inter/files/inter-cyrillic-wght-normal.woff2",
  variable: "--font-inter-cyrillic",
  weight: "100 900",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "График смен · CRM",
  description: "Планирование рабочих смен сотрудников",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const supportEnabled = isRelayConfigured();
  return (
    <html lang="ru" className={latin.variable + " " + cyrillic.variable}>
      <body>
        {supportEnabled && <VisitorNotification />}
        <AppThemeProvider>{children}</AppThemeProvider>
        {supportEnabled && <SupportChat />}
      </body>
    </html>
  );
}
