// Monorepo Metro config -- see https://docs.expo.dev/guides/monorepos
// Without this, Metro's default resolution falls back to the generic
// expo/AppEntry.js (found via the hoisted root node_modules) instead of
// this project's own index.ts, and AppEntry's "../../App" relative import
// then resolves one level too high (the monorepo root instead of
// apps/mobile), producing "Unable to resolve ../../App" at the bundler.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
