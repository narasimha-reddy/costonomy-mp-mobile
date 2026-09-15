import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DeliveryEvent } from '@/models/delivery';
import { MandiText } from '@/components/common';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * The delivery timeline. Doc 05 §16.
 *
 * <p>Shows only events the backend applied. A duplicate or out-of-order event is
 * kept in the database for diagnosis and deliberately not surfaced — a restaurant
 * does not need to see a courier's retries, and showing them would make a normal
 * delivery look chaotic.
 */
export function DeliveryTimeline({ events }: { events: DeliveryEvent[] }) {
  if (events.length === 0) return null;

  // Newest first: the current state is what someone opens this screen for.
  const ordered = [...events].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

  return (
    <View style={styles.timeline}>
      {ordered.map((event, index) => (
        <View key={event.id} style={styles.row}>
          <View style={styles.rail}>
            <View style={[styles.dot, index === 0 && styles.dotCurrent]}>
              {index === 0 && <Ionicons name="ellipse" size={8} color={Colors.textInverse} />}
            </View>
            {index < ordered.length - 1 && <View style={styles.line} />}
          </View>
          <View style={styles.body}>
            <MandiText variant={index === 0 ? 'bodyEmphasis' : 'body'}>
              {event.description ?? humanise(event.status)}
            </MandiText>
            <MandiText variant="caption" color={Colors.textTertiary}>
              {formatTime(event.occurredAt)}
            </MandiText>
          </View>
        </View>
      ))}
    </View>
  );
}

function humanise(status: string): string {
  const spaced = status.replace(/_/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  timeline: { gap: 0 },
  row: { flexDirection: 'row', gap: Spacing.md },
  rail: { alignItems: 'center', width: 20 },
  dot: {
    width: 14,
    height: 14,
    borderRadius: Radius.full,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  dotCurrent: { backgroundColor: Colors.primary },
  line: { flex: 1, width: 2, backgroundColor: Colors.borderLight, marginVertical: 2 },
  body: { flex: 1, gap: Spacing.xs, paddingBottom: Spacing.lg },
});
