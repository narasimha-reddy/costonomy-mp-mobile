import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import {
  fetchRateSheet,
  updateRateSheet,
} from '@/services/supplier';
import type {
  RateSheetRow,
  UpdateRateSheetItem,
} from '@/models/catalog';
import {
  MandiButton,
  MandiCard,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSearchBar,
  MandiSkeletonList,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { formatMoney } from '@/utils/money';
import { Colors, Elevation, FontSize, IconSize, Radius, Spacing } from '@/theme';

const SCREEN = 'SUP-RATESHEET-01';

interface RowDraft {
  sellingPrice: string;
  mrp: string;
  availability: string;
  availableQuantity: string;
}

export default function MorningRateSheetScreen() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { storeId } = useStore();

  const [term, setTerm] = useState('');
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({});

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['supplier-rate-sheet', storeId],
    queryFn: () => fetchRateSheet(accessToken as string, storeId as number),
    enabled: storeId != null && accessToken != null,
  });

  const rows = data?.rows ?? [];

  const filteredRows = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.productName ?? ''} ${r.skuName} ${r.brandName ?? ''} ${r.grade ?? ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [rows, term]);

  const draftFor = (row: RateSheetRow): RowDraft => {
    return (
      drafts[row.skuId] ?? {
        sellingPrice: row.sellingPrice ?? '',
        mrp: row.mrp ?? '',
        availability: row.availability ?? 'AVAILABLE',
        availableQuantity: row.availableQuantity ?? '',
      }
    );
  };

  const updateDraft = (skuId: number, next: Partial<RowDraft>, row: RateSheetRow) => {
    const current = draftFor(row);
    setDrafts((prev) => ({
      ...prev,
      [skuId]: { ...current, ...next },
    }));
  };

  const modifiedSkuIds = useMemo(() => {
    return Object.keys(drafts).map(Number).filter((skuId) => {
      const original = rows.find((r) => r.skuId === skuId);
      if (!original) return false;
      const draft = drafts[skuId];
      if (!draft) return false;
      return (
        draft.sellingPrice !== (original.sellingPrice ?? '') ||
        draft.mrp !== (original.mrp ?? '') ||
        draft.availability !== original.availability ||
        draft.availableQuantity !== (original.availableQuantity ?? '')
      );
    });
  }, [drafts, rows]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: UpdateRateSheetItem[] = modifiedSkuIds.map((skuId) => {
        const d = drafts[skuId]!;
        return {
          skuId,
          sellingPrice: d.sellingPrice.trim() ? d.sellingPrice.trim() : null,
          mrp: d.mrp.trim() ? d.mrp.trim() : null,
          availability: d.availability,
          availableQuantity: d.availableQuantity.trim() ? d.availableQuantity.trim() : null,
        };
      });
      return updateRateSheet(accessToken as string, storeId as number, payload);
    },
    onSuccess: (res) => {
      toast.show(`Repriced ${res.updatedCount} items successfully!`, 'success');
      setDrafts({});
      queryClient.invalidateQueries({ queryKey: ['supplier-rate-sheet', storeId] });
      queryClient.invalidateQueries({ queryKey: ['store', storeId, 'skus'] });
    },
    onError: (err) => {
      toast.show(
        err instanceof ApiError ? err.message : 'Could not save morning rates.',
        'error',
      );
    },
  });

  return (
    <MandiScreen
      header={
        <MandiHeader
          title="Morning Rate Sheet"
          subtitle="60-Second Fast Repricing"
          back
        />
      }
      footer={
        modifiedSkuIds.length === 0 ? undefined : (
          <MandiStickyBar>
            <View style={styles.footerRow}>
              <View style={styles.modifiedCountBadge}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                <MandiText variant="bodyEmphasis">
                  {modifiedSkuIds.length} {modifiedSkuIds.length === 1 ? 'item' : 'items'} changed
                </MandiText>
              </View>
              <MandiButton
                label="Save Morning Rates"
                size="md"
                loading={saveMutation.isPending}
                onPress={() => saveMutation.mutate()}
              />
            </View>
          </MandiStickyBar>
        )
      }
    >
      <View style={styles.introCard}>
        <Ionicons name="flash-outline" size={24} color={Colors.primary} />
        <View style={styles.flex}>
          <MandiText variant="bodyEmphasis">Mandi Morning Reprice</MandiText>
          <MandiText variant="caption" color={Colors.textSecondary}>
            Update daily market prices in under a minute. New rates take effect immediately for incoming orders.
          </MandiText>
        </View>
      </View>

      <MandiSearchBar
        value={term}
        onChangeText={setTerm}
        placeholder="Filter by product, brand, or grade"
        style={styles.searchBar}
      />

      {isLoading ? (
        <MandiSkeletonList count={6} />
      ) : error ? (
        <MandiErrorState message="Could not load rate sheet." onRetry={() => refetch()} />
      ) : filteredRows.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MandiText variant="body" color={Colors.textSecondary}>
            {term ? `No products match "${term}"` : 'No active products in your catalog'}
          </MandiText>
        </View>
      ) : (
        <View style={styles.gridContainer}>
          {filteredRows.map((row) => {
            const draft = draftFor(row);
            const isModified = modifiedSkuIds.includes(row.skuId);
            const isOutOfStock = draft.availability === 'OUT_OF_STOCK';

            return (
              <View
                key={row.skuId}
                style={[
                  styles.rowCard,
                  isModified && styles.rowCardModified,
                  isOutOfStock && styles.rowCardOutOfStock,
                ]}
              >
                {/* Header: Name, Brand, Grade, Catch-weight tag */}
                <View style={styles.rowHeader}>
                  <View style={styles.flex}>
                    <MandiText variant="bodyEmphasis" numberOfLines={1}>
                      {row.productName ?? row.skuName}
                    </MandiText>
                    <View style={styles.tagsRow}>
                      {row.brandName ? (
                        <View style={styles.brandTag}>
                          <MandiText variant="caption" color={Colors.primary}>
                            {row.brandName}
                          </MandiText>
                        </View>
                      ) : null}
                      {row.grade ? (
                        <View style={styles.gradeTag}>
                          <MandiText variant="caption" color={Colors.textSecondary}>
                            {row.grade}
                          </MandiText>
                        </View>
                      ) : null}
                      {row.isCatchWeight ? (
                        <View style={styles.catchWeightTag}>
                          <MandiText variant="caption" color={Colors.warning}>
                            ⚖️ Catch-weight
                          </MandiText>
                        </View>
                      ) : null}
                      {row.requiresColdChain ? (
                        <View style={styles.coldChainTag}>
                          <MandiText variant="caption" color={Colors.info}>
                            ❄️ Cold Chain
                          </MandiText>
                        </View>
                      ) : null}
                      <MandiText variant="caption" color={Colors.textTertiary}>
                        Pack: {row.packSize} {row.packUnit}
                      </MandiText>
                    </View>
                  </View>

                  {/* Stock Toggle */}
                  <Pressable
                    style={[
                      styles.stockToggle,
                      isOutOfStock ? styles.stockToggleOff : styles.stockToggleOn,
                    ]}
                    onPress={() =>
                      updateDraft(
                        row.skuId,
                        {
                          availability: isOutOfStock ? 'AVAILABLE' : 'OUT_OF_STOCK',
                        },
                        row,
                      )
                    }
                  >
                    <Ionicons
                      name={isOutOfStock ? 'close-circle-outline' : 'checkmark-circle-outline'}
                      size={14}
                      color={isOutOfStock ? Colors.danger : Colors.success}
                    />
                    <MandiText
                      variant="caption"
                      color={isOutOfStock ? Colors.danger : Colors.success}
                    >
                      {isOutOfStock ? 'OOS' : 'In Stock'}
                    </MandiText>
                  </Pressable>
                </View>

                {/* Input Fields: Price & MRP */}
                <View style={styles.inputsRow}>
                  <View style={styles.inputWrapper}>
                    <MandiText variant="caption" color={Colors.textSecondary}>
                      Selling Price (₹)
                    </MandiText>
                    <View style={styles.priceInputBox}>
                      <MandiText variant="body" color={Colors.textSecondary}>
                        ₹
                      </MandiText>
                      <TextInput
                        value={draft.sellingPrice}
                        onChangeText={(txt) =>
                          updateDraft(row.skuId, { sellingPrice: txt }, row)
                        }
                        placeholder="0.00"
                        placeholderTextColor={Colors.textTertiary}
                        keyboardType="decimal-pad"
                        style={styles.priceInput}
                      />
                    </View>
                  </View>

                  <View style={styles.inputWrapper}>
                    <MandiText variant="caption" color={Colors.textSecondary}>
                      MRP (₹)
                    </MandiText>
                    <View style={styles.priceInputBox}>
                      <MandiText variant="body" color={Colors.textSecondary}>
                        ₹
                      </MandiText>
                      <TextInput
                        value={draft.mrp}
                        onChangeText={(txt) =>
                          updateDraft(row.skuId, { mrp: txt }, row)
                        }
                        placeholder="0.00"
                        placeholderTextColor={Colors.textTertiary}
                        keyboardType="decimal-pad"
                        style={styles.priceInput}
                      />
                    </View>
                  </View>

                  <View style={styles.inputWrapper}>
                    <MandiText variant="caption" color={Colors.textSecondary}>
                      Stock Qty
                    </MandiText>
                    <View style={styles.priceInputBox}>
                      <TextInput
                        value={draft.availableQuantity}
                        onChangeText={(txt) =>
                          updateDraft(row.skuId, { availableQuantity: txt }, row)
                        }
                        placeholder="Open"
                        placeholderTextColor={Colors.textTertiary}
                        keyboardType="decimal-pad"
                        style={styles.priceInput}
                      />
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  introCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
    ...Elevation.card,
  },
  searchBar: {
    marginBottom: Spacing.md,
  },
  emptyContainer: {
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridContainer: {
    gap: Spacing.sm,
    paddingBottom: Spacing.xxl,
  },
  rowCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Elevation.card,
  },
  rowCardModified: {
    borderColor: Colors.primary,
    backgroundColor: '#FAFAF5',
  },
  rowCardOutOfStock: {
    opacity: 0.65,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: 4,
  },
  brandTag: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  gradeTag: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  catchWeightTag: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  coldChainTag: {
    backgroundColor: Colors.coldChainLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  stockToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  stockToggleOn: {
    borderColor: Colors.success,
    backgroundColor: '#F0FDF4',
  },
  stockToggleOff: {
    borderColor: Colors.danger,
    backgroundColor: '#FEF2F2',
  },
  inputsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  inputWrapper: {
    flex: 1,
    gap: 4,
  },
  priceInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.surface,
    height: 38,
  },
  priceInput: {
    flex: 1,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: Spacing.md,
  },
  modifiedCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});
