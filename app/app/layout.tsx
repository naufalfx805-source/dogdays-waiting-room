import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'The Waiting Room — what actually makes a shelter dog wait',
  description:
    '347,587 Austin Animal Center records in Snowflake say black dog syndrome is not what people think. Breed is.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
