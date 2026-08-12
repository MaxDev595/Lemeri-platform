import type { Metadata } from "next";
import "./globals.css";
import "./product.css";

export const metadata: Metadata = { title: "Lemiri AI", description: "Ваш цифровой сотрудник" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru" data-theme="light"><body>{children}</body></html>;
}
