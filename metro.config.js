const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Exclude the Firebase Cloud Functions folder — it contains server-only packages
// (expo-server-sdk, undici, etc.) that use import.meta and break Hermes.
config.watchFolders = (config.watchFolders || []).filter(
  (folder) => !folder.includes('functions')
);

config.resolver.blockList = [
  ...(config.resolver.blockList ? [config.resolver.blockList].flat() : []),
  new RegExp(path.join(__dirname, 'functions').replace(/\\/g, '\\\\') + '/.*'),
];

module.exports = config;
