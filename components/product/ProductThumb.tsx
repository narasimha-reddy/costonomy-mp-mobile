import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '@/theme';

/**
 * A canonical product's picture, at a size a list can afford.
 *
 * <p>Two things this deliberately does not do.
 *
 * <p><b>It never shows a broken frame.</b> Most canonical products have no image
 * — the catalogue is seeded faster than it is photographed — and a remote URL can
 * fail long after it was valid. Both cases fall to the same neutral tile, so a
 * missing picture looks like a product without a photo rather than like an app
 * that is failing.
 *
 * <p><b>It never guesses.</b> The fallback is a basket glyph, the same for every
 * product: it says "no picture", not "possibly this". Deriving a stand-in from
 * the category would put a leaf on a bag of rice and a drop of milk on a tub of
 * ghee, and on a food marketplace a plausible-but-wrong picture is worse than an
 * obviously absent one — a restaurant orders from these.
 */
export function ProductThumb({
  uri,
  size = 40,
  radius = Radius.sm,
}: {
  uri?: string | null;
  size?: number;
  radius?: number;
}) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: radius };

  if (!uri || failed) {
    return (
      <View style={[styles.fallback, box]}>
        <Ionicons
          name="basket-outline"
          size={Math.round(size * 0.45)}
          color={Colors.textTertiary}
        />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[styles.image, box]}
      // Cover, not contain: these are square crops of photographs, and letterboxing
      // them inside a 40pt tile wastes the little space a list row has.
      resizeMode="cover"
      onError={() => setFailed(true)}
      accessibilityIgnoresInvertColors
    />
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: Colors.surfaceSunken },
  fallback: {
    backgroundColor: Colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
