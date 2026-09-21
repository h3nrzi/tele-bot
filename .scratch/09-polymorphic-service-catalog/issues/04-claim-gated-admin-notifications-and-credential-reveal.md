# 04: Claim-Gated Admin Push Notifications & Decrypted Credential Reveal

**What to build:** Ensure buyer credentials submitted during order placement remain masked in broadcast Admin notifications and are revealed exclusively to the Admin who claims the order.

- Initial broadcast push notifications dispatched to Admins display non-sensitive buyer inputs (email, handle, server region) with passwords masked (`🔒 پس از شروع پردازش نمایش داده می‌شود` / `🔒 Claim order to reveal`).
- When an Admin taps `[▶ شروع پردازش]` (Claim), the claiming Admin's notification message is edited to reveal the decrypted credentials.
- All other Admins' notification messages update to `🔒 در حال پردازش توسط @adminX` with passwords remaining masked.
- If an order is rejected or cancelled before being claimed, credentials are never revealed to any Admin.

**Blocked by:** 01 (Credential Crypto Service & Polymorphic Catalog Data Model), 03 (Buyer Pre-Placement Requirement Flow & Atomic Order Placement)

**Status:** done

- [x] Initial broadcast notification to Admins shows non-sensitive inputs and masks the password.
- [x] Tapping `[▶ شروع پردازش]` decrypts the password and edits only the claiming Admin's message to reveal the credentials.
- [x] Non-claiming Admins see the claimed status with credentials remaining strictly masked.
- [x] Decrypted credentials are never logged to console or stored in unencrypted form.
- [x] End-to-end bot tests verify notification broadcast masking and claim-gated credential reveal.
