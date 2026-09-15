import { apiRequest } from '@/lib/api/client';
import type { Settlement } from '@/models/settlement';

export function fetchSettlements(token: string, storeId: number): Promise<Settlement[]> {
  return apiRequest<Settlement[]>(`/api/v1/supplier-stores/${storeId}/settlements`, { token });
}

export function fetchSettlement(token: string, settlementId: number): Promise<Settlement> {
  return apiRequest<Settlement>(`/api/v1/settlements/${settlementId}`, { token });
}
