import type { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/theme';

/**
 * A face for each catalog category.
 *
 * <p>Doc 05 §3 asks for image-rich, and the seeded catalog carries no imagery —
 * `imageUrl` is null on every category and product today. A grid of identical
 * grey tiles is not "image-rich", it is a list pretending to be one, so each
 * category gets an icon and a tint until real photography exists.
 *
 * <p>Matched on the category name because the ids are seed data and will differ
 * between environments. An unmatched category still renders, with the neutral
 * default — a new category appearing as a plain tile is a much smaller problem
 * than one that fails to render.
 */
type IconName = keyof typeof Ionicons.glyphMap;

interface CategoryFace {
  icon: IconName;
  tint: string;
  background: string;
}

const FACES: Record<string, CategoryFace> = {
  dairy: { icon: 'water-outline', tint: Colors.info, background: Colors.infoLight },
  'meat & poultry': { icon: 'nutrition-outline', tint: Colors.danger, background: Colors.dangerLight },
  vegetables: { icon: 'leaf-outline', tint: Colors.success, background: Colors.successLight },
  'grains & pulses': { icon: 'basket-outline', tint: Colors.warning, background: Colors.warningLight },
  'oils & fats': { icon: 'flask-outline', tint: Colors.warning, background: Colors.warningLight },
  'spices & masala': { icon: 'flame-outline', tint: Colors.primary, background: Colors.primaryLight },
  'sugar & sweeteners': { icon: 'cafe-outline', tint: Colors.primary, background: Colors.primaryLight },
  beverages: { icon: 'beer-outline', tint: Colors.info, background: Colors.infoLight },
  packaging: { icon: 'cube-outline', tint: Colors.textSecondary, background: Colors.surfaceSunken },
  'cleaning & hygiene': { icon: 'sparkles-outline', tint: Colors.success, background: Colors.successLight },
};

const DEFAULT: CategoryFace = {
  icon: 'pricetag-outline',
  tint: Colors.textSecondary,
  background: Colors.surfaceSunken,
};

export function categoryFace(name: string | null | undefined): CategoryFace {
  if (!name) return DEFAULT;
  return FACES[name.trim().toLowerCase()] ?? DEFAULT;
}
