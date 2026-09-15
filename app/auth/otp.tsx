import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { requestOtp } from '@/lib/api/auth';
import { ApiError, isApiError } from '@/lib/api/errors';
import { useSession } from '@/contexts/SessionProvider';
import { MandiButton, MandiFormField, MandiText } from '@/components/common';
import { Colors, Spacing } from '@/theme';

const RESEND_SECONDS = 60;

/**
 * REST-AUTH-03 — code entry. §23A.7.
 *
 * <p><b>Attempts are limited server-side and the message says so.</b> The backend
 * counts attempts in its own transaction precisely so the limit is real
 * (D-016's first bug), and a six-digit code with an unlimited retry budget is not
 * a credential. When it refuses, the user is told what happened rather than shown
 * a generic failure they will simply retry into.
 *
 * <p>The resend timer is local and cosmetic; the cooldown is the server's.
 */
export default function OtpScreen() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { signIn } = useSession();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  const masked = useMemo(
    () => (phone ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : ''),
    [phone],
  );

  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  async function submit() {
    if (!phone) return;
    setError(null);
    setSubmitting(true);
    try {
      await signIn(phone, code);
      // Where to land is the server's answer, not ours — the index route reads
      // the memberships /auth/me returned.
      router.replace('/');
    } catch (caught) {
      if (isApiError(caught) && caught.isThrottled) {
        setError(`Too many attempts. Try again in ${caught.retryAfterSeconds ?? 60} seconds.`);
      } else if (caught instanceof ApiError) {
        setError(caught.message);
      } else {
        setError('Could not reach Mandi. Check your connection.');
      }
      setCode('');
    } finally {
      setSubmitting(false);
    }
  }

  async function resend() {
    if (!phone || secondsLeft > 0) return;
    setError(null);
    try {
      await requestOtp(phone);
      setSecondsLeft(RESEND_SECONDS);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not send a new code.');
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <MandiText variant="title">Enter the code</MandiText>
          <MandiText variant="body" color={Colors.textSecondary}>
            Sent to {masked}.{' '}
            <MandiText variant="body" color={Colors.primary} onPress={() => router.back()}>
              Change
            </MandiText>
          </MandiText>
        </View>

        <View style={styles.form}>
          <MandiFormField
            label="Six-digit code"
            value={code}
            onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            keyboardType="number-pad"
            autoCapitalize="none"
            required
            error={error}
          />

          <MandiButton
            label="Verify"
            onPress={submit}
            size="lg"
            loading={submitting}
            disabled={code.length !== 6}
          />

          <Pressable onPress={resend} disabled={secondsLeft > 0} style={styles.resend}>
            <MandiText
              variant="body"
              color={secondsLeft > 0 ? Colors.textTertiary : Colors.primary}
            >
              {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Send a new code'}
            </MandiText>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
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
  form: { gap: Spacing.lg },
  resend: { alignSelf: 'center', paddingVertical: Spacing.sm },
});
