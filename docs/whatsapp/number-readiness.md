# WhatsApp Cloud number readiness

Go-live is blocked until the number is compatible with Meta Cloud API.

## Sequence

1. Build and test with a Meta test number first.
2. Confirm Business Manager access and WABA ownership.
3. Verify the existing phone number is releasable from the current BSP/WATI contract.
4. Schedule BSP release/migration window.
5. Configure Cloud API phone number ID, WABA ID, app secret, access token, and webhook verify token in server `.env`.
6. Configure webhook callback and verify challenge.
7. Send/receive test messages and statuses before importing contacts or launching campaigns.

See `docs/whatsapp/meta-cloud-setup.md` for the exact callback URL, required variables, and first test flow.

## Hard blocks

- No campaign launch before approved templates exist.
- No production cutover if webhook signature validation is disabled.
- No browser exposure of `WHATSAPP_ACCESS_TOKEN` or `WHATSAPP_APP_SECRET`.
