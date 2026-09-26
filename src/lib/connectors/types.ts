export type ConnectorMessage = { externalConversationId: string; externalMessageId: string; senderId: string; senderName?: string; senderPhone?: string; senderEmail?: string; subject?: string; text: string; receivedAt: Date };
export type SendOptions = { subject?: string };
export type ConnectionCheck = { ok: boolean; externalId?: string; displayName?: string; error?: string };
export interface ChannelConnector<TConfig extends object = Record<string, string>> {
  readonly type: string;
  validateConfig(config: unknown): TConfig;
  verifyConnection(config: TConfig): Promise<ConnectionCheck>;
  verifyWebhook(rawBody: string, headers: Headers, config: TConfig): boolean;
  parseWebhook(payload: unknown): ConnectorMessage[];
  sendMessage(config: TConfig, recipientId: string, text: string, options?: SendOptions): Promise<{ externalMessageId: string }>;
  /** Registers the platform webhook with the provider when it supports it (Telegram). */
  registerWebhook?(config: TConfig, url: string): Promise<void>;
  unregisterWebhook?(config: TConfig): Promise<void>;
}
