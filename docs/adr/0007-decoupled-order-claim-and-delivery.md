# Explicit PROCESSING state with decoupled order claim and delivery

Orders follow the state machine `PLACED → PROCESSING → FULFILLED | REJECTED | CANCELLED`. The `PLACED → PROCESSING` transition (claiming) is instant — triggered by a single button tap, no conversation involved. The `PROCESSING → FULFILLED` transition (delivery) is a separate deferred action triggered later when the Admin taps a second button and completes a 3-step grammY conversation.

We considered collapsing claim and delivery into a single step: Admin taps one button, immediately enters the delivery conversation, and the order moves directly from `PLACED` to `FULFILLED` upon confirmation. We rejected this because it assumes the Admin has credentials ready at the moment they see the notification, which is not the case for manually provisioned services. Forcing a claim-and-deliver-immediately flow would cause Admins to either delay acknowledging orders (leaving them in `PLACED` with live action buttons for all other Admins) or abandon partially-entered conversations.

The `PROCESSING` state serves three distinct purposes:
1. It signals to all Admins that one person has taken ownership, preventing simultaneous fulfilment attempts.
2. It locks Buyer cancellation: a Buyer cannot cancel once an Admin has committed to delivering.
3. It decouples acknowledgement latency (seconds) from fulfilment latency (minutes or hours), which reflects how manual service delivery actually works.

Tapping `[📦 Fulfil Order]` is idempotent: it always clears any dangling conversation state and starts fresh. Only the claiming Admin (identified by `claimed_by_admin_telegram_id`) may trigger the delivery conversation; other Admins receive an explicit refusal message.
