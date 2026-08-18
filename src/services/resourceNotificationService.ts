import type { SupabaseClientLike } from '../data/types';

// Best-effort server-side email delivery for a persisted resource problem.
// Delivery is attempted through the `resource-problem-notify` Edge Function; a
// false `delivered` result never means the problem itself was lost — only that
// the email could not be sent (and the notification remains retryable).

export interface ResourceNotificationResult {
  delivered: boolean;
}

export class ResourceNotificationService {
  constructor(private readonly client: SupabaseClientLike) {}

  async notify(notificationId: string): Promise<ResourceNotificationResult> {
    const invoke = this.client.functions;
    if (!invoke) return { delivered: false };
    try {
      const { data, error } = await invoke.invoke('resource-problem-notify', { body: { notificationId } });
      if (error) return { delivered: false };
      const response = data as { delivered?: boolean } | null;
      return { delivered: response?.delivered === true };
    } catch {
      return { delivered: false };
    }
  }
}
