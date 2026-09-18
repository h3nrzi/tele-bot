# 06: Terminal State Credential Redaction & Invalid Credentials Rejection

**What to build:** Automate at-rest credential scrubbing upon terminal order states, and provide an explicit rejection flow for invalid credentials.
- When an order transitions to any terminal state (`FULFILLED`, `REJECTED`, `CANCELLED`), sensitive password fields in `orders.buyer_inputs` are mutated to `"[REDACTED]"`.
- Non-sensitive operational metadata (`email`, `targetUsername`, `region`) is preserved for audit history and dispute resolution.
- Adds `INVALID_CREDENTIALS` ("اطلاعات ورود نامعتبر / نیاز به تایید دو مرحله‌ای") to `ORDER_REJECTION_CATEGORIES`.
- Selecting `INVALID_CREDENTIALS` automatically refunds the order price in USD to the Buyer's wallet, records the refund ledger transaction, and sends an explanatory message to the Buyer advising them to check their credentials or disable 2FA.

**Blocked by:** 01 (Credential Crypto Service & Polymorphic Catalog Data Model), 03 (Buyer Pre-Placement Requirement Flow & Atomic Order Placement), 05 (Strategy-Driven Fulfillment)

**Status:** ready-for-agent

- [ ] Sensitive password fields in `buyer_inputs` are replaced with `"[REDACTED]"` when an order is fulfilled, rejected, or cancelled.
- [ ] Non-sensitive attributes (`email`, `targetUsername`, `region`) remain unchanged after redaction.
- [ ] `INVALID_CREDENTIALS` appears as a selectable rejection category in the Admin rejection menu.
- [ ] Rejecting with `INVALID_CREDENTIALS` automatically refunds the Buyer's wallet balance, creates refund ledger entries, and notifies the Buyer with specific guidance.
- [ ] End-to-end tests verify at-rest credential redaction across all three terminal states and verify the rejection refund flow.
