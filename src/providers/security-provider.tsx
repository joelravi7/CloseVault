import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { createContext, type PropsWithChildren, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';

type AutoLockMinutes = 0 | 1 | 5 | 15;
interface SecurityContextValue { biometricEnabled: boolean; autoLockMinutes: AutoLockMinutes; supported: boolean; setBiometricEnabled: (enabled: boolean) => Promise<boolean>; setAutoLockMinutes: (minutes: AutoLockMinutes) => Promise<void>; authenticate: () => Promise<boolean> }
const SecurityContext = createContext<SecurityContextValue | null>(null); const SETTINGS_KEY = 'closevault-security-settings';

export function SecurityProvider({ children }: PropsWithChildren) {
  const [biometricEnabled, setEnabled] = useState(false); const [autoLockMinutes, setMinutes] = useState<AutoLockMinutes>(5); const [locked, setLocked] = useState(false); const [supported, setSupported] = useState(false); const backgroundedAt = useRef<number | undefined>(undefined);
  useEffect(() => { if (Platform.OS === 'web') return; void Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync(), SecureStore.getItemAsync(SETTINGS_KEY)]).then(([hardware, enrolled, stored]) => { setSupported(hardware && enrolled); if (stored) { const parsed = JSON.parse(stored) as { biometricEnabled: boolean; autoLockMinutes: AutoLockMinutes }; setEnabled(parsed.biometricEnabled); setMinutes(parsed.autoLockMinutes); } }); }, []);
  useEffect(() => { const subscription = AppState.addEventListener('change', (state) => { if (state === 'background' || state === 'inactive') backgroundedAt.current = Date.now(); if (state === 'active' && biometricEnabled && backgroundedAt.current && Date.now() - backgroundedAt.current >= autoLockMinutes * 60_000) setLocked(true); }); return () => subscription.remove(); }, [autoLockMinutes, biometricEnabled]);
  const persist = async (enabled: boolean, minutes: AutoLockMinutes) => { if (Platform.OS !== 'web') await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify({ biometricEnabled: enabled, autoLockMinutes: minutes })); };
  const authenticate = async () => { if (Platform.OS === 'web') return false; const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock CloseVault', cancelLabel: 'Cancel', disableDeviceFallback: false }); if (result.success) setLocked(false); return result.success; };
  const setBiometricEnabled = async (enabled: boolean) => { if (enabled) { const available = await LocalAuthentication.hasHardwareAsync() && await LocalAuthentication.isEnrolledAsync(); setSupported(available); if (!available || !(await authenticate())) return false; } setEnabled(enabled); await persist(enabled, autoLockMinutes); return true; };
  const setAutoLockMinutes = async (minutes: AutoLockMinutes) => { setMinutes(minutes); await persist(biometricEnabled, minutes); };
  return <SecurityContext.Provider value={{ biometricEnabled, autoLockMinutes, supported, setBiometricEnabled, setAutoLockMinutes, authenticate }}>{children}<Modal visible={locked} animationType="fade" transparent={false}><View style={styles.lock}><Text style={styles.brand}>CLOSEVAULT</Text><Text style={styles.title}>Workspace locked</Text><Text style={styles.copy}>Authenticate with your device to return to private lead information.</Text><Button label="Unlock with biometrics" icon="finger-print-outline" onPress={() => void authenticate()} /></View></Modal></SecurityContext.Provider>;
}
export function useSecurity() { const value = useContext(SecurityContext); if (!value) throw new Error('useSecurity must be used within SecurityProvider'); return value; }
const styles = StyleSheet.create({ lock: { flex: 1, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.lg }, brand: { color: colors.gold, fontWeight: '900', letterSpacing: 3 }, title: { color: colors.surface, fontSize: 28, fontWeight: '900' }, copy: { color: '#B5C1CC', textAlign: 'center', maxWidth: 420, lineHeight: 22 } });
