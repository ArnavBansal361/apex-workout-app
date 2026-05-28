import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.arnav.apex',
  appName: 'Apex',
  webDir: 'dist',
  ios: {
    // WKWebView horizontal edge swipe → history.back() / forward (enabled in ApexBridgeViewController).
    allowBackForwardNavigationGestures: true,
  },
};

export default config;
