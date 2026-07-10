const axios = require('axios');

const DEVICES = [
  {
    name: 'Chrome on Windows',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ip: '1.1.1.1',
    country: 'Australia',
  },
  {
    name: 'Safari on iPhone',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    ip: '2.2.2.2',
    country: 'USA',
  },
  {
    name: 'Firefox on Android',
    ua: 'Mozilla/5.0 (Android 14; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0',
    ip: '3.3.3.3',
    country: 'Germany',
  },
  {
    name: 'Edge on MacOS',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    ip: '4.4.4.4',
    country: 'UK',
  },
  {
    name: 'Chrome on Android Tablet',
    ua: 'Mozilla/5.0 (Linux; Android 13; SM-X906N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ip: '5.5.5.5',
    country: 'Japan',
  },
];

async function simulateTraffic() {
  console.log('🚀 Starting Traffic Simulation...');

  for (const device of DEVICES) {
    console.log(`Simulating visit from: ${device.name}...`);
    try {
      await axios.post('http://localhost:3001/execute', {
        token: 'BOOTSTRAP_TOKEN',
        command: 'ANALYTICS:track-visit',
        payload: {
          visit_data: {
            type: 'page_view',
            url: 'https://example.com/home',
            referrer: 'https://google.com',
            userAgent: device.ua,
            language: 'en-US',
            requestId: `req-${Math.random().toString(36).substr(2, 9)}`,
          },
          network_data: {
            ip: device.ip,
            timestamp: new Date().toISOString(),
          },
          tenantId: '1',
        },
      });
      console.log(`✅ ${device.name} tracked.`);
    } catch (e) {
      console.error(`❌ Error tracking ${device.name}: ${e.message}`);
    }
  }
  console.log('✨ Simulation complete.');
}

simulateTraffic();
