import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Manrope } from "next/font/google";
import "./globals.css";

const display = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const sans = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

function getSiteUrl() {
  const value =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL;

  if (!value) return "http://localhost:3000";
  return value.startsWith("http://") || value.startsWith("https://")
    ? value
    : `https://${value}`;
}

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "AURA — AI Personal Stylist",
  description:
    "Build a digital closet, ask AURA what to wear, and plan outfits from clothes you already own.",
  openGraph: {
    title: "AURA — AI Personal Stylist",
    description:
      "Build a digital closet, ask AURA what to wear, and plan outfits from clothes you already own.",
    type: "website",
    images: [
      {
        url: "/assets/hero-product-visual.webp",
        width: 1600,
        height: 1000,
        alt: "AURA AI personal stylist app preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AURA — AI Personal Stylist",
    description:
      "Build a digital closet, ask AURA what to wear, and plan outfits from clothes you already own.",
    images: ["/assets/hero-product-visual.webp"],
  },
  icons: {
    icon: "/assets/favicon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#080709",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
