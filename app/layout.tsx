import type { Metadata } from "next";
import localFont from "next/font/local";
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
  return <html lang="ru" className={latin.variable + " " + cyrillic.variable}><body className="min-h-dvh bg-[#eff0f4] font-sans text-[#191a1e] antialiased">{children}</body></html>;
}
