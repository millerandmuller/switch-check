import type { Metadata } from "next";
import { JetBrains_Mono, Lato, Newsreader, Poppins } from "next/font/google";
import "./globals.css";

// Newsreader: the brand line, the summary line and large figures.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

// Lato: running text.
const lato = Lato({
  variable: "--font-lato",
  subsets: ["latin"],
  weight: ["400", "700"],
});

// Poppins: caps labels and block headings.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600"],
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
      className={`${newsreader.variable} ${lato.variable} ${poppins.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
