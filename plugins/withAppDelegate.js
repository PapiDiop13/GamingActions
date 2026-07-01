/**
 * Config plugin: removes the deprecated `sourceURL(for bridge: RCTBridge)`
 * method from the generated AppDelegate.swift.
 *
 * This method was added by Expo for expo-dev-client compatibility, but it
 * requires the RCTBridge type which is unavailable in the New Architecture
 * (newArchEnabled: true) when building with Xcode 26 / iOS 26 SDK.
 * Since expo-dev-client is not installed, this override is safe to remove.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withPatchedAppDelegate(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const appDelegatePath = path.join(
        cfg.modRequest.platformProjectRoot,
        cfg.modRequest.projectName,
        'AppDelegate.swift'
      );

      if (!fs.existsSync(appDelegatePath)) {
        console.warn('[withAppDelegate] AppDelegate.swift not found, skipping patch.');
        return cfg;
      }

      let contents = fs.readFileSync(appDelegatePath, 'utf8');

      // Remove the sourceURL(for bridge: RCTBridge) override block.
      // Matches the entire method including its body.
      const bridgeMethodRegex =
        /\n\s*override func sourceURL\(for bridge: RCTBridge\)[^}]*\}(\s*\n)?/gs;

      if (bridgeMethodRegex.test(contents)) {
        contents = contents.replace(bridgeMethodRegex, '\n');
        fs.writeFileSync(appDelegatePath, contents, 'utf8');
        console.log('[withAppDelegate] Removed sourceURL(for bridge: RCTBridge) — not needed without expo-dev-client.');
      } else {
        console.log('[withAppDelegate] sourceURL(for bridge:) not found, nothing to patch.');
      }

      return cfg;
    },
  ]);
};
