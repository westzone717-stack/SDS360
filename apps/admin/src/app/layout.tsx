import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SDS 360 — Super Admin',
  description: 'Super Admin portal for SDS 360 platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
