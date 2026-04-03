---
status: done
sprint: '004'
---

# Outbound Email Queue with Retry

Sprint 3 sends emails after database transaction commit with log-on-failure
semantics. There is no automatic retry for failed emails. Add a proper
outbound email queue table with dead-letter handling, automatic retry
with exponential backoff, and admin visibility into failed sends.

Spec context: Sprint 3 architecture notes this as a future improvement.

## Notes

- Use a `UNLOGGED` (Postgres) or regular table for the queue.
- `FOR UPDATE SKIP LOCKED` for worker concurrency.
- Columns: id, recipient, template, data (JSONB), status, attempts,
  next_retry_at, last_error, created_at.
- Scheduler job picks up pending emails and sends them.
- Admin route to list failed emails and retry manually.
