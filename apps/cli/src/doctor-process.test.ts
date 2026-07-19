import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import { runDoctor } from './doctor.js';

describe('doctor process safety', () => {
  it('bounds each local executable lookup', async () => {
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('exit', 0));
      return child;
    });

    await runDoctor();

    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ timeout: 30_000 }),
    );
  });
});
