import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export default async function RootPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  // Land each role on its main page. Training is only gated for regular users
  // (same rule as middleware) — managers/admins default to trainingStatus.required
  // too, but must not be sent to a page that isn't in their nav.
  switch (session.user.role) {
    case 'access_manager':
      redirect('/users');
    case 'user':
      if (session.user.trainingRequired) redirect('/training');
      redirect('/sds');
    default:
      redirect('/sds');
  }
}
