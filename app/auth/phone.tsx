import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { requestOtp } from '@/services/auth';
import { ApiError, isApiError } from '@/lib/api/errors';
import { MandiButton, MandiFormField, MandiText } from '@/components/common';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * REST-AUTH-02 — phone entry. §23A.6, doc 05 §4.
 *
 * <p>Ten digits, because the backend normalises to +91 and asking a restaurant
 * owner to type a country code is a way to lose them on the first screen.
 *
 * <p><b>Local validation saves a round trip; it never decides.</b> The server's
 * message is what gets shown on failure (§23A.8) — including a 429, where it
 * says how long to wait rather than leaving the user to tap again into a wall.
 */
export default function PhoneScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const digits = phone.replace(/\D/g, '');
  const plausible = digits.length === 10;

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await requestOtp(digits);
      router.push({ pathname: '/auth/otp', params: { phone: digits } });
    } catch (caught) {
      if (isApiError(caught) && caught.isThrottled) {
        const seconds = caught.retryAfterSeconds ?? 60;
        setError(`Too many attempts. Try again in ${formatWait(seconds)}.`);
      } else if (caught instanceof ApiError) {
        setError(caught.message);
      } else {
        setError('Could not reach Mandi. Check your connection.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.mark}>
            <Ionicons name="leaf" size={22} color={Colors.primary} />
          </View>
          <MandiText variant="display">What&rsquo;s your number?</MandiText>
          <MandiText variant="bodyRelaxed" color={Colors.textSecondary} style={styles.tagline}>
            We use it to sign you in, and suppliers use it to reach you about an order.
            No password to remember.
          </MandiText>
        </View>

        <View style={styles.form}>
          <View style={styles.inputRow}>
            <View style={styles.dialCode}>
              <MandiText variant="bodyEmphasis" color={Colors.textSecondary}>+91</MandiText>
            </View>
            <MandiFormField
              label="Mobile number"
              value={phone}
              onChangeText={(text) => setPhone(text.replace(/\D/g, '').slice(0, 10))}
              placeholder="98765 43210"
              keyboardType="phone-pad"
              autoCapitalize="none"
              required
              error={error}
              hint="We'll text you a six-digit code."
              style={styles.flex}
            />
          </View>

          <MandiButton
            label="Send code"
            onPress={submit}
            size="lg"
            loading={submitting}
            disabled={!plausible}
          />

          <MandiText variant="caption" color={Colors.textTertiary} center>
            By continuing you agree to Mandi&rsquo;s terms and privacy policy.
          </MandiText>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** "90 seconds" reads better than "1.5 minutes" at the lengths involved here. */
function formatWait(seconds: number): string {
  if (seconds < 120) return `${seconds} seconds`;
  return `${Math.ceil(seconds / 60)} minutes`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.xxl,
  },
  header: { gap: Spacing.sm },
  mark: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
    marginBottom: Spacing.sm,
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  dialCode: {
    height: 48,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  tagline: { maxWidth: 320 },
  form: { gap: Spacing.lg },
});
