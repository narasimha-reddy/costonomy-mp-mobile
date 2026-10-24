import React from 'react';
import { MandiStatusChip } from '@/components/common';
import { DisputeStatus, resolveStatus } from '@/models/status';

/** A dispute's status as the registry words it (sentence case, its own tone): one chip for the list and the detail. */
export function DisputeStatusChip({ status }: { status: string }) {
  return <MandiStatusChip {...resolveStatus(DisputeStatus, status)} size="sm" />;
}
