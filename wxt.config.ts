import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'OHS AC Utilities',
    version: '0.1.0',
    description: 'Offers useful download utilities for Stanford Online High School students accessing Adobe Connect recordings.',
    permissions: [
      'webRequest', // To inspect network requests
      'storage',      // Good to have, WXT uses it internally. Also useful if you want to store simple data.
    ],
    host_permissions: [
      'https://*/*',   // To intercept requests on any page. Be as specific as possible if you can.
    ]
    // WXT automatically detects entrypoints, but you can be explicit if needed.
    // Action (popup) is usually defined by having a popup/index.html entrypoint.
  },  modules: ['@wxt-dev/auto-icons']
});
