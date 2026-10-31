// server.js
require('dotenv').config({ quiet: true });
const express = require('express');
const app = express();
const mqtt = require('mqtt');
const path = require('path');
const nodemailer = require('nodemailer');

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Configuration
// Every value can be overridden with an environment variable (see .env.example).
// The defaults keep the original behaviour of this project.
// ---------------------------------------------------------------------------
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://192.168.1.3';
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'patient/data';
const PORT = process.env.PORT || 3000;

// Email configuration
const EMAIL_USER = process.env.EMAIL_USER || 'Jerryriggg123@gmail.com';
const EMAIL_PASS = process.env.EMAIL_PASS || '123#itpm456'; // Replace with an app password
const ALERT_TO = process.env.ALERT_TO || 'samiru.gamage@gmail.com';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

// MQTT client setup
const mqttClient = mqtt.connect(MQTT_BROKER_URL, {
  reconnectPeriod: 5000,
});

// Data storage for SSE clients
let clients = [];

// MQTT client event handlers
mqttClient.on('connect', () => {
  console.log(`Connected to MQTT broker ${MQTT_BROKER_URL}`);
  mqttClient.subscribe(MQTT_TOPIC, (err) => {
    if (err) {
      console.error('Failed to subscribe to MQTT topic:', err);
    } else {
      console.log(`Subscribed to topic ${MQTT_TOPIC}`);
    }
  });
});

// Without this listener an unreachable broker would crash the whole process.
mqttClient.on('error', (err) => {
  console.error(`MQTT error (${MQTT_BROKER_URL}): ${err.message} - retrying in 5s`);
});

mqttClient.on('message', (topic, message) => {
  // Parse the message, ignore anything that is not valid JSON
  let data;
  try {
    data = JSON.parse(message.toString());
  } catch (err) {
    console.error('Ignoring malformed MQTT message:', message.toString());
    return;
  }
  console.log('Received MQTT message:', data);

  // Send data to all connected SSE clients
  clients.forEach((res) => res.write(`data: ${JSON.stringify(data)}\n\n`));

  // Send email if fallDetected is true
  if (data.fallDetected) {
    const mailOptions = {
      from: EMAIL_USER,
      to: ALERT_TO,
      subject: 'Fall Detected Alert',
      text: 'Alert: The patient has fallen down!',
    };

    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        console.log('Email error:', error.message);
      } else {
        console.log('Email sent: ' + info.response);
      }
    });
  }
});

// SSE endpoint
app.get('/events', (req, res) => {
  // Set headers for SSE
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  console.log('Client connected to SSE');
  clients.push(res);

  // Remove client when connection closes
  req.on('close', () => {
    console.log('Client disconnected from SSE');
    clients = clients.filter((client) => client !== res);
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is listening on http://localhost:${PORT}`);
});
