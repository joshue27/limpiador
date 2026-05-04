export const AUDIT_ACTIONS = {
  LOGIN_SUCCEEDED: 'login.succeeded',
  LOGIN_FAILED: 'login.failed',
  LOGIN_DISABLED: 'login.disabled_user',
  LOGIN_RATE_LIMITED: 'login.rate_limited',
  SESSION_DISABLED: 'session.disabled_user',
  LOGOUT_SUCCEEDED: 'logout.succeeded',
  ACCESS_DENIED: 'access.denied',
  ADMIN_BOOTSTRAP_CREATED: 'admin.bootstrap_created',
  USER_DEPARTMENTS_UPDATED: 'user.departments_updated',

  TAG_CREATED: 'tag.created',
  TAG_UPDATED: 'tag.updated',
  TAG_STATUS_UPDATED: 'tag.status_updated',
  TAG_DELETED: 'tag.deleted',
  TAG_DELETE_REJECTED: 'tag.delete_rejected',

  CONTACT_CREATED: 'contact.created',
  CONTACT_CREATE_REJECTED: 'contact.create_rejected',
  CONTACT_UPDATED: 'contact.updated',
  CONTACT_TAGS_UPDATED: 'contact.tags_updated',
  CONTACT_CSV_IMPORTED: 'contact.csv_imported',

  CAMPAIGN_CREATE_REJECTED: 'campaign.create_rejected',
  CAMPAIGN_DRAFT_CREATED: 'campaign.draft_created',

  MEDIA_DOWNLOAD_RATE_LIMITED: 'media.download_rate_limited',
  MEDIA_DOWNLOAD_UNAVAILABLE: 'media.download_unavailable',
  MEDIA_DOWNLOADED: 'media.downloaded',
  MEDIA_MARK_REJECTED: 'media.mark_rejected',
  MEDIA_UNMARK_REJECTED: 'media.unmark_rejected',
  MEDIA_MARKED_COMPROBANTE: 'media.marked_comprobante',
  MEDIA_UNMARKED_COMPROBANTE: 'media.unmarked_comprobante',

  EXPORT_REQUESTED: 'export.requested',
  EXPORT_DOWNLOAD_DENIED: 'export.download_denied',
  EXPORT_DOWNLOAD_RATE_LIMITED: 'export.download_rate_limited',
  EXPORT_DOWNLOAD_UNAVAILABLE: 'export.download_unavailable',
  EXPORT_DOWNLOADED: 'export.downloaded',

  AUDIT_CSV_EXPORTED: 'audit.csv_exported',
  AUDIT_EXPORT_DENIED: 'audit.export_denied',

  INBOX_MENU_SENT: 'inbox.menu_sent',
  INBOX_INVALID_MENU_REPLY: 'inbox.invalid_menu_reply',
  INBOX_DEPARTMENT_ASSIGNED: 'inbox.department_assigned',
  INBOX_CLAIMED: 'inbox.claimed',
  INBOX_TRANSFERRED: 'inbox.transferred',
  INBOX_CHAT_OPENED: 'inbox.chat_opened',
  INBOX_CONVERSATION_DELETED: 'inbox.conversation_deleted',
  INBOX_FREE_TEXT_SENT: 'inbox.free_text_sent',
  INBOX_IMAGE_SENT: 'inbox.image_sent',
  INBOX_DOCUMENT_SENT: 'inbox.document_sent',
  INBOX_TEMPLATE_SENT: 'inbox.template_sent',
  INBOX_ACCESS_DENIED: 'inbox.access_denied',
  INBOX_MESSAGE_HIDDEN_ME: 'inbox.message_hidden_me',
  INBOX_MESSAGE_HIDDEN_EVERYONE: 'inbox.message_hidden_everyone',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_ACTION_OPTIONS = Object.values(AUDIT_ACTIONS).sort();
