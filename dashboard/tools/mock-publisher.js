// tools/mock-publisher.js
//
// Publishes fake patient telemetry to the topic the dashboard listens on, so you
// can test the dashboard without the physical watch.
//
// Usage:
//   npm run mock        -> normal walking data
//   npm run mock:fall   -> walking data that turns into a fall alert
//
// Override the broker / topic with environment variables:
//   $env:MQTT_BROKER_URL = "mqtt://127.0.0.1:1883"
//   $env:MQTT_TOPIC = "patient/data"
//   npm run mock

const mqtt = require('mqtt');

const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://192.168.1.3';
const TOPIC = process.env.MQTT_TOPIC || 'patient/data';
const INTERVAL_MS = Number(process.env.MOCK_INTERVAL_MS || 1000);
const FALL_MODE = process.argv.includes('--fall');

// Same constants as the firmware
const stepLength = 0.78; // cm per step
const weight = 70.0; // kg
const caloriesPerKmPerKg = 0.57;

let stepCount = 0;
let distance = 0;
let tick = 0;

const client = mqtt.connect(BROKER_URL, { reconnectPeriod: 5000 });

client.on('connect', () => {
  console.log(`[mock] connected to ${BROKER_URL}`);
  console.log(`[mock] publishing to "${TOPIC}" every ${INTERVAL_MS} ms`);
  console.log(`[mock] mode: ${FALL_MODE ? 'walking + fall alert' : 'walking'}`);
});

client.on('error', (err) => {
  console.error(`[mock] MQTT error: ${err.message} (retrying)`);
});

// Small random jitter so the charts look alive
const noise = (amount) => (Math.random() - 0.5) * amount;

function walkingPayload() {
  tick += 1;

  // Roughly one step per two ticks
  if (tick % 2 === 0) {
    stepCount += 1;
    distance += stepLength;
  }

  const calories = (distance / 1000) * weight * caloriesPerKmPerKg;

  return {
    stepCount,
    distance: Number(distance.toFixed(2)),
    caloriesBurned: Number(calories.toFixed(3)),
    fallDetected: false,
    accelX: Number((0.4 + noise(1.2)).toFixed(3)),
    accelY: Number((0.9 + noise(1.2)).toFixed(3)),
    accelZ: Number((9.6 + noise(1.5)).toFixed(3)),
    gyroX: Number(noise(24).toFixed(3)),
    gyroY: Number(noise(24).toFixed(3)),
    gyroZ: Number(noise(24).toFixed(3)),
  };
}

function fallPayload() {
  const data = walkingPayload();
  data.fallDetected = true;
  data.accelX = 14.2;
  data.accelY = -18.7;
  data.accelZ = 6.3;
  data.gyroX = 240.5;
  data.gyroY = -180.2;
  data.gyroZ = 95.4;
  return data;
}

const timer = setInterval(() => {
  // In fall mode the alert starts after a few normal readings and stays on
  const isFall = FALL_MODE && tick >= 5;
  const payload = isFall ? fallPayload() : walkingPayload();

  client.publish(TOPIC, JSON.stringify(payload), (err) => {
    if (err) console.error(`[mock] publish failed: ${err.message}`);
  });
  console.log('[mock]', JSON.stringify(payload));
}, INTERVAL_MS);

function shutdown() {
  console.log('\n[mock] stopping');
  clearInterval(timer);
  client.end(false, {}, () => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
