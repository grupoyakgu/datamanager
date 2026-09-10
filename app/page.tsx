import { AuthReturnHandler } from '@/components/auth/auth-return-handler';

export default function Home() {
  return <AuthReturnHandler fallback="/login" />;
}
