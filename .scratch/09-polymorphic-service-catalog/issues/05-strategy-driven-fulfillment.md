# 05: Strategy-Driven Fulfillment

**What to build:** Implement strategy-driven fulfillment execution based on `order.fulfillment_strategy_snapshot`.

- When an Admin fulfills an `ACTIVATION` order (`[📦 تحویل سفارش]`), the bot displays a one-click confirmation prompt (`[✓ تایید فعال‌سازی]` / `[❌ انصراف]`) without requiring the Admin to type text into a conversation.
- Confirming activation marks the order `FULFILLED` without `delivery_content` and sends a tailored Persian activation notification to the Buyer confirming their account upgrade.
- When an Admin fulfills a `PAYLOAD_DELIVERY` order, retains the existing 3-step conversation to capture `Delivery Content` and sends the credentials or configuration text to the Buyer.
- Establishes the architectural seam for `AUTOMATED_PANEL` fulfillment fallback.

**Blocked by:** 01 (Credential Crypto Service & Polymorphic Catalog Data Model), 03 (Buyer Pre-Placement Requirement Flow & Atomic Order Placement)

**Status:** done

- [x] Tapping `[📦 تحویل سفارش]` on an `ACTIVATION` order displays a direct confirmation prompt without launching a text input conversation.
- [x] Confirming an `ACTIVATION` order marks it `FULFILLED` and dispatches a dedicated activation message to the Buyer without empty payload sections.
- [x] `PAYLOAD_DELIVERY` orders retain the 3-step conversation and deliver plain-text `Delivery Content` to the Buyer.
- [x] Only the claiming Admin can execute fulfillment for either strategy.
- [x] End-to-end bot tests verify both activation and payload delivery fulfillment flows and Buyer notifications.
