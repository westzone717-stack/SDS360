/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@sds360/types'],
  experimental: {
    serverComponentsExternalPackages: ['mongoose', 'ioredis'],
  },
};

export default nextConfig;
