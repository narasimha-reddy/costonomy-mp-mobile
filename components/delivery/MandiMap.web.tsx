/**
 * The web build of the delivery map: `react-native-maps` has no web implementation, so the web build is the
 * schematic, which is also what native shows when no Google Maps key is configured.
 */
export { MandiMapSketch as MandiMap } from './MandiMapSketch';
export type { MandiMapProps } from './MandiMapSketch';
