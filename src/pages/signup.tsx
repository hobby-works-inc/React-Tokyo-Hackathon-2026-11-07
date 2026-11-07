import { SignupPage } from '../components/AuthPages';

export default async function Page() {
  return <SignupPage />;
}

export const getConfig = async () => ({ render: 'static' }) as const;
