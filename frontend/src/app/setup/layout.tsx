import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Setup - Argus',
};

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
