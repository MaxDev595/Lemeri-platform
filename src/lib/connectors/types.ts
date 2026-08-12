export type ConnectorMessage = { externalConversationId: string; externalMessageId: string; senderId: string; senderName?: string; text: string; receivedAt: Date };
export type ConnectionCheck = { ok: boolean; externalId?: string; displayName?: string; error?: string };
export interface ChannelConnector<TConfig extends object = Record<string, string>> {
  readonly type: string;
  validateConfig(config: unknown): TConfig;
  verifyConnection(config: TConfig): Promise<ConnectionCheck>;
  verifyWebhook(rawBody: string, headers: Headers, config: TConfig): boolean;
  parseWebhook(payload: unknown): ConnectorMessage[];
  sendMessage(config: TConfig, recipientId: string, text: string): Promise<{ externalMessageId: string }>;
}
