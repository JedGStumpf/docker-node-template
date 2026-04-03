/**
 * EmailExtractionService — uses Claude Haiku to extract structured data from inbound email bodies.
 *
 * Conservative: only acts on high-confidence extractions, flags ambiguous content for admin review.
 * Read-only: the service stores extraction results but does not send emails or modify request state.
 * State changes happen only when an admin explicitly applies a signal via the admin API.
 *
 * Graceful degradation: if ANTHROPIC_API_KEY is unset, extraction is skipped silently.
 */

export interface ExtractionResult {
  statusSignal: string | null;
  actionItems: string[];
  hostRegistrationCount: number | null;
}

export interface IAnthropicClient {
  extractFromEmailBody(emailBody: string): Promise<ExtractionResult>;
}

/**
 * Real Anthropic client — calls Claude Haiku via @anthropic-ai/sdk.
 */
export class RealAnthropicClient implements IAnthropicClient {
  async extractFromEmailBody(emailBody: string): Promise<ExtractionResult> {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const systemPrompt = [
      'You are an extraction assistant for a community event coordination system.',
      'Extract the following fields from the email body as a JSON object with no additional text.',
      '',
      'Fields:',
      '- status_signal: one of "confirmed", "cancelled", "rescheduled", "none" — the strongest event status signal in the email. If ambiguous, use "none".',
      '- action_items: array of strings, max 5 — concrete actions requested or mentioned.',
      '- host_registration_count: integer or null — the number of registrants/attendees mentioned by the host, if any.',
      '',
      'Return only valid JSON. Example: {"status_signal":"confirmed","action_items":["Send calendar invite"],"host_registration_count":25}',
    ].join('\n');

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Extract structured data from this email:\n\n${emailBody.substring(0, 4000)}`,
        },
      ],
      system: systemPrompt,
    });

    const text = message.content
      .filter((c) => c.type === 'text')
      .map((c: any) => c.text)
      .join('');

    const parsed = JSON.parse(text.trim());
    return {
      statusSignal: parsed.status_signal || null,
      actionItems: Array.isArray(parsed.action_items) ? parsed.action_items.slice(0, 5) : [],
      hostRegistrationCount:
        typeof parsed.host_registration_count === 'number' ? parsed.host_registration_count : null,
    };
  }
}

/**
 * Mock Anthropic client for tests — returns a fixed extraction response.
 */
export class MockAnthropicClient implements IAnthropicClient {
  readonly fixedResult: ExtractionResult;

  constructor(result?: Partial<ExtractionResult>) {
    this.fixedResult = {
      statusSignal: result?.statusSignal ?? 'confirmed',
      actionItems: result?.actionItems ?? ['Send calendar invite'],
      hostRegistrationCount: result?.hostRegistrationCount ?? 15,
    };
  }

  async extractFromEmailBody(_emailBody: string): Promise<ExtractionResult> {
    return this.fixedResult;
  }
}

export class EmailExtractionService {
  constructor(
    private prisma: any,
    private anthropicClient: IAnthropicClient | null,
  ) {}

  /**
   * Extract structured data from an email body and store the result.
   * Returns null if ANTHROPIC_API_KEY is not set or if extraction fails.
   */
  async extractFromEmail(
    emailId: string,
    requestId: string,
    emailBody: string,
  ): Promise<any | null> {
    if (!this.anthropicClient) {
      console.warn('EmailExtractionService: ANTHROPIC_API_KEY not set — skipping extraction');
      return null;
    }

    let result: ExtractionResult;
    try {
      result = await this.anthropicClient.extractFromEmailBody(emailBody);
    } catch (err: any) {
      console.error(`EmailExtractionService: extraction failed for email ${emailId}: ${err.message}`);
      return null;
    }

    try {
      const record = await this.prisma.emailExtraction.create({
        data: {
          emailId,
          requestId,
          statusSignal: result.statusSignal,
          actionItems: result.actionItems,
          hostRegistrationCount: result.hostRegistrationCount,
        },
      });
      return record;
    } catch (err: any) {
      console.error(`EmailExtractionService: failed to store extraction: ${err.message}`);
      return null;
    }
  }

  /**
   * Get the latest extraction for a request.
   */
  async getLatestExtraction(requestId: string): Promise<any | null> {
    return this.prisma.emailExtraction.findFirst({
      where: { requestId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Apply an extraction's status signal to the event request.
   * Sets appliedAt on the extraction and transitions request status.
   */
  async applyExtraction(extractionId: string, adminEmail?: string): Promise<{ extraction: any; request: any }> {
    const extraction = await this.prisma.emailExtraction.findUnique({
      where: { id: extractionId },
    });
    if (!extraction) throw new Error(`Extraction ${extractionId} not found`);
    if (!extraction.statusSignal || extraction.statusSignal === 'none') {
      throw new Error('Extraction has no applicable status signal');
    }

    // Map statusSignal to RequestStatus
    const statusMap: Record<string, string> = {
      confirmed: 'confirmed',
      cancelled: 'cancelled',
      rescheduled: 'discussing',
    };
    const newStatus = statusMap[extraction.statusSignal];
    if (!newStatus) throw new Error(`Unknown status signal: ${extraction.statusSignal}`);

    const now = new Date();

    const [updatedExtraction, updatedRequest] = await Promise.all([
      this.prisma.emailExtraction.update({
        where: { id: extractionId },
        data: { appliedAt: now },
      }),
      this.prisma.eventRequest.update({
        where: { id: extraction.requestId },
        data: { status: newStatus },
      }),
    ]);

    console.log(
      `EmailExtractionService: applied signal "${extraction.statusSignal}" to request ${extraction.requestId}` +
        (adminEmail ? ` by ${adminEmail}` : ''),
    );

    return { extraction: updatedExtraction, request: updatedRequest };
  }
}
