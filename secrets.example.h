// secrets.example.h
//
// Copy this file to "secrets.h" (same folder as the .ino file) and fill in your
// own values. secrets.h is git-ignored, so it will never be pushed to GitHub.
//
//   Copy-Item secrets.example.h secrets.h

#pragma once

// Wi-Fi network the watch connects to
#define WIFI_SSID "your-wifi-name"
#define WIFI_PASSWORD "your-wifi-password"

// ThingsBoard device access token and device id
#define TB_TOKEN "your-thingsboard-access-token"
#define TB_DEVICE_ID "your-thingsboard-device-id"
