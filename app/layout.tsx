import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    'https://middle-east-conflict-ledger.naadir-duglas.chatgpt.site',
  ),
  title: 'The Conflict Ledger — Middle East Timeline',
  description:
    'An interactive, sourced chronology of the Iran–Israel–Gaza–Lebanon–Yemen conflict from 2020 to 2026.',
  openGraph: {
    title: 'The Conflict Ledger — Middle East Timeline',
    description:
      'Explore 156 sourced military, diplomatic, legal and maritime events across an interconnected regional conflict.',
    type: 'website',
    siteName: 'The Conflict Ledger',
    images: [
      {
        url: '/og.png',
        width: 1672,
        height: 941,
        alt: 'The Conflict Ledger — Middle East chronology, 2020–2026',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The Conflict Ledger — Middle East Timeline',
    description:
      'Explore 156 sourced events across an interconnected regional conflict.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
