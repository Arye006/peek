# RFC: idempotency keys for the payment queue

## Approach

Every enqueued payment carries a caller-supplied key. The worker takes the key as a unique
constraint, so a retry that arrives after a partial failure collapses onto the original row
instead of charging twice.

- [x] Agree the key format
- [ ] Add the unique index
- [ ] Backfill keys for in-flight rows
