import type { ReactNode } from 'react';
import '../styles.css';
import { Shell } from '../components/Shell';

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <title>ポチモール（架空）— 生成UI誘導デモ</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <Shell>{children}</Shell>
    </>
  );
}

export const getConfig = async () => ({ render: 'static' }) as const;
