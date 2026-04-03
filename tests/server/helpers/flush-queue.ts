import { ServiceRegistry } from '../../../server/src/services/service.registry';

/**
 * Flush the email queue — process all pending emails through the transport.
 * Call this in tests after actions that enqueue emails but before asserting
 * on InMemoryEmailTransport.sent.
 */
export async function flushQueue(services: ServiceRegistry): Promise<number> {
  const transport = services.email.getTransport();
  return services.emailQueue.processPending(transport, 100);
}
