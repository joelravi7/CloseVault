import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, PageHeader, Screen, textStyles } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { approvedRecoveryRedirect } from '@/data/supabase/auth-config';
import { authDestination } from '@/domain/authentication';
import { useAuth } from '@/providers/auth-provider';

export function AuthScreen({ kind }: { kind: 'sign-in' | 'recover' | 'reset' | 'status' | 'workspace' }) {
  const { state, controller } = useAuth();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (kind === 'sign-in' && state.status !== 'signed_out') router.replace(authDestination(state)); }, [kind, state]);
  const run = async (action: () => Promise<void>, success?: string) => {
    if (busy) return; setBusy(true); setMessage('');
    // Clear password immediately, including on errors; never retain it in context.
    setPassword(''); setConfirmation('');
    try { await action(); if (success) setMessage(success); }
    catch { setMessage('The request could not be completed. Check your input or try again safely.'); }
    finally { setBusy(false); }
  };
  const field = (label: string, value: string, change: (value: string) => void, secret = false) =>
    <TextInput accessibilityLabel={label} placeholder={label} value={value} onChangeText={change}
      autoCapitalize="none" autoCorrect={false} secureTextEntry={secret} editable={!busy}
      keyboardType={secret ? 'default' : 'email-address'} autoComplete={secret ? 'off' : 'email'} style={styles.input} />;
  return <Screen><PageHeader eyebrow="Private owner workspace" title={kind === 'workspace' ? 'Authentication verified' : kind === 'recover' ? 'Password recovery' : kind === 'reset' ? 'Reset password' : kind === 'sign-in' ? 'Sign in' : 'Authentication status'} />
    <Card><View style={styles.form}>
      {kind === 'sign-in' ? <>{field('Email', email, setEmail)}{field('Password', password, setPassword, true)}
        <Button label="Sign in" disabled={busy || !controller || !email.trim() || !password} loading={busy}
          onPress={() => { const secret = password; void run(() => controller!.signIn(email, secret)); }} />
        <Button label="Forgot password" variant="ghost" onPress={() => router.push('/recover-password')} /></> : null}
      {kind === 'recover' ? <>{field('Email', email, setEmail)}
        <Text style={textStyles.muted}>Recovery redirects must be approved and configured before email recovery is enabled.</Text>
        <Button label="Request recovery email" disabled={busy || !controller || !approvedRecoveryRedirect || !email.trim()}
          onPress={() => void run(() => controller!.requestRecovery(email), 'If this address is eligible, recovery instructions will be sent.')} />
        <Button label="Back to sign in" variant="ghost" onPress={() => router.replace('/sign-in')} /></> : null}
      {kind === 'reset' ? state.status === 'password_recovery' ? <>{field('New password', password, setPassword, true)}{field('Confirm password', confirmation, setConfirmation, true)}
        <Text style={textStyles.muted}>Use at least 12 characters. A verified owner recovery session is required.</Text>
        <Button label="Update password" disabled={busy || !controller || password.length < 12 || password !== confirmation}
          onPress={() => { const secret = password; void run(() => controller!.updatePassword(secret)); }} /></> :
        <Text style={textStyles.body}>A verified recovery link is required. Invalid, expired or reused links do not grant access.</Text> : null}
      {kind === 'workspace' ? <Text style={textStyles.body}>Owner authentication is verified. CRM persistence is not connected yet. Fictional demo records are not loaded in this mode.</Text> : null}
      {kind === 'status' ? <><Text accessibilityRole="alert" style={textStyles.body}>{state.status === 'verification_unavailable' ? state.message : state.status === 'unauthorized' ? 'This authenticated account is not the approved owner.' : state.status === 'signing_out' ? 'Signing out. Private content is hidden.' : 'Restoring and verifying the session. Private content is hidden.'}</Text>
        {state.status === 'verification_unavailable' ? <Button label="Retry verification" disabled={busy || !controller} onPress={() => void run(() => controller!.restore())} /> : null}</> : null}
      {(kind === 'workspace' || kind === 'status' || (kind === 'reset' && state.status === 'password_recovery')) && controller ?
        <Button label="Sign out" disabled={busy || state.status === 'signing_out'} variant="secondary" onPress={() => void run(() => controller.signOut())} /> : null}
      {message ? <Text accessibilityRole="alert" style={textStyles.body}>{message}</Text> : null}
    </View></Card></Screen>;
}
const styles = StyleSheet.create({ form: { gap: spacing.lg }, input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, padding: spacing.md, minHeight: 48, color: colors.text, backgroundColor: colors.surface } });
