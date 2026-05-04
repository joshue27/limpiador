import { requirePermission } from '@/modules/auth/guards';

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('chat');
  return <>{children}</>;
}
