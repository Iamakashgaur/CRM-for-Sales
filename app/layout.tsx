import type { Metadata } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import { Providers } from "./providers"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Karat — Sales CRM",
  description: "AI-powered B2B Sales CRM",
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${mono.variable} font-sans min-h-screen bg-background text-foreground antialiased`}
        style={{ fontFeatureSettings: '"cv02","cv03","cv04","cv11","ss01","ss02"' }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
