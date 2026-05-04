export type WhatsAppMessageType = 'text' | 'image' | 'audio' | 'document' | 'video' | 'sticker';

export type WhatsAppTemplateComponent = {
  type: 'header' | 'body' | 'button';
  parameters?: Array<Record<string, unknown>>;
};

export type SendTemplateInput = {
  to: string;
  templateName: string;
  languageCode: string;
  components?: WhatsAppTemplateComponent[];
};

export type SendTextInput = {
  to: string;
  body: string;
  previewUrl?: boolean;
};

export type SendMediaInput = {
  to: string;
  type: Extract<WhatsAppMessageType, 'image' | 'audio' | 'document' | 'video'>;
  mediaId: string;
  caption?: string;
  filename?: string;
};

export type UploadMediaInput = {
  file: Blob;
  filename: string;
  mimeType: string;
};

export type WhatsAppSendResponse = {
  messaging_product: 'whatsapp';
  contacts?: Array<{ input: string; wa_id: string }>;
  messages?: Array<{ id: string; message_status?: string }>;
};

export type WhatsAppMediaMetadata = {
  id: string;
  mime_type: string;
  sha256?: string;
  file_size?: number;
  url: string;
};

export type WhatsAppUploadMediaResponse = {
  id: string;
};

export type WhatsAppWebhookChange = {
  field: 'messages';
  value: Record<string, unknown>;
};

export type WhatsAppWebhookPayload = {
  object: 'whatsapp_business_account';
  entry: Array<{
    id: string;
    changes: WhatsAppWebhookChange[];
  }>;
};
