const ESP32_GPIO_PINS = new Set([0, 2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33]);
const ESP32_INPUT_ONLY_PINS = new Set([34, 35, 36, 39]);

export interface HardwareConfig {
  hardwareEnabled: boolean;
  servoPin: number | null;
  sensorPin: number | null;
}

export function parseHardwareConfig(body: Record<string, unknown>): HardwareConfig {
  const hardwareEnabled = body.hardware_enabled === true;
  const servoPin = body.servo_pin === null || body.servo_pin === undefined || body.servo_pin === ""
    ? null
    : Number(body.servo_pin);
  const sensorPin = body.sensor_pin === null || body.sensor_pin === undefined || body.sensor_pin === ""
    ? null
    : Number(body.sensor_pin);

  if (!hardwareEnabled) {
    return { hardwareEnabled: false, servoPin: null, sensorPin: null };
  }

  if (servoPin === null || sensorPin === null || !Number.isInteger(servoPin) || !Number.isInteger(sensorPin)) {
    throw new Error("Ngăn có phần cứng phải khai báo servo_pin và sensor_pin");
  }
  if (!ESP32_GPIO_PINS.has(servoPin) && !ESP32_INPUT_ONLY_PINS.has(servoPin)) {
    throw new Error(`GPIO servo không hợp lệ: ${servoPin}`);
  }
  if (!ESP32_GPIO_PINS.has(sensorPin) && !ESP32_INPUT_ONLY_PINS.has(sensorPin)) {
    throw new Error(`GPIO cảm biến không hợp lệ: ${sensorPin}`);
  }
  if (ESP32_INPUT_ONLY_PINS.has(servoPin)) {
    throw new Error(`GPIO ${servoPin} chỉ dùng làm input, không thể điều khiển servo`);
  }
  if (servoPin === sensorPin) {
    throw new Error("GPIO servo và cảm biến không được trùng nhau");
  }

  return { hardwareEnabled: true, servoPin, sensorPin };
}
