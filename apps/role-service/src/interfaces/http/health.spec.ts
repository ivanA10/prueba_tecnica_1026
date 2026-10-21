import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './controllers';

describe('HealthController /ready', () => {
  it('is ready only when every dependency check passes', async () => {
    const ok = new HealthController(async () => ({ postgres: true, redis: true, rabbitmq: true }));
    await expect(ok.ready()).resolves.toEqual({ status: 'ready', checks: { postgres: true, redis: true, rabbitmq: true } });

    const down = new HealthController(async () => ({ postgres: false, redis: true, rabbitmq: true }));
    await expect(down.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(down.health()).toEqual({ status: 'ok' }); // liveness stays independent
  });
});
