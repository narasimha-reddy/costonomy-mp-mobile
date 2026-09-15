import React from 'react';
import { StoreSelector } from '@/components/supplier/StoreSelector';
import { MandiEmptyState, MandiHeader, MandiScreen } from '@/components/common';

/**
 * SUP-CREDIT-01 and -02. Doc 05 §31–§32.
 *
 * <p>The backend has the whole credit module — requests, agreements, exposure,
 * invoices — and this screen lands with M5. Until then it says so rather than
 * showing an empty list that reads as "you have no credit requests", which is a
 * different and possibly false statement.
 */
export default function SupplierCreditScreen() {
  return (
    <MandiScreen header={<MandiHeader title="Credit" right={<StoreSelector />} />}>
      <MandiEmptyState
        icon="card-outline"
        title="Credit is coming next"
        description="Requests from restaurants, your exposure and your portfolio will appear here."
      />
    </MandiScreen>
  );
}
