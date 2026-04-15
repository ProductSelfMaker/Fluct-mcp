import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Fluct — Local',
  description: 'Local Fluct service map. Open core of fluct.tools.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
