# Windows translation failures: 2026-09-21 investigation

## Evidence and limits

Production v0.9.14 diagnostics since September 6 include 13 clipboard-read
failures, 7 copy-injection failures, and 3 modifier-release failures. These occur
before the model request. The copy failures report zero of four SendInput events
inserted, with error code zero. They cluster in one Windows installation, but
existing telemetry cannot identify the target process integrity level. This does
not establish UIPI as the cause of every failure. Successful translations also
occur on September 20 and 21, so this is not a universal service outage.

Code inspection established a separate clipboard race: the old pipeline spawned
a delayed, unconditional clipboard restore, then released the translation guard.
That restore could overwrite the next operation's clipboard. Phrase shortcuts
were not serialized with translations. Logs cannot prove which historical
clipboard-read failures came from this race.

## Repair

- Translation, phrase and selection operations share a non-queued clipboard lock.
  Restore completes before releasing the lock; no detached restore task remains.
- Restore writes only if the clipboard still contains the operation's last known
  value. Unmodified failure paths and external clipboard changes are preserved.
- Copy polling uses a 1.5-second wall-clock deadline and preserves read errors,
  distinguishing clipboard access failure from missing copied text.
- Windows modifier release has a 2-second deadline. Paste checks modifiers and
  the original foreground window. It aborts if the target or expected clipboard
  changes, including before a zero-event injection retry.
- SendInput retries only zero-event failures (three attempts, 30 ms apart).
  Partial insertion is never replayed; cleanup releases only keys left down by
  the inserted prefix. LastError is cleared before input and captured before
  cleanup, avoiding misleading “operation succeeded” error text.
- After a zero return, inspect foreground and current process integrity levels
  and current UIAccess. Only a confirmed higher-integrity target is reported as
  a permission mismatch. No automatic elevation or manifest change is made.

## Permission recovery

Windows permits SendInput only toward equal or lower integrity processes, unless
an applicable UIAccess exception exists. When the diagnostic confirms a mismatch,
restart the target application normally; if it must run elevated, explicitly
restart Lingo at the same privilege level. A normal application cannot repair
this OS boundary by retrying or switching input APIs.

Reference: [Microsoft SendInput documentation](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput).

## Verification scope

Regression tests cover conditional restore, clipboard mutual exclusion,
transient clipboard read failure, modifier release/timeout, changed target and
changed paste content, input batches, partial cleanup and bounded retry rules.
Run repository Rust tests, formatting and Clippy on both macOS and Windows CI.
A real Windows game window is still required to verify focus, clipboard timing,
and privilege mismatch end to end. Code/CI success does not prove that an
existing user's installation has received the fix. This change does not publish
an installer or change model routing.
