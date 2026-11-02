export interface LockerSlot {
  id: number;
  locker_code?: string;
  slot_code: string;
  status: string;
  occupancy_status: 'empty' | 'occupied' | 'maintenance' | string;
  door_status: 'open' | 'closed' | 'unknown' | string;
  device_status: 'online' | 'offline' | string;
  hardware_enabled: boolean;
  servo_pin: number | null;
  sensor_pin: number | null;
  updated_at?: string;
}

export interface LockerStatus {
  is_online?: boolean;
  door_states?: Record<string, string>;
  locker: {
    id: number;
    locker_code: string;
    is_online: boolean;
    is_simulation_mode: boolean;
    last_heartbeat?: string | null;
    wifi_rssi?: number | null;
  };
  slots: LockerSlot[];
  hardware_info?: {
    microcontroller: string;
    slots: Array<{
      slot_code: string;
      servo_pin: number;
      sensor_pin: number;
      type: string;
    }>;
  };
}

export interface CommandHistory {
  id: number;
  slot_code: string;
  command_type: string;
  status: string;
  result_message?: string | null;
  is_simulation: boolean;
  created_at: string;
  executed_at?: string | null;
}
