import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
import './globals.css';
import { QueryProvider } from '@/lib/query-provider';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'DME Prior Auth — Agent Console',
  description: 'AI-assisted prior authorization for durable medical equipment orders',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <QueryProvider>
          <div className="min-h-screen">
            <header className="border-b border-slate-200 bg-white">
              <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
                <Link href="/" className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-sm font-bold text-white">
                    D
                  </span>
                  <span className="text-sm font-semibold tracking-tight text-slate-900">
                    DME Prior Auth <span className="text-slate-400">Agent Console</span>
                  </span>
                </Link>
                <nav className="flex items-center gap-1 text-sm">
                  <Link
                    href="/"
                    className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/intake"
                    className="rounded-md bg-teal-600 px-3 py-1.5 font-medium text-white hover:bg-teal-700"
                  >
                    New intake
                  </Link>
                </nav>
              </div>
            </header>
            <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
          </div>
        </QueryProvider>
      </body>
    </html>
  );
}
