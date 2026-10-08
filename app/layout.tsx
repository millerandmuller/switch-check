import type { Metadata } from "next";
import { Figtree, JetBrains_Mono, Outfit } from "next/font/google";
import "./globals.css";

// Outfit: headlines, figures and the wordmark. Light weights carry the soft
// half of a two-weight headline.
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["200", "300", "400", "600"],
});

// Figtree: everything that is read.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// JetBrains Mono: model ids and the prompt.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Switch Check",
  description: "Compare two AI models on your own prompt before you switch.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${figtree.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
