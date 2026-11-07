import { CartPage } from '../components/ShopPages';

export default async function Page() {
  return <CartPage />;
}

export const getConfig = async () => ({ render: 'static' }) as const;
