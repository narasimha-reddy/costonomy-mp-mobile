import React from 'react';
import { useOutlet } from '@/contexts/OutletProvider';
import { usePermissions } from '@/hooks/usePermissions';
import { TeamScreen } from '@/components/team/TeamScreen';

/** The restaurant's team (costonomy-common-api): who can order, receive and pay, at which outlets. */
export default function RestaurantTeamScreen() {
  const { outlets, outlet } = useOutlet();
  const { canForRestaurant, canForOutlet } = usePermissions();
  const restaurantId = outlet?.restaurantId ?? null;
  const canManage = canForRestaurant('team.edit', restaurantId)
    || outlets.some((o) => canForOutlet('team.edit', o));

  return (
    <TeamScreen
      side="RESTAURANT"
      orgId={restaurantId}
      places={outlets.map((o) => ({ id: o.id, name: o.name }))}
      canManage={canManage}
    />
  );
}
