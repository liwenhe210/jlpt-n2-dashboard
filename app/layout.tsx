import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'JLPT N2 学习 Dashboard',
  description: '按阶段、模块、任务与检查点推进的本地学习 Dashboard。',
  manifest: './manifest.webmanifest',
  icons: { icon: './favicon.svg', apple: './apple-touch-icon.png' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
