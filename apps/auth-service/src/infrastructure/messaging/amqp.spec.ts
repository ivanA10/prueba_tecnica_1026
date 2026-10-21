import { AmqpBroker } from './amqp';

describe('AmqpBroker consumer republish', () => {
  const log = { info: jest.fn(), warn: jest.fn() };
  const msg = { content: Buffer.from('{}'), properties: { headers: {} } };
  const run = (broker: AmqpBroker, ch: unknown) =>
    (broker as unknown as { onMessage(c: unknown, m: unknown): Promise<void> }).onMessage(ch, msg);

  it('nacks with requeue when the retry confirm fails; acks only after the confirm succeeds', async () => {
    const broker = new AmqpBroker('amqp://x', log);
    broker.setProcessor({ process: jest.fn().mockResolvedValue({ kind: 'retry', retryCount: 1, delayMs: 100 }) } as never);
    const ch = { sendToQueue: jest.fn(), ack: jest.fn(), nack: jest.fn() };

    ch.sendToQueue.mockImplementationOnce((_q, _c, _o, cb: (e: unknown) => void) => cb(new Error('nack')));
    await run(broker, ch);
    expect(ch.ack).not.toHaveBeenCalled();
    expect(ch.nack).toHaveBeenCalledWith(msg, false, true);

    const order: string[] = [];
    ch.sendToQueue.mockImplementationOnce((_q, _c, _o, cb: (e: unknown) => void) => {
      setImmediate(() => {
        order.push('confirm');
        cb(null);
      });
    });
    ch.ack.mockImplementationOnce(() => void order.push('ack'));
    await run(broker, ch);
    expect(order).toEqual(['confirm', 'ack']);
    expect(ch.sendToQueue.mock.calls[1][0]).toBe('auth.user-projection.retry');
  });
});
