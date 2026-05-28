import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SDS 360 — Hazmat Safety Platform',
  description: 'Dangerous goods safety data management and employee training',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
