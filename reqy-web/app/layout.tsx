import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Reqly - API Playground',
  description: 'Professional API endpoint testing and management platform',
  generator: 'v0.app',
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
}

import { SidebarProvider } from '@/contexts/sidebar-context'
import { Toaster } from '@/components/ui/toaster'
import { FloatingAiChat } from '@/components/floating-ai-chat'
import { ErrorBoundary } from '@/components/error-boundary'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem("reqly-theme");var v=["light","dark","emerald","ocean","sunset","purple","midnight"];if(!t||!v.includes(t)){t=window.matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light"}document.documentElement.classList.add(t);var c=t==="dark"||t==="midnight"?"dark":"light";document.documentElement.style.colorScheme=c;var m=document.querySelector("meta[name=theme-color]");if(m){m.content=c==="dark"?"#0d1117":"#ffffff"}}catch(e){}})()`
        }} />
        <meta name="color-scheme" content="light dark" />
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0d1117" media="(prefers-color-scheme: dark)" />
      </head>
      <body className={`${geist.variable} ${geistMono.variable} font-sans antialiased bg-background text-foreground`}>
        <ThemeProvider defaultTheme="light" storageKey="reqly-theme">
          <ErrorBoundary>
            <SidebarProvider>

              {children}
            </SidebarProvider>
          </ErrorBoundary>
          <FloatingAiChat />
          <Toaster />
        </ThemeProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
