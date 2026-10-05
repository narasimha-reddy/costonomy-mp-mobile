import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
  avoidKeyboard = false,
  testID,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  /** Rendered as the sheet's heading, and read as its accessible name. */
  title?: string;
  /** What the close button announces, e.g. "Close the filter". */
  closeLabel?: string;
  /**
   * For sheets with inputs. Lifts the sheet above the keyboard (padding on both
   * platforms: with edge-to-edge Android the window no longer resizes itself)
   * and puts the body in a scroll view so everything stays reachable when it
   * does not fit above the keyboard.
   */
  avoidKeyboard?: boolean;
  testID?: string;
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
      <View style={styles.scrim}>
        {/* The backdrop is a SIBLING layer behind the sheet, not its parent.
            As the parent, every press inside the sheet that was not claimed by a
            control (the Amount field, plain text) bubbled up to it and closed the
            sheet; on web that made typing an amount impossible. Only a tap on the
            dimmed area now reaches it. It is not announced as a button: the close
            button below is the announced way out, tapping away is a sighted
            convenience. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessible={false}
          importantForAccessibility="no"
          testID={testID ? `${testID}-backdrop` : 'sheet-backdrop'}
        />
        <KeyboardAvoidingView
          style={styles.column}
          pointerEvents="box-none"
          behavior={avoidKeyboard ? 'padding' : undefined}
          enabled={avoidKeyboard}
          testID={avoidKeyboard && testID ? `${testID}-keyboard-avoiding` : undefined}
        >
          <View
            style={styles.sheet}
            accessibilityViewIsModal
            accessibilityLabel={title}
            testID={testID}
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
            {avoidKeyboard ? (
              <ScrollView
                style={styles.scrollBody}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                testID={testID ? `${testID}-scroll` : undefined}
              >
                {children}
              </ScrollView>
            ) : children}
          </View>
        </KeyboardAvoidingView>
      </View>
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
    maxHeight: '100%',
  },
  scrollBody: { flexGrow: 0, flexShrink: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  flex: { flex: 1 },
  close: { padding: Spacing.xs, margin: -Spacing.xs },
  sheet: {
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    gap: Spacing.xs,
    flexShrink: 1,
  },
});
