import { LoginPage } from '../components/AuthPages';

export default async function Page() {
  return <LoginPage />;
}

export const getConfig = async () => ({ render: 'static' }) as const;
