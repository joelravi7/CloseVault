import { createSecureSessionStorage, createWebSessionStorage, type SecureStorageDriver } from '../auth-storage';
function setup() {
  const data = new Map<string,string>();
  const driver = { available: jest.fn().mockResolvedValue(true), get: jest.fn(async (key:string)=>data.get(key)??null),
    set: jest.fn(async (key:string,value:string)=>{data.set(key,value);}), remove: jest.fn(async (key:string)=>{data.delete(key);}) } satisfies SecureStorageDriver;
  return { data, driver, storage: createSecureSessionStorage(driver) };
}
describe('native secure session storage',()=>{
  it('restores missing storage as null',async()=>{const {storage}=setup();expect(await storage.getItem('session')).toBeNull();});
  it('roundtrips large Unicode payloads using only small secure chunks',async()=>{
    const {driver,storage}=setup();const value='fictional😀'.repeat(700);await storage.setItem('session',value);
    expect(await storage.getItem('session')).toBe(value);for(const [,chunk]of driver.set.mock.calls)expect(unescape(encodeURIComponent(chunk)).length).toBeLessThan(2048);
    await storage.removeItem('session');expect(await storage.getItem('session')).toBeNull();
  });
  it('never falls back when secure storage is unavailable',async()=>{const {driver,storage}=setup();driver.available.mockResolvedValue(false);await expect(storage.setItem('session','fixture')).rejects.toThrow();expect(driver.set).not.toHaveBeenCalled();expect(()=>storage.assertHealthy()).toThrow();});
  it('rejects corrupt manifests',async()=>{const {data,storage}=setup();data.set('session','invalid');await expect(storage.getItem('session')).rejects.toThrow();});
  it('rejects missing secure chunks',async()=>{const {data,storage}=setup();data.set('session',JSON.stringify({generation:'fixture',count:1}));await expect(storage.getItem('session')).rejects.toThrow();});
  it('failed writes invalidate restoration of an older session',async()=>{const {driver,storage}=setup();await storage.setItem('session','old fixture');driver.set.mockRejectedValueOnce(new Error('fixture write failure'));await expect(storage.setItem('session','new fixture')).rejects.toThrow();expect(await storage.getItem('session')).toBeNull();expect(()=>storage.assertHealthy()).toThrow();});
  it('read errors and failed removals remain explicit failures',async()=>{const {driver,storage}=setup();driver.get.mockRejectedValueOnce(new Error('fixture read failure'));await expect(storage.getItem('session')).rejects.toThrow();driver.remove.mockRejectedValueOnce(new Error('fixture remove failure'));await expect(storage.removeItem('session')).rejects.toThrow();});
});
describe('web session-scoped adapter',()=>{
  it('uses only the supplied session storage',async()=>{const data=new Map<string,string>();const browser={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}} as Storage;const storage=createWebSessionStorage(()=>browser);await storage.setItem('session','fixture');expect(await storage.getItem('session')).toBe('fixture');await storage.removeItem('session');expect(await storage.getItem('session')).toBeNull();});
  it('fails closed when browser storage is blocked',async()=>{const storage=createWebSessionStorage(()=>{throw new Error('fixture blocked');});await expect(storage.getItem('session')).rejects.toThrow();expect(()=>storage.assertHealthy()).toThrow();});
});
