# Scheduling timezone — Uruguay audience

`scheduled_for` is UTC. This client posts for a **Uruguay audience (UTC-3)**.

- "9:00 hora local / cuando hay más gente conectada" = **12:00 UTC**.
- LinkedIn engagement peaks mid-morning on weekdays, so **9:00 local Tue–Fri** is
  the default good slot.
- Convert every local time the user gives by **+3h** before passing it to
  `postiz_schedule_post`, and state the local time back to the user so they can
  confirm.

See the `post-drafting` core skill, "Scheduling to Postiz (traps)", for the
delete-then-recreate rule when moving an already-queued post.
