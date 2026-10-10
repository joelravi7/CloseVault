import { act, fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { createConfiguredAuth } from '../../data/supabase/auth-gateway';
import type { AuthGateway } from '../../domain/authentication';
import { AuthProvider, useAuth } from '../auth-provider';

jest.mock('../../data/supabase/auth-gateway',()=>({createConfiguredAuth:jest.fn()}));
jest.mock('expo-linking',()=>({getInitialURL:jest.fn().mockResolvedValue(null),addEventListener:jest.fn(()=>({remove:jest.fn()}))}));
const originalLabel=process.env.EXPO_PUBLIC_APP_ENV;
function Probe(){const {state,demo,controller}=useAuth();return createElement(View,null,
  createElement(Text,null,`${demo?'demo:':''}${state.status}`),
  createElement(Pressable,{accessibilityRole:'button',accessibilityLabel:'Logout',onPress:()=>{void controller?.signOut();}},createElement(Text,null,'Logout')));}
function setup(){
  const unsubscribe=jest.fn();
  const gateway={restore:jest.fn().mockResolvedValue({userId:'00000000-0000-4000-8000-000000000001',expiresAt:Math.floor(Date.now()/1000)+3600}),verifyOwner:jest.fn().mockResolvedValue(true),
    signIn:jest.fn(),signOut:jest.fn().mockResolvedValue(undefined),requestRecovery:jest.fn(),consumeRecovery:jest.fn(),updatePassword:jest.fn(),subscribe:jest.fn(()=>unsubscribe)} satisfies AuthGateway;
  const client={auth:{startAutoRefresh:jest.fn(),stopAutoRefresh:jest.fn()}};
  jest.mocked(createConfiguredAuth).mockReturnValue({gateway,client} as unknown as ReturnType<typeof createConfiguredAuth>);
  const query=new QueryClient();
  const element=createElement(QueryClientProvider,{client:query},createElement(AuthProvider,null,createElement(Probe)));
  return {gateway,client,query,element,unsubscribe};
}
describe('real AuthProvider with injected mocked gateway',()=>{
  beforeEach(()=>{jest.clearAllMocks();process.env.EXPO_PUBLIC_APP_ENV='development';jest.mocked(Linking.getInitialURL).mockResolvedValue(null);jest.mocked(Linking.addEventListener).mockImplementation(()=>({remove:jest.fn()} as unknown as ReturnType<typeof Linking.addEventListener>));});
  afterEach(()=>{if(originalLabel===undefined)delete process.env.EXPO_PUBLIC_APP_ENV;else process.env.EXPO_PUBLIC_APP_ENV=originalLabel;});
  it('missing configuration blocks access without a demo fallback',async()=>{
    const {element}=setup();jest.mocked(createConfiguredAuth).mockImplementation(()=>{throw new Error('fixture missing config');});
    const view=await render(element);expect(view.getByText('verification_unavailable')).toBeTruthy();expect(view.queryByText('demo:initializing')).toBeNull();
  });
  it('waits for owner verification and unsubscribes/stops refresh on unmount',async()=>{
    const {element,gateway,client,unsubscribe}=setup();let finish:((value:boolean)=>void)|undefined;
    gateway.verifyOwner.mockImplementation(()=>new Promise<boolean>((resolve)=>{finish=resolve;}));const view=await render(element);expect(view.getByText('initializing')).toBeTruthy();
    await act(async()=>{finish?.(true);});expect(view.getByText('authenticated')).toBeTruthy();await view.unmount();expect(unsubscribe).toHaveBeenCalled();expect(client.auth.stopAutoRefresh).toHaveBeenCalled();
  });
  it('clears private cache immediately while logout is pending',async()=>{
    const {element,gateway,query}=setup();const view=await render(element);expect(view.getByText('authenticated')).toBeTruthy();query.setQueryData(['private'],{label:'fictional'});
    let finish:(()=>void)|undefined;gateway.signOut.mockImplementation(()=>new Promise<void>((resolve)=>{finish=resolve;}));
    await fireEvent.press(view.getByRole('button',{name:'Logout'}));expect(view.getByText('signing_out')).toBeTruthy();expect(query.getQueryData(['private'])).toBeUndefined();
    await act(async()=>{finish?.();});expect(view.getByText('signed_out')).toBeTruthy();
  });
  it('partial initialization failure disposes subscriptions and leaves access closed',async()=>{
    const {element,client,unsubscribe}=setup();jest.mocked(Linking.addEventListener).mockImplementation(()=>{throw new Error('fixture linking setup failed');});
    const view=await render(element);expect(view.getByText('verification_unavailable')).toBeTruthy();expect(unsubscribe).toHaveBeenCalled();expect(client.auth.stopAutoRefresh).toHaveBeenCalled();expect(view.queryByText('authenticated')).toBeNull();
  });
  it('explicit development demo never constructs an Auth client',async()=>{
    const {element}=setup();process.env.EXPO_PUBLIC_APP_ENV='demo';const view=await render(element);expect(view.getByText('demo:initializing')).toBeTruthy();expect(createConfiguredAuth).not.toHaveBeenCalled();
  });
  it('handles rejected SDK refresh promises and blocks access',async()=>{
    const {element,client}=setup();client.auth.startAutoRefresh.mockRejectedValue(new Error('fixture refresh failure'));
    const view=await render(element);expect(view.getByText('verification_unavailable')).toBeTruthy();expect(view.queryByText('authenticated')).toBeNull();
  });
});
