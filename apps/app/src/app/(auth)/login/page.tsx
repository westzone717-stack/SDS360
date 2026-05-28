'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Step = 'email' | 'otp';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) setError(data.error ?? 'Failed to send code');
      else setStep('otp');
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await signIn('otp', { email, otp, redirect: false });
      if (result?.error) setError('Invalid or expired code');
      else router.push('/');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-gray-100">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-blue-900">SDS 360</h1>
            <p className="text-gray-500 text-sm mt-1">Hazmat Safety Platform</p>
          </div>

          {step === 'email' ? (
            <form onSubmit={sendOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-800 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-900 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Sending code…' : 'Continue with Email'}
              </button>
              <p className="text-center text-sm text-gray-500">
                Don't have an account?{' '}
                <Link href="/register" className="text-blue-600 hover:underline">Request access</Link>
              </p>
            </form>
          ) : (
            <form onSubmit={verifyOtp} className="space-y-4">
              <p className="text-sm text-gray-600 text-center">
                Enter the 6-digit code sent to <strong>{email}</strong>
              </p>
              <input
                type="text"
                required
                autoFocus
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-full border border-gray-300 rounded-lg px-3 py-3 text-center text-2xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {error && <p className="text-red-600 text-sm text-center">{error}</p>}
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full bg-blue-800 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-900 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
              <button
                type="button"
                onClick={() => { setStep('email'); setOtp(''); setError(''); }}
                className="w-full text-sm text-gray-500 hover:text-gray-700 py-1"
              >
                Use a different email
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
