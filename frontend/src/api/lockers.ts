import { apiRequest } from './client';
import type { CommandHistory, LockerSlot, LockerStatus } from './types';

interface ApiListResponse<T> {
  success: true;
  data: T[];
}

interface ApiDataResponse<T> {
  success: true;
  data: T;
}

export interface SlotHardwareConfig {
  hardware_enabled: boolean;
  servo_pin: number | null;
  sensor_pin: number | null;
}

export function getLockerStatus(): Promise<ApiDataResponse<LockerStatus>> {
  return apiRequest<ApiDataResponse<LockerStatus>>('/device/status');
}

export function getLockerSlots(lockerCode: string): Promise<ApiListResponse<LockerSlot>> {
  return apiRequest<ApiListResponse<LockerSlot>>(`/lockers/${encodeURIComponent(lockerCode)}/slots`);
}

export function getCommandHistory(token: string): Promise<ApiListResponse<CommandHistory>> {
  return apiRequest<ApiListResponse<CommandHistory>>('/device/commands', {}, token);
}

export function createLockerSlot(
  lockerCode: string,
  slotCode: string,
  config: SlotHardwareConfig,
  token: string,
) {
  return apiRequest<ApiDataResponse<LockerSlot>>(
    `/lockers/${encodeURIComponent(lockerCode)}/slots`,
    {
      method: 'POST',
      body: JSON.stringify({ slot_code: slotCode, ...config }),
    },
    token,
  );
}

export function updateSlotHardware(
  slotId: number,
  config: SlotHardwareConfig,
  token: string,
) {
  return apiRequest<ApiDataResponse<LockerSlot>>(
    `/lockers/slots/${slotId}/config`,
    {
      method: 'PATCH',
      body: JSON.stringify(config),
    },
    token,
  );
}

export function deleteLockerSlot(slotId: number, token: string) {
  return apiRequest<{ success: true; message: string }>(
    `/lockers/slots/${slotId}`,
    { method: 'DELETE' },
    token,
  );
}

export function updateSlotStatus(slotId: number, status: string, token: string) {
  return apiRequest<ApiDataResponse<LockerSlot>>(
    `/lockers/slots/${slotId}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
    token,
  );
}

export function openLockerSlot(slotCode: string, token: string, releaseItem = false) {
  return apiRequest(
    '/device/commands',
    {
      method: 'POST',
      body: JSON.stringify({
        slot_code: slotCode,
        command_type: 'OPEN_SLOT',
        duration_ms: 5000,
        release_item: releaseItem,
      }),
    },
    token,
  );
}
