import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
};

export default nextConfig;
