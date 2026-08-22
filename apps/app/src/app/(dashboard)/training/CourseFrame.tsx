'use client';

import { useState } from 'react';
import { COURSE_URL } from './course';

export function CourseFrame() {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative bg-white rounded-xl border border-gray-200 overflow-hidden">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
          Loading course…
        </div>
      )}
      <iframe
        src={COURSE_URL}
        title="WHMIS 2015 & SDS Training"
        onLoad={() => setLoaded(true)}
        allowFullScreen
        // The course app is trusted but external: keep it sandboxed to what it
        // actually needs (its own scripts, storage for progress, same-origin
        // navigation) rather than granting top-level navigation of our page.
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        className="w-full h-[calc(100vh-13rem)] min-h-[600px] block border-0"
      />
    </div>
  );
}
