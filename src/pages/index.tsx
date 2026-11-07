import { ProductList } from '../components/ShopPages';

export default async function Page() {
  return <ProductList />;
}

export const getConfig = async () => ({ render: 'static' }) as const;
