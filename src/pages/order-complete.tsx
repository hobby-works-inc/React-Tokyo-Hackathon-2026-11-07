import { OrderComplete } from '../components/ShopPages';

export default async function Page() {
  return <OrderComplete />;
}

export const getConfig = async () => ({ render: 'static' }) as const;
