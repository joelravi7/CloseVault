import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createAuthGateway } from '../auth-gateway';
import type { Database } from '../database.types';
import type { SessionStorageAdapter } from '../auth-storage';

jest.mock('expo-secure-store', () => ({}));
const session = { user: { id: '00000000-0000-4000-8000-000000000001' }, expires_at: 2_000_000_000 } as Session;
function setup() {
  const values = new Map<string,string>();
  const storage = { getItem: jest.fn(async(key:string)=>values.get(key)??null), setItem: jest.fn(async(key:string,value:string)=>{ values.set(key,value); }),
    removeItem: jest.fn(async(key:string)=>{ values.delete(key); }), assertHealthy: jest.fn() } satisfies SessionStorageAdapter;
  const callbacks = new Set<(event:string, value:Session|null)=>void>();
  const auth = {
    getSession: jest.fn().mockResolvedValue({data:{session},error:null}),
    getUser: jest.fn().mockResolvedValue({data:{user:session.user},error:null}),
    signInWithPassword: jest.fn().mockResolvedValue({data:{session},error:null}),
    signOut: jest.fn().mockResolvedValue({error:null}),
    resetPasswordForEmail: jest.fn().mockResolvedValue({error:null}),
    updateUser: jest.fn().mockResolvedValue({error:null}),
    exchangeCodeForSession: jest.fn(async()=>{for(const callback of callbacks)callback('PASSWORD_RECOVERY',session);return {data:{session},error:null};}),
    onAuthStateChange: jest.fn((callback:(event:string,value:Session|null)=>void)=>{ callbacks.add(callback); return {data:{subscription:{unsubscribe:()=>callbacks.delete(callback)}}}; }),
  };
  const rpc = jest.fn().mockResolvedValue({data:true,error:null});
  const client = {auth,rpc} as unknown as SupabaseClient<Database>;
  return {auth,rpc,storage,values,callbacks,gateway:createAuthGateway(client,storage,'https://fixture.invalid/reset-password')};
}
describe('Supabase gateway with mocked APIs only',()=>{
  it('restoration returns token-free identity; server identity is checked before owner RPC',async()=>{
    const {gateway,auth,rpc}=setup(); const restored=await gateway.restore();
    expect(restored).toEqual({userId:session.user.id,expiresAt:session.expires_at});
    expect(await gateway.verifyOwner(restored!)).toBe(true);
    expect(auth.getUser.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0]); expect(rpc).toHaveBeenCalledWith('cv_owner_status');
  });
  it('cached identity cannot authorize a mismatched server user',async()=>{
    const {gateway,auth,rpc}=setup();auth.getUser.mockResolvedValue({data:{user:{id:'different fictional identity'}},error:null});
    await expect(gateway.verifyOwner({userId:session.user.id,expiresAt:session.expires_at!})).rejects.toThrow();expect(rpc).not.toHaveBeenCalled();
  });
  it('owner denial differs from unavailable RPC',async()=>{
    const {gateway,rpc}=setup();const identity={userId:session.user.id,expiresAt:session.expires_at!};
    rpc.mockResolvedValueOnce({data:false,error:null});expect(await gateway.verifyOwner(identity)).toBe(false);
    rpc.mockResolvedValueOnce({data:null,error:{status:503}});await expect(gateway.verifyOwner(identity)).rejects.toMatchObject({kind:'unavailable'});
  });
  it('checks sticky secure-storage failure after SDK operations',async()=>{
    const {gateway,storage}=setup();storage.assertHealthy.mockImplementationOnce(()=>{}).mockImplementationOnce(()=>{throw new Error('fixture storage error');});
    await expect(gateway.restore()).rejects.toThrow();
  });
  it('failed logout persists access denial and removes locally stored tokens',async()=>{
    const {gateway,auth,storage,values}=setup();values.set('closevault.auth.session','fictional session');auth.signOut.mockResolvedValue({error:{status:503}});
    await expect(gateway.signOut()).rejects.toThrow();expect(values.get('closevault.auth.logout-pending')).toBe('pending');expect(values.has('closevault.auth.session')).toBe(false);
    expect(storage.setItem.mock.invocationCallOrder[0]).toBeLessThan(auth.signOut.mock.invocationCallOrder[0]);
    expect(await gateway.restore()).toBeNull();expect(auth.getSession).not.toHaveBeenCalled();
  });
  it('attempts local session removal even when the logout marker cannot be written',async()=>{
    const {gateway,auth,storage,values}=setup();values.set('closevault.auth.session','fictional session');storage.setItem.mockRejectedValueOnce(new Error('fixture storage write failure'));
    await expect(gateway.signOut()).rejects.toThrow();expect(values.has('closevault.auth.session')).toBe(false);expect(auth.signOut).not.toHaveBeenCalled();
  });
  it('successful explicit sign-in clears logout denial',async()=>{
    const {gateway,values,auth}=setup();values.set('closevault.auth.logout-pending','pending');await gateway.signIn('fictional@example.invalid','fictional password');
    expect(values.has('closevault.auth.logout-pending')).toBe(false);expect(auth.signInWithPassword).toHaveBeenCalledWith({email:'fictional@example.invalid',password:'fictional password'});
  });
  it('distinguishes invalid login credentials from unavailable login service',async()=>{
    const {gateway,auth}=setup();auth.signInWithPassword.mockResolvedValueOnce({data:{session:null},error:{code:'invalid_credentials',status:400}});
    await expect(gateway.signIn('fictional@example.invalid','fictional')).rejects.toMatchObject({kind:'invalid_session'});
    auth.signInWithPassword.mockResolvedValueOnce({data:{session:null},error:{status:503}});
    await expect(gateway.signIn('fictional@example.invalid','fictional')).rejects.toMatchObject({kind:'unavailable'});
  });
  it('malformed callback never exchanges a code',async()=>{
    const {gateway,auth}=setup();await expect(gateway.consumeRecovery('https://other.invalid/reset-password?code=fixture')).rejects.toThrow();expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it('requires the installed SDK recovery event and removes the temporary subscription',async()=>{
    const {gateway,callbacks}=setup();expect(await gateway.consumeRecovery('https://fixture.invalid/reset-password?code=fixture')).toMatchObject({userId:session.user.id});expect(callbacks.size).toBe(0);
  });
  it('a generic sign-in code cannot become a recovery session',async()=>{
    const {gateway,auth,values}=setup();auth.exchangeCodeForSession.mockImplementation(async()=>({data:{session},error:null}));
    await expect(gateway.consumeRecovery('https://fixture.invalid/reset-password?code=fixture')).rejects.toThrow();expect(values.get('closevault.auth.logout-pending')).toBe('pending');
  });
  it('expired or reused code errors never yield a recovery identity',async()=>{
    const {gateway,auth,callbacks}=setup();auth.exchangeCodeForSession.mockRejectedValue(new Error('fixture expired'));await expect(gateway.consumeRecovery('https://fixture.invalid/reset-password?code=fixture')).rejects.toThrow();expect(callbacks.size).toBe(0);
  });
  it('recovery request supplies only the explicitly injected redirect',async()=>{
    const {gateway,auth}=setup();await gateway.requestRecovery('fictional@example.invalid');expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('fictional@example.invalid',{redirectTo:'https://fixture.invalid/reset-password'});
  });
});
