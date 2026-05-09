import { getConfig } from '@/lib/config';

import type {
  SendMediaInput,
  SendTemplateInput,
  SendTextInput,
  UploadMediaInput,
  WhatsAppMediaMetadata,
  WhatsAppSendResponse,
  WhatsAppUploadMediaResponse,
} from './types';

export class WhatsAppCloudClient {
  private readonly graphBaseUrl: string;
  private readonly phoneNumberId: string;
  private readonly accessToken: string;

  constructor(config = getConfig().whatsapp) {
    this.graphBaseUrl = `https://graph.facebook.com/${config.graphApiVersion}`;
    this.phoneNumberId = config.phoneNumberId;
    this.accessToken = config.accessToken;
  }

  sendText(input: SendTextInput & { context?: { message_id: string } }) {
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to,
      type: 'text',
      text: {
        preview_url: input.previewUrl ?? false,
        body: input.body,
      },
    };

    if (input.context) {
      payload.context = input.context;
    }

    return this.postMessage(payload);
  }

  sendTemplate(input: SendTemplateInput) {
    return this.postMessage({
      messaging_product: 'whatsapp',
      to: input.to,
      type: 'template',
      template: {
        name: input.templateName,
        language: { code: input.languageCode },
        components: input.components,
      },
    });
  }

   sendMedia(input: SendMediaInput) {
     const payload: Record<string, unknown> = {
       messaging_product: 'whatsapp',
       recipient_type: 'individual',
       to: input.to,
       type: input.type,
       [input.type]: {
         id: input.mediaId,
         caption: input.caption,
       },
     };

     // Solo incluir filename para documentos (no soportado para imágenes/vídeo/audio)
     if (input.type === 'document') {
       (payload[input.type] as Record<string, unknown>).filename = input.filename;
     }

     return this.postMessage(payload);
   }

  uploadMedia(input: UploadMediaInput) {
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', input.mimeType);
    formData.append('file', input.file, input.filename);

    return this.fetchJson<WhatsAppUploadMediaResponse>(`${this.graphBaseUrl}/${this.phoneNumberId}/media`, {
      method: 'POST',
      body: formData,
    });
  }

  async getMediaMetadata(mediaId: string): Promise<WhatsAppMediaMetadata> {
    return this.fetchJson<WhatsAppMediaMetadata>(`${this.graphBaseUrl}/${mediaId}`);
  }

  async downloadMedia(mediaUrl: string) {
    const response = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`WhatsApp media download failed: ${response.status}`);
    }

    return response.arrayBuffer();
  }

  async createMessageTemplate(input: { name: string; language: string; category: string; components: Record<string, unknown>[] }) {
    const businessAccountId = getConfig().whatsapp.businessAccountId;
    return this.fetchJson<{ id: string; status: string }>(
      `https://graph.facebook.com/${getConfig().whatsapp.graphApiVersion}/${businessAccountId}/message_templates`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          language: input.language,
          category: input.category,
          components: input.components,
        }),
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  async listMessageTemplates() {
    const businessAccountId = getConfig().whatsapp.businessAccountId;
    return this.fetchJson<{
      data?: Array<{
        id: string;
        name: string;
        language: string;
        category: string;
        status: string;
        components?: Array<{ type: string; text?: string }>;
      }>;
    }>(`https://graph.facebook.com/${getConfig().whatsapp.graphApiVersion}/${businessAccountId}/message_templates?limit=500`);
  }

  async getPhoneNumberInfo() {
    return this.fetchJson<{
      id: string;
      display_phone_number: string;
      quality_rating: string;
      messaging_limit?: number;
      throughput?: {
        level?: string;
      };
    }>(`${this.graphBaseUrl}/${this.phoneNumberId}`);
  }

  private postMessage(payload: Record<string, unknown>) {
    return this.fetchJson<WhatsAppSendResponse>(`${this.graphBaseUrl}/${this.phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...init.headers,
      },
    });

    if (!response.ok) {
      let errorBody = '';
      try { errorBody = JSON.stringify(await response.json()); } catch { /* ignore */ }
      throw new Error(`WhatsApp Cloud API request failed: ${response.status} — ${errorBody || '(no body)'}`);
    }

    return (await response.json()) as T;
  }
}

export function createWhatsAppCloudClient() {
  return new WhatsAppCloudClient();
}
