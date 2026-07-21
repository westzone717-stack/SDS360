import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AnalysisChat } from './AnalysisChat';

export default async function AnalysisPage() {
  const session = await auth();
  const role = session?.user.role;

  // Available to org admins and regular staff only — not access managers,
  // and not super_admin (which only exists in the separate admin portal).
  if (role !== 'admin' && role !== 'user') {
    redirect('/');
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Analysis</h1>
      <p className="text-sm text-gray-500 mb-6">Ask questions about your organization's safety data.</p>
      <AnalysisChat />
    </div>
  );
}
