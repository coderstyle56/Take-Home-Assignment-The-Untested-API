const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

beforeEach(() => taskService._reset());

const createTask = (overrides = {}) =>
  request(app).post('/tasks').send({ title: 'Test task', ...overrides });

const seed = async (n) => {
  for (let i = 1; i <= n; i++) await createTask({ title: `Task ${i}` });
};

describe('POST /tasks', () => {
  test('creates a task', async () => {
    const res = await createTask({ priority: 'high' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Test task', status: 'todo', priority: 'high', completedAt: null });
    expect(res.body.id).toBeDefined();
  });

  test.each([
    ['missing title', {}],
    ['empty title', { title: '' }],
    ['whitespace title', { title: '   ' }],
    ['non-string title', { title: 123 }],
    ['invalid status', { title: 'x', status: 'blocked' }],
    ['invalid priority', { title: 'x', priority: 'urgent' }],
    ['invalid dueDate', { title: 'x', dueDate: 'not-a-date' }],
  ])('400 for %s', async (_name, body) => {
    const res = await request(app).post('/tasks').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test.failing('BUG-5: malformed JSON returns 400, not 500', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app)
      .post('/tasks')
      .set('Content-Type', 'application/json')
      .send('{"title": ');
    expect(res.status).toBe(400);
    console.error.mockRestore();
  });
});

describe('GET /tasks', () => {
  test('returns empty list initially', async () => {
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns all tasks', async () => {
    await seed(3);
    const res = await request(app).get('/tasks');
    expect(res.body).toHaveLength(3);
  });

  test('filters by status', async () => {
    await createTask({ status: 'todo' });
    await createTask({ status: 'done' });
    const res = await request(app).get('/tasks?status=done');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('done');
  });

  test.failing('BUG-2: partial status value must not match', async () => {
    await createTask({ status: 'todo' });
    await createTask({ status: 'done' });
    const res = await request(app).get('/tasks?status=do');
    expect(res.body).toEqual([]);
  });

  test('paginates: page 1', async () => {
    await seed(5);
    const res = await request(app).get('/tasks?page=1&limit=2');
    expect(res.body.map((t) => t.title)).toEqual(['Task 1', 'Task 2']);
  });

  test('paginates: page 2 and last partial page', async () => {
    await seed(5);
    const p2 = await request(app).get('/tasks?page=2&limit=2');
    const p3 = await request(app).get('/tasks?page=3&limit=2');
    expect(p2.body.map((t) => t.title)).toEqual(['Task 3', 'Task 4']);
    expect(p3.body.map((t) => t.title)).toEqual(['Task 5']);
  });

  test('page past the end returns empty array', async () => {
    await seed(3);
    const res = await request(app).get('/tasks?page=10&limit=2');
    expect(res.body).toEqual([]);
  });

  test('non-numeric page/limit fall back to defaults', async () => {
    await seed(3);
    const res = await request(app).get('/tasks?page=abc&limit=xyz');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
  });

  test.failing('BUG-6: negative page is rejected with 400', async () => {
    await seed(3);
    const res = await request(app).get('/tasks?page=-1&limit=2');
    expect(res.status).toBe(400);
  });

  test.failing('BUG-6: negative limit is rejected with 400', async () => {
    await seed(3);
    const res = await request(app).get('/tasks?page=1&limit=-2');
    expect(res.status).toBe(400);
  });
});

describe('PUT /tasks/:id', () => {
  test('updates a task', async () => {
    const { body: task } = await createTask();
    const res = await request(app).put(`/tasks/${task.id}`).send({ title: 'Updated', status: 'in_progress' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: task.id, title: 'Updated', status: 'in_progress' });
  });

  test('404 for unknown id', async () => {
    const res = await request(app).put('/tasks/nope').send({ title: 'x' });
    expect(res.status).toBe(404);
  });

  test.each([
    ['empty title', { title: '' }],
    ['invalid status', { status: 'blocked' }],
    ['invalid priority', { priority: 'urgent' }],
    ['invalid dueDate', { dueDate: 'garbage' }],
  ])('400 for %s', async (_name, body) => {
    const { body: task } = await createTask();
    const res = await request(app).put(`/tasks/${task.id}`).send(body);
    expect(res.status).toBe(400);
  });

  test.failing('BUG-4: body cannot overwrite id or createdAt', async () => {
    const { body: task } = await createTask();
    const res = await request(app)
      .put(`/tasks/${task.id}`)
      .send({ id: 'hacked', createdAt: '2000-01-01T00:00:00.000Z' });
    expect(res.body.id).toBe(task.id);
    expect(res.body.createdAt).toBe(task.createdAt);
  });
});

describe('DELETE /tasks/:id', () => {
  test('deletes a task', async () => {
    const { body: task } = await createTask();
    const res = await request(app).delete(`/tasks/${task.id}`);
    expect(res.status).toBe(204);
    const list = await request(app).get('/tasks');
    expect(list.body).toEqual([]);
  });

  test('404 for unknown id', async () => {
    const res = await request(app).delete('/tasks/nope');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /tasks/:id/complete', () => {
  test('marks task as done', async () => {
    const { body: task } = await createTask();
    const res = await request(app).patch(`/tasks/${task.id}/complete`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.completedAt).not.toBeNull();
  });

  test('404 for unknown id', async () => {
    const res = await request(app).patch('/tasks/nope/complete');
    expect(res.status).toBe(404);
  });

  test.failing('BUG-3: priority is preserved on complete', async () => {
    const { body: task } = await createTask({ priority: 'high' });
    const res = await request(app).patch(`/tasks/${task.id}/complete`);
    expect(res.body.priority).toBe('high');
  });
});

describe('GET /tasks/stats', () => {
  test('returns counts and overdue (done tasks are never overdue)', async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    await createTask({ status: 'todo' });
    await createTask({ status: 'todo', dueDate: past });
    await createTask({ status: 'in_progress' });
    await createTask({ status: 'done', dueDate: past });

    const res = await request(app).get('/tasks/stats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ todo: 2, in_progress: 1, done: 1, overdue: 1 });
  });

  test('is not swallowed by /:id routes', async () => {
    const res = await request(app).get('/tasks/stats');
    expect(res.body).toHaveProperty('overdue');
  });
});

describe('PATCH /tasks/:id/assign', () => {
  test('assigns a task', async () => {
    const { body: task } = await createTask();
    const res = await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'Rohit' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: task.id, assignee: 'Rohit' });
  });

  test('persists the assignee', async () => {
    const { body: task } = await createTask();
    await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'Rohit' });
    const list = await request(app).get('/tasks');
    expect(list.body[0].assignee).toBe('Rohit');
  });

  test('trims the name', async () => {
    const { body: task } = await createTask();
    const res = await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: '  Rohit ' });
    expect(res.body.assignee).toBe('Rohit');
  });

  test('allows reassignment', async () => {
    const { body: task } = await createTask();
    await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'A' });
    const res = await request(app).patch(`/tasks/${task.id}/assign`).send({ assignee: 'B' });
    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('B');
  });

  test('404 for unknown task', async () => {
    const res = await request(app).patch('/tasks/nope/assign').send({ assignee: 'A' });
    expect(res.status).toBe(404);
  });

  test.each([
    ['missing assignee', {}],
    ['empty string', { assignee: '' }],
    ['whitespace only', { assignee: '   ' }],
    ['number', { assignee: 42 }],
    ['null', { assignee: null }],
    ['too long', { assignee: 'a'.repeat(101) }],
  ])('400 for %s', async (_name, body) => {
    const { body: task } = await createTask();
    const res = await request(app).patch(`/tasks/${task.id}/assign`).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});