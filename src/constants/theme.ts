import { Platform } from 'react-native';

export const colors = {
  navy: '#0B1F33',
  navySoft: '#18344F',
  gold: '#C7A34B',
  goldSoft: '#F4EBD3',
  background: '#F6F7F9',
  surface: '#FFFFFF',
  text: '#17212B',
  textMuted: '#667085',
  border: '#E3E7EC',
  success: '#16845B',
  successSoft: '#E8F5EF',
  warning: '#D58A00',
  warningSoft: '#FFF5DB',
  danger: '#C43D4B',
  dangerSoft: '#FCEBED',
  info: '#3977A8',
  infoSoft: '#EAF2F8',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radii = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const shadow = Platform.select({
  web: { boxShadow: '0 8px 24px rgba(11,31,51,0.07)' },
  default: { shadowColor: '#0B1F33', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
});
export const maxContentWidth = 1280;
