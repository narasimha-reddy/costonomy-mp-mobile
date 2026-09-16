import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
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
 * <p>The scrim is a button. Tapping outside a sheet is how people close one, and
 * a sheet that can only be dismissed by a control inside it traps anyone who
 * opened it by accident.
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
  /** What the scrim announces, e.g. "Close the filter". */
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
      <Pressable
        style={styles.scrim}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={closeLabel ?? 'Close'}
      >
        <View style={styles.column} pointerEvents="box-none">
          <Pressable
            style={styles.sheet}
            // Without this, a tap on the sheet bubbles to the scrim and closes it.
            onPress={(event) => event.stopPropagation()}
            accessibilityViewIsModal
            accessibilityLabel={title}
          >
            {title ? <MandiText variant="subtitle">{title}</MandiText> : null}
            {children}
          </Pressable>
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
  sheet: {
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    gap: Spacing.xs,
  },
});
