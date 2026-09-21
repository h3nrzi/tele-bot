# Claim-Gated Reveal of Sensitive Buyer Credentials in Admin Push Messages

When an order containing sensitive buyer credentials (passwords) is placed, initial Telegram push notifications sent to Admins mask the password. Only upon claiming the order (`PLACED → PROCESSING`) is the password decrypted and revealed exclusively to the claiming Admin.

## Context & Rationale

When an Order is placed, `order_admin_notifications` sends push messages to all configured Admins (ADR-0008). If sensitive account passwords were included in this initial broadcast, buyer credentials would be permanently replicated across every Admin's personal chat history and any shared operational channels. This violates the principle of least privilege: only the single Admin actively processing the order needs access to the credentials.

## Considered Options

**Option A — Unconditional credential broadcast.** Include the decrypted password in the initial notification sent to all Admins. Rejected because it unnecessarily leaks sensitive credentials to all Admins and remains logged in Telegram group histories indefinitely.

**Option B (chosen) — Masked initial broadcast with claim-gated reveal.** Initial notifications display non-sensitive order information (Catalog Item name, Buyer handle, account email) with the password field displayed as `🔒 Claim order to reveal`. When an Admin taps `[▶ Start Processing]` (Claim), the message of the claiming Admin is edited to reveal the decrypted password. Other Admins' notification messages remain masked and update to `🔒 Processing by @adminX` per ADR-0007.

## Consequences

- Rejection or cancellation before claim never reveals credentials to any Admin.
- The claiming Admin receives the decrypted credentials directly in their updated notification view or a private ephemeral interaction.
- Combined with ADR-0012, passwords exist in decrypted form only in the claiming Admin's interface during the active `PROCESSING` window.
