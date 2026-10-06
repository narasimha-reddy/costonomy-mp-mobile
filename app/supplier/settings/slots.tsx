import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import {
  fetchDeliverySlots,
  createDeliverySlot,
  updateDeliverySlot,
  deleteDeliverySlot,
} from '@/services/delivery';
import type { DeliverySlot } from '@/models/delivery';
import {
  MandiBottomSheet,
  MandiButton,
  MandiCard,
  MandiEmptyState,
  MandiFormField,
  MandiHeader,
  MandiHeaderAction,
  MandiScreen,
  MandiSkeletonList,
  MandiStatusChip,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { Colors, Radius, Spacing } from '@/theme';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function SupplierSlotsScreen() {
  const { storeId: paramStoreId } = useLocalSearchParams<{ storeId?: string }>();
  const { supplier } = useStore();
  const storeId = paramStoreId ? Number(paramStoreId) : supplier?.stores?.[0]?.id;

  const { accessToken } = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<DeliverySlot | null>(null);

  // Form fields
  const [slotName, setSlotName] = useState('');
  const [startTime, setStartTime] = useState('06:00');
  const [endTime, setEndTime] = useState('10:00');
  const [cutoffTime, setCutoffTime] = useState('04:00');
  const [maxOrders, setMaxOrders] = useState('20');

  const slotsQuery = useQuery({
    queryKey: ['supplier-slots', storeId],
    queryFn: () => fetchDeliverySlots(accessToken as string, storeId as number),
    enabled: accessToken != null && storeId != null && Number.isFinite(storeId),
  });

  const createMutation = useMutation({
    mutationFn: (payload: {
      slotName: string;
      startTime: string;
      endTime: string;
      orderCutoffTime: string;
      maxOrdersPerDay: number;
    }) => createDeliverySlot(accessToken as string, storeId as number, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supplier-slots', storeId] });
      toast.show('Slot created successfully', 'success');
      closeModal();
    },
    onError: (err) => {
      toast.show(err instanceof ApiError ? err.message : 'Failed to create slot', 'error');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      slotId,
      payload,
    }: {
      slotId: number;
      payload: {
        slotName: string;
        startTime: string;
        endTime: string;
        orderCutoffTime: string;
        maxOrdersPerDay: number;
        active?: boolean;
      };
    }) => updateDeliverySlot(accessToken as string, storeId as number, slotId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supplier-slots', storeId] });
      toast.show('Slot updated', 'success');
      closeModal();
    },
    onError: (err) => {
      toast.show(err instanceof ApiError ? err.message : 'Failed to update slot', 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (slotId: number) =>
      deleteDeliverySlot(accessToken as string, storeId as number, slotId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supplier-slots', storeId] });
      toast.show('Slot deleted', 'success');
    },
    onError: (err) => {
      toast.show(err instanceof ApiError ? err.message : 'Failed to delete slot', 'error');
    },
  });

  function openCreateModal() {
    setEditingSlot(null);
    setSlotName('');
    setStartTime('06:00');
    setEndTime('10:00');
    setCutoffTime('04:00');
    setMaxOrders('20');
    setIsModalOpen(true);
  }

  function openEditModal(slot: DeliverySlot) {
    setEditingSlot(slot);
    setSlotName(slot.slotName);
    setStartTime(slot.startTime.substring(0, 5));
    setEndTime(slot.endTime.substring(0, 5));
    setCutoffTime(slot.orderCutoffTime.substring(0, 5));
    setMaxOrders(String(slot.maxOrdersPerDay));
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingSlot(null);
  }

  function handleSave() {
    if (!slotName.trim()) {
      toast.show('Please enter a slot name', 'error');
      return;
    }
    if (!TIME_REGEX.test(startTime.trim())) {
      toast.show('Start time must be HH:mm (e.g. 06:00)', 'error');
      return;
    }
    if (!TIME_REGEX.test(endTime.trim())) {
      toast.show('End time must be HH:mm (e.g. 10:00)', 'error');
      return;
    }
    if (!TIME_REGEX.test(cutoffTime.trim())) {
      toast.show('Cutoff time must be HH:mm (e.g. 04:00)', 'error');
      return;
    }
    const maxOrdersNum = Number(maxOrders.trim());
    if (!Number.isFinite(maxOrdersNum) || maxOrdersNum < 1) {
      toast.show('Max orders must be at least 1', 'error');
      return;
    }

    if (editingSlot) {
      updateMutation.mutate({
        slotId: editingSlot.id,
        payload: {
          slotName: slotName.trim(),
          startTime: startTime.trim(),
          endTime: endTime.trim(),
          orderCutoffTime: cutoffTime.trim(),
          maxOrdersPerDay: maxOrdersNum,
          active: editingSlot.active,
        },
      });
    } else {
      createMutation.mutate({
        slotName: slotName.trim(),
        startTime: startTime.trim(),
        endTime: endTime.trim(),
        orderCutoffTime: cutoffTime.trim(),
        maxOrdersPerDay: maxOrdersNum,
      });
    }
  }

  function handleToggleActive(slot: DeliverySlot) {
    updateMutation.mutate({
      slotId: slot.id,
      payload: {
        slotName: slot.slotName,
        startTime: slot.startTime.substring(0, 5),
        endTime: slot.endTime.substring(0, 5),
        orderCutoffTime: slot.orderCutoffTime.substring(0, 5),
        maxOrdersPerDay: slot.maxOrdersPerDay,
        active: !slot.active,
      },
    });
  }

  function handleDelete(slot: DeliverySlot) {
    Alert.alert(
      'Delete Delivery Slot',
      `Are you sure you want to delete "${slot.slotName}"? Restaurants won't be able to select it anymore.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(slot.id),
        },
      ],
    );
  }

  if (storeId == null) {
    return (
      <MandiScreen header={<MandiHeader title="Delivery Slots" back />}>
        <MandiEmptyState
          title="No store selected"
          description="Please select a store to manage delivery slots."
        />
      </MandiScreen>
    );
  }

  return (
    <MandiScreen
      header={
        <MandiHeader
          title="Delivery Slots"
          subtitle="Time windows & cutoffs"
          back
          right={
            <MandiHeaderAction
              icon="add-circle-outline"
              label="Add Slot"
              onPress={openCreateModal}
            />
          }
        />
      }
    >
      <View style={styles.introCard}>
        <Ionicons name="information-circle-outline" size={20} color={Colors.primary} />
        <MandiText variant="caption" color={Colors.textSecondary} style={styles.flex}>
          Delivery slots allow restaurants to schedule deliveries during predictable windows.
          When a slot reaches maximum capacity or the daily cutoff passes, new bookings close.
        </MandiText>
      </View>

      {slotsQuery.isLoading ? (
        <MandiSkeletonList count={3} />
      ) : slotsQuery.data && slotsQuery.data.length > 0 ? (
        <View style={styles.list}>
          {slotsQuery.data.map((slot) => (
            <MandiCard key={slot.id} style={styles.slotCard}>
              <View style={styles.slotHeader}>
                <View style={styles.flex}>
                  <View style={styles.titleRow}>
                    <MandiText variant="bodyEmphasis">{slot.slotName}</MandiText>
                    <MandiStatusChip
                      tone={slot.active ? 'success' : 'neutral'}
                      label={slot.active ? 'Active' : 'Paused'}
                    />
                  </View>
                  <MandiText variant="bodyEmphasis" color={Colors.primary} style={{ marginTop: 2 }}>
                    {slot.startTime.substring(0, 5)} - {slot.endTime.substring(0, 5)}
                  </MandiText>
                </View>
                <Switch
                  value={slot.active}
                  onValueChange={() => handleToggleActive(slot)}
                  trackColor={{ true: Colors.primary, false: Colors.borderStrong }}
                />
              </View>

              <View style={styles.detailsRow}>
                <View style={styles.detailItem}>
                  <Ionicons name="alarm-outline" size={14} color={Colors.textSecondary} />
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    Order Cutoff: {slot.orderCutoffTime.substring(0, 5)}
                  </MandiText>
                </View>
                <View style={styles.detailItem}>
                  <Ionicons name="cube-outline" size={14} color={Colors.textSecondary} />
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    Max {slot.maxOrdersPerDay} orders/day
                  </MandiText>
                </View>
              </View>

              <View style={styles.actionsRow}>
                <Pressable
                  style={styles.actionBtn}
                  onPress={() => openEditModal(slot)}
                  accessibilityRole="button"
                  accessibilityLabel="Edit slot"
                >
                  <Ionicons name="pencil-outline" size={16} color={Colors.primary} />
                  <MandiText variant="caption" color={Colors.primary}>
                    Edit
                  </MandiText>
                </Pressable>
                <Pressable
                  style={styles.actionBtn}
                  onPress={() => handleDelete(slot)}
                  accessibilityRole="button"
                  accessibilityLabel="Delete slot"
                >
                  <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                  <MandiText variant="caption" color={Colors.danger}>
                    Delete
                  </MandiText>
                </Pressable>
              </View>
            </MandiCard>
          ))}
        </View>
      ) : (
        <MandiEmptyState
          title="No Delivery Slots"
          description="Create your first slot to let buyers choose convenient delivery times."
          actionLabel="Create Delivery Slot"
          onAction={openCreateModal}
        />
      )}

      {/* Add / Edit Sheet */}
      <MandiBottomSheet
        visible={isModalOpen}
        onClose={closeModal}
        title={editingSlot ? 'Edit Delivery Slot' : 'New Delivery Slot'}
        closeLabel="Cancel"
        // The form has text boxes: lift the sheet above the keyboard instead of leaving them under it.
        avoidKeyboard
      >
        <View style={styles.form}>
          <MandiFormField
            label="Slot Name"
            placeholder="e.g. Morning Slot, Afternoon Window"
            value={slotName}
            onChangeText={setSlotName}
            required
          />

          <View style={styles.pair}>
            <MandiFormField
              label="Start Time (HH:mm)"
              placeholder="06:00"
              value={startTime}
              onChangeText={setStartTime}
              style={styles.flex}
              required
            />
            <MandiFormField
              label="End Time (HH:mm)"
              placeholder="10:00"
              value={endTime}
              onChangeText={setEndTime}
              style={styles.flex}
              required
            />
          </View>

          <View style={styles.pair}>
            <MandiFormField
              label="Order Cutoff (HH:mm)"
              placeholder="04:00"
              value={cutoffTime}
              onChangeText={setCutoffTime}
              hint="Cutoff for same-day delivery"
              style={styles.flex}
              required
            />
            <MandiFormField
              label="Daily Capacity"
              placeholder="20"
              value={maxOrders}
              onChangeText={(text) => setMaxOrders(text.replace(/[^\d]/g, ''))}
              keyboardType="number-pad"
              hint="Max orders per day"
              style={styles.flex}
              required
            />
          </View>

          <View style={styles.buttonRow}>
            <MandiButton
              label={editingSlot ? 'Save Changes' : 'Create Slot'}
              onPress={handleSave}
              loading={createMutation.isPending || updateMutation.isPending}
              size="lg"
            />
          </View>
        </View>
      </MandiBottomSheet>
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  introCard: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceSunken,
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  list: {
    gap: Spacing.md,
  },
  slotCard: {
    gap: Spacing.sm,
  },
  slotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  detailsRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
    paddingTop: Spacing.sm,
    marginTop: Spacing.xs,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  form: {
    gap: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  pair: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  buttonRow: {
    marginTop: Spacing.sm,
  },
});
