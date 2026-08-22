/**
 * The WHMIS course itself lives in a separate app and is embedded via iframe.
 * Override per environment with NEXT_PUBLIC_TRAINING_COURSE_URL.
 *
 * Kept out of CourseFrame.tsx on purpose: that file is 'use client', and every
 * export of a client module becomes a client reference — a server component
 * importing this constant from there would get a proxy, not the string.
 */
export const COURSE_URL =
  process.env.NEXT_PUBLIC_TRAINING_COURSE_URL ?? 'https://whmis-training-course.vercel.app/';
