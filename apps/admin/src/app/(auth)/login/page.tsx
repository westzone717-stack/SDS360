'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

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
      if (!data.success) {
        setError(data.error ?? 'Failed to send OTP');
      } else {
        setStep('otp');
      }
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
      if (result?.error) {
        setError('Invalid or expired OTP');
      } else {
        router.push('/dashboard');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900">SDS 360</h1>
            <p className="text-sm text-gray-500 mt-1">Super Admin Portal</p>
          </div>

          {step === 'email' ? (
            <form onSubmit={sendOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Admin Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@sds360.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-800 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-900 disabled:opacity-50"
              >
                {loading ? 'Sending…' : 'Send One-Time Code'}
              </button>
            </form>
          ) : (
            <form onSubmit={verifyOtp} className="space-y-4">
              <p className="text-sm text-gray-600">
                A 6-digit code was sent to <strong>{email}</strong>. Valid for 10 minutes.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Verification Code
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-center tracking-widest text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-800 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-900 disabled:opacity-50"
              >
                {loading ? 'Verifying…' : 'Verify & Sign In'}
              </button>
              <button
                type="button"
                onClick={() => { setStep('email'); setOtp(''); setError(''); }}
                className="w-full text-sm text-gray-500 hover:text-gray-700"
              >
                Back
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
