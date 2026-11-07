import { ProductDetail } from '../../components/ShopPages';
import { PRODUCTS } from '../../lib/scenario';

export default async function ProductPage({ id }: { id: string }) {
  return <ProductDetail id={id} />;
}

export const getConfig = async () =>
  ({
    render: 'static',
    staticPaths: PRODUCTS.map((p) => p.id),
  }) as const;
