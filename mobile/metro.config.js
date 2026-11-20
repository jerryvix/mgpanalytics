// Metro config. Lets the app import shared code from ../packages (design tokens, odds math)
// while the web app stays at the repo root. See docs/mobile/DECISIONS.md D-006.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../packages')];

module.exports = config;
