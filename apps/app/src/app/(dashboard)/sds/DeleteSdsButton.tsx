'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function DeleteSdsButton({
  id,
  productName,
  redirectTo,
  variant = 'link',
}: {
  id: string;
  productName: string;
  redirectTo?: string;
  variant?: 'link' | 'button';
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete "${productName}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/sds/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error ?? 'Failed to delete document');
        return;
      }
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  }

  const className =
    variant === 'button'
      ? 'border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50'
      : 'text-red-600 hover:text-red-800 text-xs font-semibold disabled:opacity-50';

  return (
    <button type="button" onClick={handleDelete} disabled={deleting} className={className}>
      {deleting ? 'Deleting…' : 'Delete'}
    </button>
  );
}
