import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from './MandiText';
import { ProductThumb } from '@/components/product/ProductThumb';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

/**
 * Choose a picture, upload it, and show what was chosen.
 *
 * <p><b>The upload happens on pick, not on save.</b> A file is not a form value:
 * holding it until the form is submitted means the slowest part of saving runs
 * after the person has committed, with nothing to show them but a spinner on a
 * button — and any failure then arrives attached to an action they thought was
 * about a price. Uploading first turns the picture into a URL, after which
 * saving the SKU is the same small request it always was.
 *
 * <p>The consequence is an orphaned object when someone picks and then leaves,
 * which is the cheaper of the two problems: a lifecycle rule collects it, where
 * a half-saved listing has to be noticed by a person.
 *
 * <p>Permission is requested at the moment of picking rather than on mount.
 * §23A.48 — a screen that asks for the photo library before the person has asked
 * for anything is a screen people deny by reflex.
 */
export function MandiImagePicker({
  value,
  fallbackUri,
  onChange,
  onUpload,
  label,
  hint,
  placeholderHint,
  disabled,
}: {
  /** The URL this person has uploaded, or null. Only this counts as theirs. */
  value: string | null;
  /**
   * Shown when they have uploaded nothing — a stand-in that belongs to someone
   * else, so it can be displayed but never removed. Keeping it separate from
   * `value` is what stops "Remove" appearing over a picture that is not theirs
   * to remove.
   */
  fallbackUri?: string | null;
  onChange: (url: string | null) => void;
  /** Does the upload and resolves to the stored URL. */
  onUpload: (file: { uri: string; name: string; type: string }) => Promise<string>;
  label: string;
  hint?: string;
  /** Shown in place of a picture when there is none. */
  placeholderHint?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick() {
    setError(null);

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      // Say what is missing and stop. A retry loop against a denied permission
      // is a screen that appears broken.
      setError('Mandi needs access to your photos to add a picture.');
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      // Square, because every surface that shows this crops it square anyway —
      // and cropping here lets the supplier decide what survives that crop.
      aspect: [1, 1],
      quality: 0.8,
    });
    const asset = picked.canceled ? undefined : picked.assets[0];
    if (!asset) return;
    setBusy(true);
    try {
      const url = await onUpload({
        uri: asset.uri,
        name: asset.fileName ?? `photo.${(asset.mimeType ?? 'image/jpeg').split('/')[1]}`,
        type: asset.mimeType ?? 'image/jpeg',
      });
      onChange(url);
    } catch (caught) {
      // The server's message says which rule was broken — too large, not an
      // image — and replacing it with "upload failed" would lose that.
      setError(caught instanceof Error ? caught.message : 'Could not upload that image.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.block}>
      <MandiText variant="label">{label}</MandiText>

      <View style={styles.row}>
        <ProductThumb uri={value ?? fallbackUri} size={72} radius={Radius.md} />

        <View style={styles.actions}>
          <Pressable
            onPress={pick}
            disabled={disabled || busy}
            accessibilityRole="button"
            accessibilityLabel={value ? 'Replace this photo' : 'Choose a photo'}
            accessibilityState={{ disabled: disabled || busy, busy }}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.pressed,
              (disabled || busy) && styles.buttonDisabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Ionicons name="image-outline" size={16} color={Colors.textPrimary} />
            )}
            <MandiText variant="captionEmphasis">
              {busy ? 'Uploading…' : value ? 'Replace photo' : 'Choose photo'}
            </MandiText>
          </Pressable>

          {value ? (
            <Pressable
              onPress={() => { setError(null); onChange(null); }}
              disabled={disabled || busy}
              accessibilityRole="button"
              accessibilityLabel="Remove this photo"
              style={({ pressed }) => [styles.link, pressed && styles.pressed]}
            >
              <MandiText variant="captionEmphasis" color={Colors.textSecondary}>
                Remove
              </MandiText>
            </Pressable>
          ) : null}
        </View>
      </View>

      {error ? (
        <MandiText variant="caption" color={Colors.danger}>{error}</MandiText>
      ) : (
        <MandiText variant="caption" color={Colors.textSecondary}>
          {value ? hint : placeholderHint ?? hint}
        </MandiText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  actions: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: TouchTarget.min,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  buttonDisabled: { opacity: 0.5 },
  link: { minHeight: TouchTarget.min, justifyContent: 'center', paddingHorizontal: Spacing.xs },
  pressed: { opacity: 0.7 },
});
