import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList, Pressable, StyleSheet, Text, View,
  type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiButton } from '@/components/common';
import { MAX_SCALE, MIN_SCALE, ZoomableImage } from '@/components/wallet/bill/ZoomableImage';
import { linkExpired, pageFileName } from '@/lib/wallet/bill';
import type { InvoicePage } from '@/models/wallet';
import { ReviewColors, ReviewLayout, Spacing, TextStyles } from '@/theme';

const ZOOM_STEP = 0.5;

/** The zoom after a press of − or +, kept between 100% and 400%. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round((zoom + direction * ZOOM_STEP) * 2) / 2));
}

function ControlButton({
  icon, label, onPress, disabled, testID, children,
}: {
  icon?: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean; testID?: string;
  children?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.control, pressed && styles.controlPressed]}
      testID={testID}
    >
      {icon ? <Ionicons name={icon} size={20} color={disabled ? ReviewColors.tertiary : ReviewColors.text} /> : null}
      {children}
    </Pressable>
  );
}

/**
 * The bill beside the form, as on the web screen: the page's name, the page (pinch, drag, double-tap,
 * or the − / + / rotate buttons), page dots, and Open for the full-screen viewer. A PDF page is a tile
 * that opens the file.
 *
 * <p>Zoom and rotation belong to the page in view and start again on another page. The header's own
 * Hide / Show collapses the panel to that one row, so the form gets the room.
 */
export function InvoicePanel({
  pages, onOpen, onOpenPdf, onLinkProblem, failed, onRetry, collapsed = false, onToggle,
}: {
  pages: InvoicePage[];
  /** Only the header row shows; its chevron brings the page back. */
  collapsed?: boolean;
  onToggle?: () => void;
  onOpen: () => void;
  onOpenPdf: (page: InvoicePage) => void;
  /** An image failed or its link has expired: the screen fetches fresh links (once). */
  onLinkProblem: () => void;
  failed: boolean;
  onRetry: () => void;
}) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const list = useRef<FlatList<InvoicePage>>(null);
  const page = pages[Math.min(index, Math.max(0, pages.length - 1))];
  const isPdf = page?.contentType === 'application/pdf';

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  const goTo = useCallback((i: number) => {
    setIndex(i);
    setZoom(1);
    setRotation(0);
    list.current?.scrollToIndex?.({ index: i, animated: true });
  }, []);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
    if (i !== index) { setIndex(i); setZoom(1); setRotation(0); }
  };

  const name = page ? pageFileName(index, page.contentType) : 'Bill';

  return (
    <View style={styles.card} testID="invoice-panel">
      <View style={[styles.head, collapsed && styles.headCollapsed]}>
        <Ionicons name={isPdf ? 'document-text-outline' : 'image-outline'} size={18} color={ReviewColors.secondary} />
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        {pages.length > 1 ? <Text style={styles.count}>Page {index + 1} of {pages.length}</Text> : null}
        {onToggle ? (
          <Pressable
            onPress={onToggle}
            accessibilityRole="button"
            accessibilityLabel={collapsed ? 'Show invoice' : 'Hide invoice'}
            accessibilityState={{ expanded: !collapsed }}
            style={({ pressed }) => [styles.toggle, pressed && styles.controlPressed]}
            testID="toggle-invoice"
          >
            <Text style={styles.toggleText}>{collapsed ? 'Show' : 'Hide'}</Text>
            <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={18} color={ReviewColors.text} />
          </Pressable>
        ) : null}
      </View>
      {collapsed ? null : (
        <>
          <View style={styles.viewport} onLayout={onLayout} testID="panel-viewport">
            {failed ? (
              <View style={styles.failed}>
                <Text style={styles.failedText}>We could not load the bill photo.</Text>
                <MandiButton label="Try again" variant="secondary" size="md" fullWidth={false} onPress={onRetry} />
              </View>
            ) : width > 0 && pages.length > 0 ? (
              <FlatList
                ref={list}
                data={pages}
                horizontal
                pagingEnabled
                scrollEnabled={zoom <= 1}
                showsHorizontalScrollIndicator={false}
                keyExtractor={(p) => String(p.page)}
                onMomentumScrollEnd={onScrollEnd}
                initialNumToRender={1}
                windowSize={3}
                getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
                renderItem={({ item, index: i }) => (
                  <PanelPage
                    page={item}
                    width={width}
                    zoom={i === index ? zoom : 1}
                    rotation={i === index ? rotation : 0}
                    onZoomChange={setZoom}
                    onProblem={onLinkProblem}
                    onOpenPdf={onOpenPdf}
                    label={`Bill page ${item.page} of ${pages.length}`}
                  />
                )}
              />
            ) : null}
          </View>

          {pages.length > 1 ? (
            <View style={styles.dots}>
              {pages.map((p, i) => (
                <Pressable
                  key={p.page}
                  onPress={() => goTo(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`Show page ${i + 1} of ${pages.length}`}
                  accessibilityState={{ selected: i === index }}
                  style={styles.dotTap}
                  testID={`panel-dot-${i}`}
                >
                  <View style={[styles.dot, i === index && styles.dotOn]} />
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.controls}>
            <ControlButton icon="remove" label="Zoom out" onPress={() => setZoom((z) => stepZoom(z, -1))} disabled={isPdf || zoom <= MIN_SCALE} testID="zoom-out" />
            <Text style={styles.zoom} accessibilityLabel={`Zoom ${Math.round(zoom * 100)} percent`} testID="zoom-level">
              {Math.round(zoom * 100)}%
            </Text>
            <ControlButton icon="add" label="Zoom in" onPress={() => setZoom((z) => stepZoom(z, 1))} disabled={isPdf || zoom >= MAX_SCALE} testID="zoom-in" />
            <ControlButton icon="refresh" label="Rotate the page" onPress={() => setRotation((r) => (r + 90) % 360)} disabled={isPdf} testID="rotate" />
            <View style={styles.spacer} />
            <Pressable
              onPress={onOpen}
              accessibilityRole="button"
              accessibilityLabel="Open the bill full screen"
              style={({ pressed }) => [styles.open, pressed && styles.controlPressed]}
              testID="panel-open"
            >
              <Ionicons name="open-outline" size={18} color={ReviewColors.orange} />
              <Text style={styles.openText}>Open</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

function PanelPage({
  page, width, zoom, rotation, onZoomChange, onProblem, onOpenPdf, label,
}: {
  page: InvoicePage; width: number; zoom: number; rotation: number; onZoomChange: (z: number) => void;
  onProblem: () => void; onOpenPdf: (page: InvoicePage) => void; label: string;
}) {
  const isPdf = page.contentType === 'application/pdf';
  useEffect(() => {
    if (!isPdf && linkExpired(page.expiresAt, Date.now())) onProblem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.url]);
  if (isPdf) {
    return (
      <View style={[styles.page, { width }]}>
        <Pressable onPress={() => onOpenPdf(page)} accessibilityRole="button" accessibilityLabel={`PDF page ${page.page}, open`} style={styles.pdf} testID="panel-pdf">
          <Ionicons name="document-text-outline" size={36} color={ReviewColors.secondary} />
          <Text style={styles.pdfText}>PDF · Open</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={[styles.page, { width }]}>
      <ZoomableImage
        uri={page.url}
        width={width}
        height={ReviewLayout.panelImageHeight}
        label={label}
        onError={onProblem}
        zoom={zoom}
        rotation={rotation}
        onZoomChange={onZoomChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: ReviewColors.card,
    borderWidth: 1,
    borderColor: ReviewColors.cardBorder,
    borderRadius: ReviewLayout.cardRadius,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: ReviewLayout.tap,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ReviewColors.divider,
  },
  headCollapsed: { borderBottomWidth: 0 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: ReviewLayout.tap,
    paddingHorizontal: Spacing.sm,
    borderRadius: ReviewLayout.fieldRadius,
  },
  toggleText: { ...TextStyles.captionEmphasis, color: ReviewColors.text },
  name: { ...TextStyles.captionEmphasis, color: ReviewColors.text, flex: 1 },
  count: { ...TextStyles.caption, color: ReviewColors.secondary },
  viewport: { height: ReviewLayout.panelImageHeight, backgroundColor: ReviewColors.panelImage, overflow: 'hidden' },
  page: { height: ReviewLayout.panelImageHeight, justifyContent: 'center' },
  failed: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.lg },
  failedText: { ...TextStyles.body, color: ReviewColors.secondaryOnBand, textAlign: 'center' },
  pdf: { alignSelf: 'center', alignItems: 'center', gap: Spacing.sm, padding: Spacing.xxl, minHeight: ReviewLayout.tap },
  pdfText: { ...TextStyles.bodyEmphasis, color: ReviewColors.text },
  dots: { flexDirection: 'row', justifyContent: 'center' },
  dotTap: { width: ReviewLayout.tap, height: ReviewLayout.tap, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ReviewColors.panelDot },
  dotOn: { backgroundColor: ReviewColors.panelDotOn },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ReviewColors.divider,
  },
  control: { width: ReviewLayout.panelControl, height: ReviewLayout.panelControl, alignItems: 'center', justifyContent: 'center', borderRadius: ReviewLayout.fieldRadius },
  controlPressed: { backgroundColor: ReviewColors.band },
  zoom: { ...TextStyles.caption, fontVariant: ['tabular-nums'], color: ReviewColors.secondary, minWidth: 44, textAlign: 'center' },
  spacer: { flex: 1 },
  open: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: ReviewLayout.tap,
    paddingHorizontal: Spacing.md,
    borderRadius: ReviewLayout.fieldRadius,
  },
  openText: { ...TextStyles.captionEmphasis, color: ReviewColors.orangeText },
});
