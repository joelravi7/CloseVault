import { claimAuthRefresh } from '../auth-refresh';

async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await Promise.resolve(); }
function setup() {
  const client = { auth: { startAutoRefresh: jest.fn().mockResolvedValue(undefined), stopAutoRefresh: jest.fn().mockResolvedValue(undefined) } };
  const failure = jest.fn(); return { client, failure };
}
it('old queued cleanup cannot stop a remounted provider sharing the SDK client', async () => {
  const { client, failure } = setup();
  let finish!: () => void;
  client.auth.startAutoRefresh.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  const old = claimAuthRefresh(client, failure); old.setActive(true); await flush();
  old.release(); const next = claimAuthRefresh(client, failure); next.setActive(true);
  finish(); await flush();
  expect(client.auth.startAutoRefresh).toHaveBeenCalledTimes(2);
  expect(client.auth.stopAutoRefresh).not.toHaveBeenCalled();
  next.release(); await flush(); expect(client.auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
});
it('serializes foreground/background work and ignores calls after release', async () => {
  const { client, failure } = setup(); const lease = claimAuthRefresh(client, failure);
  lease.setActive(true); await flush(); lease.setActive(false); await flush();
  lease.setActive(true); await flush(); lease.release(); lease.setActive(true); await flush();
  expect(client.auth.startAutoRefresh).toHaveBeenCalledTimes(2);
  expect(client.auth.stopAutoRefresh).toHaveBeenCalledTimes(2); expect(failure).not.toHaveBeenCalled();
});
it('handles refresh rejection without notifying a superseded provider or rejecting cleanup', async () => {
  const { client, failure } = setup();
  let fail!: (error: Error) => void;
  client.auth.startAutoRefresh.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject; }));
  const old = claimAuthRefresh(client, failure); old.setActive(true); await flush();
  old.release(); const nextFailure = jest.fn(); const next = claimAuthRefresh(client, nextFailure);
  client.auth.startAutoRefresh.mockRejectedValueOnce(new Error('fictional refresh failure'));
  next.setActive(true); fail(new Error('fictional stale failure')); await flush();
  expect(failure).not.toHaveBeenCalled(); expect(nextFailure).toHaveBeenCalledTimes(1);
  client.auth.stopAutoRefresh.mockRejectedValueOnce(new Error('fictional cleanup failure'));
  next.release(); await flush(); expect(nextFailure).toHaveBeenCalledTimes(1);
});
