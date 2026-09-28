# Submission Notes

## Coverage
```
File          | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
--------------|---------|----------|---------|---------|-------------------
All files     |   98.71 |     97.7 |   96.66 |   98.59 |
 src          |   84.61 |       75 |      50 |   84.61 |
  app.js      |   84.61 |       75 |      50 |   84.61 | 17-18
 src/routes   |     100 |      100 |     100 |     100 |
 src/services |     100 |    94.73 |     100 |     100 |
  ...rvice.js |     100 |    94.73 |     100 |     100 | 22
 src/utils    |     100 |      100 |     100 |     100 |
```
71 tests, all passing. Uncovered: the `app.listen` block (only runs when started directly) and the unknown-status branch in `getStats` (unreachable through the API because of validation).

## What I did
- Wrote unit tests (`taskService`) and Supertest integration tests for all endpoints.
- Found 7 bugs (see `BUGS.md`). Fixed BUG-1 (pagination offset). BUG-2 to BUG-7 are pinned with `test.failing`, so the suite stays green and Jest flags the test as soon as a bug is fixed.
- Added `PATCH /tasks/:id/assign`.

## `/assign` design decisions
- Body is validated first (400), then the task lookup (404).
- `assignee` must be a non-empty string after trimming, max 100 characters.
- Whitespace is trimmed before storing.
- Reassigning an already-assigned task is allowed and returns 200.

## What I'd test next
- Concurrency and larger data sets (pagination on thousands of tasks).
- `PUT` moving a task to/from `done` and its effect on `completedAt`.
- Combining `?status=` with `page`/`limit`.
- Behaviour around due dates and time zones in `/tasks/stats`.

## What surprised me
- The pagination offset was `page * limit`, so page 1 silently skipped the first items.
- Malformed JSON returns 500, because the global error handler ignores the 400 that `express.json()` throws.
- `?status=` uses `includes`, so a partial value like `do` matches both `todo` and `done`.
- `completeTask` resets priority to `medium`, which looks like a copy-paste leftover.

## Questions before production
- Is the in-memory store temporary? What is the persistence plan?
- Is there authentication, and should `assignee` be a user id instead of free text?
- What is the maximum page size, and should invalid `page`/`limit` return 400?
- Should completing an already-completed task be a no-op?
- Should `PUT` be allowed to set `status: done` without setting `completedAt`?