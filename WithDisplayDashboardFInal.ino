#include <WiFi.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <Math.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// Wi-Fi network credentials
const char* ssid = "dialog router";
const char* password = "111#BuduAmmo#000";

// ThingsBoard server settings
const char* mqtt_server = "thingsboard.cloud";
const int mqtt_port = 1883;
const char* mqtt_token = "7kax5hbtu8ilukfeqdg2";
const char* device_id = "b97d30e0-7c1d-11ef-ad7c-57826b712250";

Adafruit_MPU6050 mpu;

WiFiClient wiFiClient;
PubSubClient client(wiFiClient);

// OLED display parameters
#define SCREEN_WIDTH 128 // OLED display width, in pixels
#define SCREEN_HEIGHT 64 // OLED display height, in pixels

// Create a new I2C instance for the display
TwoWire I2C_Display = TwoWire(1);

// Declaration for SSD1306 display connected using I2C
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &I2C_Display, -1);

// Fall Detection Variables
bool fallDetected = false;
float fallThreshold = 22.0;

// Step detection variables
float stepThreshold = 12;
unsigned long lastStepTime = 0;
int stepCount = 0;
const unsigned long stepDebounceTime = 300;

// Distance and calories calculation variables
const float stepLength = 0.78;
const float weight = 70.0; // User weight in kg
const float caloriesPerKmPerKg = 0.57;
float distanceTravelled = 0.0;
float caloriesBurned = 0.0;

// Filtering
const float alpha = 0.5;
float filteredAcceleration = 0;

void reconnectMQTT() {
    while (!client.connected()) {
        Serial.print("Attempting MQTT connection...");
        if (client.connect(device_id, mqtt_token, NULL)) {
            Serial.println("connected");
        } else {
            Serial.print("failed, rc=");
            Serial.print(client.state());
            Serial.println(" try again in 5 seconds");
            delay(5000);
        }
    }
}

void setup() {
    Serial.begin(115200);
    
    // Initialize I2C for MPU6050
    Wire.begin(18, 19); // SDA, SCL for MPU6050
    
    // Initialize I2C for OLED display
    I2C_Display.begin(22, 23, 400000); // SDA, SCL, frequency

    // Initialize the display
    if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { // Address 0x3C for SSD1306
        Serial.println(F("SSD1306 allocation failed"));
        for(;;); // Don't proceed, loop forever
    }
    
    // Clear the buffer
    display.clearDisplay();
    
    // Display a welcome message (optional)
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);
    display.println("Initializing...");
    display.display();

    // WiFi and MQTT initialization
    WiFi.begin(ssid, password);

    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("");
    Serial.print("Connected to ");
    Serial.println(ssid);
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());

    client.setServer(mqtt_server, mqtt_port);
    reconnectMQTT();

    if (!mpu.begin()) {
        Serial.println("Failed to find MPU6050 chip");
        while (1) {
            delay(10);
        }
    }

    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
}

void checkFallDetection(float magnitude) {
    if (magnitude > fallThreshold) {
        fallDetected = true;
        Serial.println("Fall Detected!");
    } else {
        fallDetected = false;
    }
}

void checkStepDetection(float magnitude) {
    unsigned long currentTime = millis();
    if (magnitude > stepThreshold && (currentTime - lastStepTime) > stepDebounceTime) {
        stepCount++;
        lastStepTime = currentTime;
        distanceTravelled += stepLength;
        caloriesBurned = (distanceTravelled / 1000) * weight * caloriesPerKmPerKg;
    }
}

void sendDataToThingsBoard(sensors_event_t a, sensors_event_t g) {
    StaticJsonDocument<300> doc;
    doc["stepCount"] = stepCount;
    doc["distance"] = distanceTravelled;
    doc["caloriesBurned"] = caloriesBurned;
    doc["fallDetected"] = fallDetected;
    doc["accelX"] = a.acceleration.x;
    doc["accelY"] = a.acceleration.y;
    doc["accelZ"] = a.acceleration.z;
    doc["gyroX"] = g.gyro.x;
    doc["gyroY"] = g.gyro.y;
    doc["gyroZ"] = g.gyro.z;

    String payload;
    serializeJson(doc, payload);
    client.publish("v1/devices/me/telemetry", payload.c_str());
    
    Serial.println(payload); // Print the same payload to the Serial Monitor
}

void loop() {
    if (!client.connected()) {
        reconnectMQTT();
    }
    client.loop();

    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);

    float currentAcceleration = sqrt(a.acceleration.x * a.acceleration.x + a.acceleration.y * a.acceleration.y + a.acceleration.z * a.acceleration.z);
    filteredAcceleration = alpha * currentAcceleration + (1 - alpha) * filteredAcceleration;

    checkFallDetection(filteredAcceleration);
    checkStepDetection(filteredAcceleration);

    sendDataToThingsBoard(a, g);

    // Update the display with the step count
    display.clearDisplay();
    display.setTextSize(2);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);
    display.println("Steps:");
    display.setTextSize(3);
    display.setCursor(0, 25);
    display.println(stepCount);
    display.display();

    delay(100); // Adjust as needed
}
