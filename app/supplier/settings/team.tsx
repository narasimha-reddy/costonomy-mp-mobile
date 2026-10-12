import React from 'react';
import { useStore } from '@/contexts/StoreProvider';
import { usePermissions } from '@/hooks/usePermissions';
import { TeamScreen } from '@/components/team/TeamScreen';

/** The supplier's team (costonomy-common-api): who runs which store, and who sees credit and settlements. */
export default function SupplierTeamScreen() {
  const { stores, store } = useStore();
  const { canForStore } = usePermissions();
  const supplierId = store?.supplierOrganizationId ?? null;
  const canManage = stores.some((s) => canForStore('SUPPLIER_USER_MANAGE', s));

  return (
    <TeamScreen
      side="SUPPLIER"
      orgId={supplierId}
      places={stores.map((s) => ({ id: s.id, name: s.name }))}
      canManage={canManage}
    />
  );
}
