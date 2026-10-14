import type { NextConfig } from 'next';

const config: NextConfig = {
  // workspace packages ship TypeScript source
  transpilePackages: ['@stride/server', '@stride/contract', '@stride/engine'],
  serverExternalPackages: ['pg'],
  poweredByHeader: false,
};
export default config;
