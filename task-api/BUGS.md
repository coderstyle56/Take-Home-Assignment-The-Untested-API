# Bug Report

Found by reading the source and then confirming each one with a test.
Bugs 2-7 are pinned with `test.failing`, so the suite stays green today and
Jest will flag the test once the bug is fixed (remove `.failing` then).

## BUG-1: Pagination skips the first page (FIXED)
- **Expected:** `GET /tasks?page=1&limit=2` returns the first 2 tasks.
- **Actual:** returns tasks 3 and 4. The offset is `page * limit`, so page 1 skips
  `limit` items and the last page can become unreachable.
- **Found by:** pagination tests in `tasks.test.js` and `taskService.test.js` failed.
- **Fix:** `const offset = (page - 1) * limit;` in `getPaginated`.

## BUG-2: Status filter matches partial strings
- **Expected:** `?status=do` returns nothing, since it is not a valid status.
- **Actual:** returns both `todo` and `done`, because `getByStatus` uses `String.includes`.
- **Found by:** `BUG-2` tests (service and route).
- **Fix:** use `t.status === status`. Optionally return 400 for an invalid status.

## BUG-3: Completing a task resets its priority
- **Expected:** `PATCH /tasks/:id/complete` only sets `status` and `completedAt`.
- **Actual:** `priority` is always overwritten with `medium`.
- **Found by:** `BUG-3` tests (service and route).
- **Fix:** remove `priority: 'medium'` from `completeTask`.

## BUG-4: PUT can overwrite immutable fields
- **Expected:** `id`, `createdAt` (and `completedAt`) cannot be changed via PUT.
- **Actual:** `update` spreads the whole body, so `{ "id": "x", "createdAt": "..." }`
  replaces them.
- **Found by:** `BUG-4` tests (service and route).
- **Fix:** whitelist updatable fields (`title`, `description`, `status`, `priority`,
  `dueDate`) in `update` or in the route.

## BUG-5: Malformed JSON returns 500 instead of 400
- **Expected:** invalid JSON body returns 400.
- **Actual:** `express.json()` throws an error with `status: 400`, but the global
  error handler ignores it and always sends 500.
- **Found by:** `BUG-5` test posting `{"title": `.
- **Fix:** in the error handler, use `err.status || 500` (and a proper message for 4xx).

## BUG-6: Negative page or limit is accepted
- **Expected:** `page` and `limit` must be positive integers, otherwise 400.
- **Actual:** `page=-1&limit=2` returns 200 with arbitrary data, because negative
  offsets make `slice` count from the end. Invalid input like `abc` silently falls
  back to defaults.
- **Found by:** `BUG-6` tests.
- **Fix:** validate in the route, reject values below 1, and cap `limit` (e.g. 100).

## BUG-7: Completing an already completed task overwrites `completedAt`
- **Expected:** completing twice keeps the original `completedAt`.
- **Actual:** the timestamp is replaced on every call.
- **Found by:** `BUG-7` unit test using fake timers.
- **Fix:** return the existing task early if `status === 'done'`.

## Other observations (not covered by tests)
- `?status=` takes priority over `page`/`limit`, so combining them ignores pagination.
- An invalid status filter returns `[]` instead of 400.
- `PUT` with `status: "done"` does not set `completedAt` (and moving away from
  `done` does not clear it).
- `limit` has no upper bound.