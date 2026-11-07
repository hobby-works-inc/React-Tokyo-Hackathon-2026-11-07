import { ResultPage } from '../components/ShopPages';

export default async function Page() {
  return <ResultPage />;
}

export const getConfig = async () => ({ render: 'static' }) as const;
