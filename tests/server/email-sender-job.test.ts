process.env.NODE_ENV = 'test';

import { ServiceRegistry } from '../../server/src/services/service.registry';
import { InMemoryEmailTransport } from '../../server/src/services/email.service';

const services = ServiceRegistry.create('UI');
const prisma = services.prisma;

beforeEach(async () => {
  await services.clearAll();
  const transport = services.email.getTransport();
  if (transport instanceof InMemoryEmailTransport) {
    transport.reset();
  }
});

describe('email-sender scheduled job', () => {
  it('processes pending queue entries', async () => {
    // Enqueue an email
    await services.emailQueue.enqueue({
      to: 'job-test@example.com',
      subject: 'Job Test',
      text: 'Body',
    });

    // Simulate what the email-sender handler does
    const transport = services.email.getTransport();
    const sent = await services.emailQueue.processPending(transport, 20);

    expect(sent).toBe(1);
    const rows = await prisma.emailQueue.findMany();
    expect(rows[0].status).toBe('sent');
  });

  it('processes multiple pending emails in one batch', async () => {
    for (let i = 0; i < 5; i++) {
      await services.emailQueue.enqueue({
        to: `user${i}@example.com`,
        subject: `Test ${i}`,
        text: `Body ${i}`,
      });
    }

    const transport = services.email.getTransport();
    const sent = await services.emailQueue.processPending(transport, 20);

    expect(sent).toBe(5);
    const sentRows = await prisma.emailQueue.findMany({ where: { status: 'sent' } });
    expect(sentRows).toHaveLength(5);
  });
});
