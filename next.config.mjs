/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // postgres.js opens raw TCP sockets; load it from node_modules at runtime
    // rather than letting webpack bundle it into server chunks.
    serverComponentsExternalPackages: ["postgres"],
  },
};

export default nextConfig;
