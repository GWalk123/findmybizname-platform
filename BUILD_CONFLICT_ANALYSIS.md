# Build Tool Conflict Analysis - Root Cause Found

## Problem Identified
Multiple esbuild versions causing build tool conflicts:
- Project: esbuild@0.25.0
- drizzle-kit: esbuild@0.18.20 + 0.19.12  
- tsx: esbuild@0.23.1
- vite: esbuild@0.21.5

## Why This Causes "vite: not found"
Different esbuild versions install binaries in different locations, causing PATH resolution failures in cloud containers.

## Solution
Use `npx` to explicitly call tools instead of relying on PATH:
```yaml
buildCommand: npm install --production=false && npx vite build && npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
```

## Benefits
- `npx` finds correct tool version automatically
- Bypasses PATH resolution issues
- Works regardless of esbuild version conflicts
- More reliable than relying on npm scripts

## Next Steps
1. Upload render-simple.yaml as render.yaml to GitHub
2. Try "Clear build cache & deploy" with this fix
3. Should resolve the status 127 build errors