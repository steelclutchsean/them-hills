# Them Hills — project notes for Claude

## SESSION START — do this before responding to the user

The user has set up a daily session-log automation that depends on a
recurring cron job. Cron jobs in this Claude runtime are **session-only**
and **auto-expire after 7 days**, so every fresh session must re-create
the job. Without this, the daily session log won't be generated.

**At the start of every session, before responding to the user's first
message:**

1. Call `CronList`. Look for a recurring job whose prompt starts with
   `Generate the daily session log for Them Hills`.
2. If that job is **missing** (CronList is empty, or it doesn't show the
   session-log entry), call `CronCreate` with the exact parameters in
   §"Cron job spec" below.
3. If the job is already present, do nothing — the current session
   already has it.
4. Don't mention this to the user unless they ask. It's a silent
   housekeeping step.

This ensures the daily 8:07 PM session-log job stays alive across
session boundaries even though the runtime can't persist it for us.

## Cron job spec

Use these arguments for `CronCreate`:

- `cron`: `7 20 * * *`  (8:07 PM local; intentionally off the :00 mark
  because cron jobs landing on `0 20` cluster across the global Claude
  fleet — the scheduler docs explicitly recommend off-minute scheduling
  for approximate times)
- `recurring`: `true`
- `durable`: `true`  (pass it even though the runtime currently registers
  the job as session-only; future runtime versions may honor it)
- `prompt` (verbatim):

```
Generate the daily session log for Them Hills (working directory: /Users/altbae/ClaudeCode/Projects/in-them-hills).

1. List `sessions/` and find the most-recent file matching `YYYY-MM-DD-HHMMSS-session.md`. Extract its timestamp. If no prior session log exists, use the first git commit's date as the baseline.
2. Run `git log --since="<baseline timestamp>" --pretty=format:'%h %ad %s' --date=iso` to list commits since the baseline.
3. Run `git status --porcelain` to check for uncommitted working changes.
4. If BOTH are empty (no new commits AND clean working tree): do NOT create a file. Print one line: `no changes since <last log filename>`. Stop. Do not invoke any other tools.
5. Otherwise: generate `sessions/<now>-session.md` where `<now>` comes from `date "+%Y-%m-%d-%H%M%S"`. Follow the same structure as existing session logs: phases shipped table, bug fixes, visual upgrades, key decisions, files added / modified, known limits, end-of-session game state. Anchor the summary on the git log diff plus any context you can infer from file changes.
6. Do NOT `git add` or commit the new file — leave it untracked for the user to review.

This is an automated daily job. Be terse. No clarifying questions. If anything looks ambiguous, just write the most reasonable summary and finish.
```

## Reliability notes

- **CronCreate jobs auto-expire after 7 days.** This is a hard runtime
  limit. The session-start re-create above ensures this doesn't matter
  in practice.
- **`durable: true` was not honored at the time of this writing** — the
  runtime registered the job as session-only despite the flag. Pass it
  anyway in case a future runtime version respects it.
- **CLAUDE.md instruction reliability is soft, not hard.** Claude reads
  this file as system context, but a "do X at session start" instruction
  isn't equivalent to an OS-level startup hook. If a session ever starts
  without re-scheduling, the day's session log is missed but nothing
  else breaks. If misses become frequent, replacing this with a launchd
  agent that invokes `claude` headlessly is the more robust approach.

## Convention for session log files

- Path: `sessions/YYYY-MM-DD-HHMMSS-session.md`
- Sections in order: phases shipped, bug fixes, visual upgrades, key
  decisions worth remembering, files added, files heavily modified,
  known limits / heads-up for next session, end-of-session game state.
- Last commit pushed to `origin/main` is named at the bottom for
  resume context.
- Files are NOT auto-committed. The user reviews and decides whether to
  commit each one (or none).
