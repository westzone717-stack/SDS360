'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Forces the parent Server Component to re-fetch data on every client-side navigation.
// Next.js caches the RSC payload between soft navigations even with `dynamic = 'force-dynamic'`;
// router.refresh() invalidates that cache so the SDS list is always up to date.
export function RefreshOnMount() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
  }, [router]);
  return null;
}
