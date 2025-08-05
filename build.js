#!/usr/bin/env node

// Simple build script for Render deployment
// Ensures all dependencies are available for build process

const { execSync } = require('child_process');

console.log('Starting FindMyBizName build process...');

try {
  // Install all dependencies including devDependencies
  console.log('Installing dependencies...');
  execSync('npm install', { stdio: 'inherit' });
  
  // Build frontend with Vite
  console.log('Building frontend...');
  execSync('npx vite build', { stdio: 'inherit' });
  
  // Build backend with esbuild
  console.log('Building backend...');
  execSync('npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist', { stdio: 'inherit' });
  
  console.log('Build completed successfully!');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}