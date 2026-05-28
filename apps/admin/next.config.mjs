/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@sds360/types'],
  experimental: {
    serverComponentsExternalPackages: ['mongoose', 'ioredis'],
  },
};

export default nextConfig;
