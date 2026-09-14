import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * Whether the device currently has usable connectivity.
 *
 * Drives `MandiOfflineBanner`. Note this answers "can we reach the network",
 * **not** "did that write succeed" — an offline mutation must never be reported
 * as successful (§23A.46, guardrail "never claim order/payment success offline"),
 * and that rule is enforced at the mutation layer rather than by reading this.
 *
 * `isInternetReachable` is preferred over `isConnected` where the platform
 * supplies it: a phone attached to a captive-portal wifi is "connected" and
 * cannot reach the API. It is `null` until the first probe resolves, which we
 * treat as online so the banner does not flash on a cold start.
 */
export function useNetworkStatus(): { online: boolean; offline: boolean } {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const reachable = state.isInternetReachable;
      setOnline(Boolean(state.isConnected) && reachable !== false);
    });
    return unsubscribe;
  }, []);

  return { online, offline: !online };
}
