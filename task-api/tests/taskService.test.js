const taskService = require('../src/services/taskService');

const seed = (n) =>
  Array.from({ length: n }, (_, i) => taskService.create({ title: `Task ${i + 1}` }));

beforeEach(() => taskService._reset());
afterEach(() => jest.useRealTimers());

describe('create', () => {
  test('applies defaults', () => {
    const task = taskService.create({ title: 'Write tests' });
    expect(task).toMatchObject({
      title: 'Write tests',
      description: '',
      status: 'todo',
      priority: 'medium',
      dueDate: null,
      completedAt: null,
    });
    expect(typeof task.id).toBe('string');
    expect(new Date(task.createdAt).toISOString()).toBe(task.createdAt);
  });

  test('uses provided values', () => {
    const task = taskService.create({
      title: 'x',
      description: 'd',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2030-01-01T00:00:00.000Z',
    });
    expect(task).toMatchObject({
      description: 'd',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2030-01-01T00:00:00.000Z',
    });
  });

  test('generates unique ids', () => {
    const [a, b] = seed(2);
    expect(a.id).not.toBe(b.id);
  });
});

describe('getAll / findById', () => {
  test('getAll returns a copy, not the internal array', () => {
    seed(2);
    const list = taskService.getAll();
    list.pop();
    expect(taskService.getAll()).toHaveLength(2);
  });

  test('findById returns the task or undefined', () => {
    const [task] = seed(1);
    expect(taskService.findById(task.id)).toEqual(task);
    expect(taskService.findById('nope')).toBeUndefined();
  });
});

describe('getByStatus', () => {
  test('returns only tasks with the exact status', () => {
    taskService.create({ title: 'a', status: 'todo' });
    taskService.create({ title: 'b', status: 'done' });
    const result = taskService.getByStatus('todo');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('a');
  });

  test('returns empty array when nothing matches', () => {
    seed(2);
    expect(taskService.getByStatus('done')).toEqual([]);
  });

  test.failing('BUG-2: partial status must not match (includes vs ===)', () => {
    taskService.create({ title: 'a', status: 'todo' });
    taskService.create({ title: 'b', status: 'done' });
    expect(taskService.getByStatus('do')).toEqual([]);
  });
});

describe('getPaginated', () => {
  test('page 1 returns the first items', () => {
    seed(5);
    expect(taskService.getPaginated(1, 2).map((t) => t.title)).toEqual(['Task 1', 'Task 2']);
  });

  test('page 2 returns the next items', () => {
    seed(5);
    expect(taskService.getPaginated(2, 2).map((t) => t.title)).toEqual(['Task 3', 'Task 4']);
  });

  test('last page can be partial', () => {
    seed(5);
    expect(taskService.getPaginated(3, 2).map((t) => t.title)).toEqual(['Task 5']);
  });

  test('page past the end returns empty array', () => {
    seed(5);
    expect(taskService.getPaginated(4, 2)).toEqual([]);
  });
});

describe('getStats', () => {
  test('counts by status and overdue', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const future = new Date(Date.now() + 86400000).toISOString();
    taskService.create({ title: 'a', status: 'todo' });
    taskService.create({ title: 'b', status: 'todo', dueDate: past });
    taskService.create({ title: 'c', status: 'in_progress', dueDate: future });
    taskService.create({ title: 'd', status: 'done', dueDate: past });

    expect(taskService.getStats()).toEqual({ todo: 2, in_progress: 1, done: 1, overdue: 1 });
  });

  test('empty store gives all zeros', () => {
    expect(taskService.getStats()).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });
});

describe('update', () => {
  test('updates given fields and keeps the rest', () => {
    const [task] = seed(1);
    const updated = taskService.update(task.id, { title: 'New', priority: 'high' });
    expect(updated).toMatchObject({ title: 'New', priority: 'high', status: 'todo' });
    expect(taskService.findById(task.id).title).toBe('New');
  });

  test('returns null for unknown id', () => {
    expect(taskService.update('nope', { title: 'x' })).toBeNull();
  });

  test.failing('BUG-4: id and createdAt must not be overwritable', () => {
    const [task] = seed(1);
    const updated = taskService.update(task.id, { id: 'hacked', createdAt: '2000-01-01T00:00:00.000Z' });
    expect(updated.id).toBe(task.id);
    expect(updated.createdAt).toBe(task.createdAt);
  });
});

describe('remove', () => {
  test('removes an existing task', () => {
    const [task] = seed(2);
    expect(taskService.remove(task.id)).toBe(true);
    expect(taskService.getAll()).toHaveLength(1);
  });

  test('returns false for unknown id', () => {
    expect(taskService.remove('nope')).toBe(false);
  });
});

describe('completeTask', () => {
  test('marks task done and sets completedAt', () => {
    const [task] = seed(1);
    const done = taskService.completeTask(task.id);
    expect(done.status).toBe('done');
    expect(new Date(done.completedAt).toISOString()).toBe(done.completedAt);
    expect(taskService.findById(task.id).status).toBe('done');
  });

  test('returns null for unknown id', () => {
    expect(taskService.completeTask('nope')).toBeNull();
  });

  test.failing('BUG-3: completing must not change priority', () => {
    const task = taskService.create({ title: 'x', priority: 'high' });
    expect(taskService.completeTask(task.id).priority).toBe('high');
  });

  test.failing('BUG-7: completing twice keeps the original completedAt', () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
    const task = taskService.create({ title: 'x' });
    const first = taskService.completeTask(task.id);
    jest.setSystemTime(new Date('2025-01-02T00:00:00.000Z'));
    const second = taskService.completeTask(task.id);
    expect(second.completedAt).toBe(first.completedAt);
  });
});

describe('assignTask', () => {
  test('stores the assignee and returns the updated task', () => {
    const [task] = seed(1);
    const updated = taskService.assignTask(task.id, 'Rohit');
    expect(updated.assignee).toBe('Rohit');
    expect(taskService.findById(task.id).assignee).toBe('Rohit');
  });

  test('trims whitespace', () => {
    const [task] = seed(1);
    expect(taskService.assignTask(task.id, '  Rohit  ').assignee).toBe('Rohit');
  });

  test('allows reassignment', () => {
    const [task] = seed(1);
    taskService.assignTask(task.id, 'A');
    expect(taskService.assignTask(task.id, 'B').assignee).toBe('B');
  });

  test('returns null for unknown id', () => {
    expect(taskService.assignTask('nope', 'A')).toBeNull();
  });
});