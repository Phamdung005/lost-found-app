import assert from "node:assert/strict";
import test from "node:test";
import { parseHardwareConfig } from "../src/utils/hardware-config.js";

test("accepts a configured servo and sensor pin", () => {
  assert.deepEqual(
    parseHardwareConfig({
      hardware_enabled: true,
      servo_pin: "18",
      sensor_pin: 4,
    }),
    { hardwareEnabled: true, servoPin: 18, sensorPin: 4 },
  );
});

test("clears pins when hardware is disabled", () => {
  assert.deepEqual(
    parseHardwareConfig({
      hardware_enabled: false,
      servo_pin: 18,
      sensor_pin: 4,
    }),
    { hardwareEnabled: false, servoPin: null, sensorPin: null },
  );
});

test("rejects an input-only GPIO for a servo", () => {
  assert.throws(
    () => parseHardwareConfig({ hardware_enabled: true, servo_pin: 34, sensor_pin: 4 }),
    /chỉ dùng làm input/,
  );
});

test("rejects duplicate servo and sensor GPIOs", () => {
  assert.throws(
    () => parseHardwareConfig({ hardware_enabled: true, servo_pin: 18, sensor_pin: 18 }),
    /không được trùng nhau/,
  );
});
