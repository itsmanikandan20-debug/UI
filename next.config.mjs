/** @type {import('next').NextConfig} */
const nextConfig = {
  // playwright-core connects to a remote Browserbase browser over CDP —
  // it never launches a local binary, but it still ships native-ish
  // bindings that shouldn't be pulled into the webpack bundle.
  experimental: {
    serverComponentsExternalPackages: ["playwright-core"],
  },
};

export default nextConfig;
