import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin Turbopack's workspace root to this directory. Without this,
  // a stray package-lock.json elsewhere on disk (e.g. ~/) makes Next
  // infer the wrong root and emit a "multiple lockfiles detected"
  // warning at build time. `import.meta.dirname` resolves to the
  // directory of this config file regardless of where `next` is
  // invoked from. Requires Node ≥ 20.11.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
