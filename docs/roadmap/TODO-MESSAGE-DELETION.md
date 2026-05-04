# Plan for Message Deletion Feature ("para mí" / "para todos")

## Current State
Implemented conversation deletion for ADMIN role with:
- Endpoint: `POST /api/inbox/[id]/delete`
- Requires explicit confirmation: "ELIMINAR"
- Audits: admin userId, conversationId, contact info, message count
- UI: Delete button visible only to ADMIN in conversation actions
- Redirects to inbox after deletion
- Uses Prisma cascades to delete associated messages and media assets

## Pending Work: Message Deletion ("para mí" / "para todos")

### Design Considerations
1. **No actual WhatsApp deletion**: This is app-level hiding only
2. **Two modes**:
   - "Para mí": Hide message only for current user
   - "Para todos": Hide message for all users in the app
3. **Soft delete approach**: Add visibility flags rather than physical deletion
4. **Audit trail**: Track who hid what and when

### Database Changes Needed
Add to `Message` model in `prisma/schema.prisma`:
```prisma
model Message {
  // ... existing fields
  hiddenForUsers   String[]   @default([]) @map("hidden_for_users") // Array of userIds who hid this message
  hiddenGlobally   Boolean    @default(false) @map("hidden_globally") // Whether message is hidden for everyone
  hiddenAt         DateTime?  @map("hidden_at") // When it was hidden
  hiddenById       String?    @map("hidden_by") // Who hid it (for global hides)
}
```

### API Endpoints
1. `POST /api/inbox/[conversationId]/messages/[messageId]/hide-for-me`
2. `POST /api/inbox/[conversationId]/messages/[messageId]/hide-for-everyone` (ADMIN/OPERATOR with permission)
3. `POST /api/inbox/[conversationId]/messages/[messageId]/unhide` (to restore)

### UI Changes
1. Add hide/unhide options to message bubble menu (3 dots)
2. Visual indicator for hidden messages (dimmed, with "Ocultado para mí" or "Ocultado para todos")
3. Permission checks: 
   - Any user can hide for themselves
   - Only ADMIN/designated roles can hide for everyone

### Auditing
Add to `AUDIT_ACTIONS`:
```typescript
INBOX_MESSAGE_HIDDEN_FOR_ME: 'inbox.message_hidden_for_me',
INBOX_MESSAGE_HIDDEN_FOR_EVERYONE: 'inbox.message_hidden_for_everyone',
INBOX_MESSAGE_UNHIDDEN: 'inbox.message_unhidden',
```

### Migration Strategy
1. Add nullable columns first
2. Backfill default values (empty array, false, null)
3. Make columns non-nullable with defaults

### Testing Scenarios
1. User hides message for themselves → message disappears from their view only
2. ADMIN hides message for everyone → message disappears from all views
3. User tries to hide for everyone without permission → denied
4. Unhiding restores message visibility
5. Audit logs capture all actions with proper metadata

### Risks & Mitigations
1. **Performance**: Array of userIds could grow large
   - Mitigation: Consider separate table for user-hidden messages if performance becomes issue
   
2. **Complexity**: Managing two hiding mechanisms
   - Mitigation: Clear naming and documentation in code
   
3. **Consistency**: Ensuring UI correctly reflects hidden state
   - Mitigation: Centralized hook/util for message visibility logic