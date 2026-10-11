import { fireEvent, render } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import RootLayout from '../../app/_layout';
import IndexScreen from '../../app/index';
import { AuthScreen } from '../../features/auth/auth-screen';
import { useAuth } from '../auth-provider';
import { AuthController, type AuthState } from '../../domain/authentication';
import { DemoDataProvider } from '../demo-data-provider';

jest.mock('../auth-provider',()=>({useAuth:jest.fn(),AuthProvider:({children}:PropsWithChildren)=>children}));
jest.mock('../demo-data-provider',()=>({DemoDataProvider:jest.fn(({children}:PropsWithChildren)=>children)}));
jest.mock('../security-provider',()=>({SecurityProvider:({children}:PropsWithChildren)=>children}));
jest.mock('../../services/notifications',()=>({configureNotifications:jest.fn().mockResolvedValue(undefined)}));
jest.mock('expo-status-bar',()=>({StatusBar:()=>null}));
jest.mock('expo-router',()=>{
  const React=jest.requireActual<typeof import('react')>('react');const Native=jest.requireActual<typeof import('react-native')>('react-native');
  const Stack=({children}:PropsWithChildren)=>React.createElement(Native.View,null,children);
  Stack.Protected=function Protected({guard,children}:PropsWithChildren<{guard:boolean}>){return guard?children:null;};
  Stack.Screen=function Screen({name}:{name:string}){return React.createElement(Native.Text,null,`route:${name}`);};
  return {Stack,Redirect:({href}:{href:string})=>React.createElement(Native.Text,null,`redirect:${href}`),router:{replace:jest.fn(),push:jest.fn()}};
});
jest.mock('../../components/ui',()=>{
  const React=jest.requireActual<typeof import('react')>('react');const {View,Text,Pressable}=jest.requireActual<typeof import('react-native')>('react-native');
  const Container=({children}:PropsWithChildren)=>React.createElement(View,null,children);
  return {Screen:Container,Card:Container,PageHeader:({title}:{title:string})=>React.createElement(Text,null,title),textStyles:{},
    Button:({label,loading:_loading,variant:_variant,...props}:import('react-native').PressableProps&{label:string;loading?:boolean;variant?:string})=>React.createElement(Pressable,{...props,accessibilityRole:'button'},React.createElement(Text,null,label))};
});
function setAuth(state:AuthState,demo=false,controller:AuthController|null=null){jest.mocked(useAuth).mockReturnValue({state,demo,controller});}
describe('actual layout route guards (router mechanics mocked)',()=>{
  beforeEach(()=>{jest.clearAllMocks();});
  it.each(['initializing','signed_out','unauthorized','verification_unavailable','signing_out','password_recovery'] as const)('does not mount CRM/demo for %s',async(status)=>{
    const state:AuthState=status==='verification_unavailable'?{status,message:'Fixture unavailable'}:status==='password_recovery'?{status,userId:'fixture',expiresAt:60}:{status};
    setAuth(state);const view=await render(createElement(RootLayout));
    expect(view.queryByText('route:(tabs)')).toBeNull();expect(view.queryByText('route:lead/[id]')).toBeNull();expect(view.queryByText('route:workspace')).toBeNull();expect(DemoDataProvider).not.toHaveBeenCalled();
    expect(Boolean(view.queryByText('route:sign-in'))).toBe(status==='signed_out');
  });
  it('verified owner receives a non-demo workspace, never fictional CRM',async()=>{
    setAuth({status:'authenticated',userId:'fixture',expiresAt:60});const view=await render(createElement(RootLayout));
    expect(view.getByText('route:workspace')).toBeTruthy();expect(view.queryByText('route:(tabs)')).toBeNull();expect(DemoDataProvider).not.toHaveBeenCalled();
  });
  it('demo routes exist only for explicit demo mode',async()=>{
    setAuth({status:'initializing'},true);const view=await render(createElement(RootLayout));expect(view.getByText('route:(tabs)')).toBeTruthy();expect(view.queryByText('route:workspace')).toBeNull();expect(DemoDataProvider).toHaveBeenCalled();
  });
  it('sign-in then sign-out changes the mounted route set',async()=>{
    setAuth({status:'signed_out'});const view=await render(createElement(RootLayout));expect(view.getByText('route:sign-in')).toBeTruthy();
    setAuth({status:'authenticated',userId:'fixture',expiresAt:60});await view.rerender(createElement(RootLayout));expect(view.queryByText('route:sign-in')).toBeNull();expect(view.getByText('route:workspace')).toBeTruthy();
    setAuth({status:'signed_out'});await view.rerender(createElement(RootLayout));expect(view.queryByText('route:workspace')).toBeNull();expect(view.getByText('route:sign-in')).toBeTruthy();
  });
  it('index redirects according to verified state',async()=>{
    setAuth({status:'signed_out'});const view=await render(createElement(IndexScreen));expect(view.getByText('redirect:/sign-in')).toBeTruthy();
    setAuth({status:'unauthorized'});await view.rerender(createElement(IndexScreen));expect(view.getByText('redirect:/auth-status')).toBeTruthy();
  });
});
describe('authentication forms',()=>{
  beforeEach(()=>jest.clearAllMocks());
  it('clears submitted password even when login fails, without rendering diagnostics',async()=>{
    const signIn=jest.fn().mockRejectedValue(new Error('sensitive fixture diagnostics'));setAuth({status:'signed_out'},false,{signIn} as unknown as AuthController);
    const view=await render(createElement(AuthScreen,{kind:'sign-in'}));await fireEvent.changeText(view.getByLabelText('Email'),'fictional@example.invalid');await fireEvent.changeText(view.getByLabelText('Password'),'fictional password');
    await fireEvent.press(view.getByRole('button',{name:'Sign in'}));expect(signIn).toHaveBeenCalledWith('fictional@example.invalid','fictional password');expect(view.getByLabelText('Password').props.value).toBe('');expect(view.queryByText('sensitive fixture diagnostics')).toBeNull();
  });
  it('invalid recovery state never renders password update fields',async()=>{
    setAuth({status:'signed_out'});const view=await render(createElement(AuthScreen,{kind:'reset'}));expect(view.queryByLabelText('New password')).toBeNull();
  });
  it('recovery request remains disabled without owner-approved redirects',async()=>{
    const requestRecovery=jest.fn();setAuth({status:'signed_out'},false,{requestRecovery} as unknown as AuthController);const view=await render(createElement(AuthScreen,{kind:'recover'}));
    await fireEvent.changeText(view.getByLabelText('Email'),'fictional@example.invalid');await fireEvent.press(view.getByRole('button',{name:'Request recovery email'}));expect(requestRecovery).not.toHaveBeenCalled();
  });
});
