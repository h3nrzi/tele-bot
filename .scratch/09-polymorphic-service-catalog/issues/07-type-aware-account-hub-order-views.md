# 07: Type-Aware Account Hub & Order Detail Views

**What to build:** Update the Buyer Account Hub (`/account` and `👤 حساب کاربری`) to display polymorphic order details accurately and securely.
- In the Order Detail view, display submitted Buyer Inputs (e.g. target email, username/ID, server region) alongside the item details.
- Ensure passwords and cryptographic payloads are never rendered in the Account Hub view under any status.
- For `ACTIVATION` orders in `FULFILLED` status, display an account activation confirmation indicator instead of empty or missing delivery content.
- For `PAYLOAD_DELIVERY` orders in `FULFILLED` status, display the delivered content as before.
- When an order is rejected due to `INVALID_CREDENTIALS`, display the specific rejection category and advice in the order detail view.

**Blocked by:** 03 (Buyer Pre-Placement Requirement Flow & Atomic Order Placement), 05 (Strategy-Driven Fulfillment), 06 (Terminal State Credential Redaction & Invalid Credentials Rejection)

**Status:** ready-for-agent

- [ ] Order Detail view in Account Hub displays submitted buyer inputs (email, handle, region).
- [ ] Password values, ciphertexts, IVs, and tags are never displayed in the view.
- [ ] `ACTIVATION` orders display an activation confirmation banner when fulfilled.
- [ ] `PAYLOAD_DELIVERY` orders display delivery content when fulfilled.
- [ ] `INVALID_CREDENTIALS` rejection reason and guidance are properly rendered for rejected orders.
- [ ] End-to-end bot tests cover Account Hub detail views across all catalog types and statuses.
