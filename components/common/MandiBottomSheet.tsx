import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from './MandiText';
import { DEVICE_WIDTH } from './DeviceFrame';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * A sheet that rises from the bottom, dismissed by tapping away from it.
 *
 * <p><b>It constrains itself to the phone column, because a `Modal` cannot
 * inherit it.</b> On web `react-native-web` portals a modal to the document
 * body, outside `DeviceFrame` — so a sheet styled as full width is the width of
 * the *browser*, and on a wide window it spans the desktop while the app it
 * belongs to sits in a 390pt column somewhere above it. Every sheet in the app
 * had that bug because every sheet implemented its own modal.
 *
 * <p>Which is the other reason this exists: four screens had four copies of the
 * same scrim, the same radius, the same stop-propagation, and would have needed
 * the same fix four times.
 *
 * <p>There are two ways out, because tapping outside a sheet is how most people
 * close one and a sheet dismissible only from outside is unreachable to anyone
 * who cannot see where "outside" is. So the scrim closes on a tap, silently, and
 * the sheet carries a close button that is the announced route.
 */
export function MandiBottomSheet({
  visible,
  onClose,
  title,
  closeLabel,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  /** Rendered as the sheet's heading, and read as its accessible name. */
  title?: string;
  /** What the close button announces, e.g. "Close the filter". */
  closeLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      // Android only, and the right answer there: a sheet should sit over the
      // navigation bar rather than stopping short of it.
      statusBarTranslucent
    >
      {/* The scrim closes on a tap but is not announced as a button.
          As a button it wrapped every control in the sheet — an option inside a
          button inside a button, which is invalid on web and gives a screen
          reader nested controls where there is one surface. Tapping away stays a
          sighted convenience; the close button below is the announced way out. */}
      <Pressable
        style={styles.scrim}
        onPress={onClose}
        accessible={false}
        importantForAccessibility="no"
      >
        <View style={styles.column} pointerEvents="box-none">
          {/* A View that claims the touch, not a Pressable.
              The sheet has to swallow taps so they do not reach the scrim and
              close it — but a Pressable inside a Pressable renders as a button
              inside a button, which is invalid HTML on web and gives a screen
              reader two nested controls where there is one surface. Claiming the
              responder stops the bubble without pretending to be a control. */}
          <View
            style={styles.sheet}
            onStartShouldSetResponder={() => true}
            accessibilityViewIsModal
            accessibilityLabel={title}
          >
            <View style={styles.titleRow}>
              {title ? (
                <MandiText variant="subtitle" style={styles.flex}>{title}</MandiText>
              ) : <View style={styles.flex} />}
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={closeLabel ?? 'Close'}
                hitSlop={8}
                style={styles.close}
              >
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </Pressable>
            </View>
            {children}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: Colors.scrim,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  column: {
    width: '100%',
    // The cap is web-only: on a device the frame is the screen, and a maxWidth
    // would letterbox the sheet on anything wider than 390pt.
    maxWidth: Platform.OS === 'web' ? DEVICE_WIDTH : undefined,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  flex: { flex: 1 },
  close: { padding: Spacing.xs, margin: -Spacing.xs },
  sheet: {
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    gap: Spacing.xs,
  },
});
