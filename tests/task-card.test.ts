import { readFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ComponentDefinition = {
  methods: Record<string, (this: ComponentContext, event?: any) => void>;
  observers: Record<string, (this: ComponentContext) => void>;
};

type ComponentContext = {
  properties: { task: { id: string; status: string }; updating: boolean; canStart: boolean };
  data: { selectedDifficulty: string };
  setData(data: Partial<{ selectedDifficulty: string }>): void;
  triggerEvent(name: string, detail: unknown): void;
};

let definition: ComponentDefinition;

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('Component', (candidate: ComponentDefinition) => {
    definition = candidate;
  });
  await import('../miniprogram/components/task-card/index');
});

function context(updating = false): ComponentContext & { events: Array<{ name: string; detail: unknown }> } {
  const events: Array<{ name: string; detail: unknown }> = [];
  return {
    properties: { task: { id: 'task-1', status: 'in_progress' }, updating, canStart: true },
    data: { selectedDifficulty: '' },
    events,
    setData(data) { Object.assign(this.data, data); },
    triggerEvent(name, detail) { events.push({ name, detail }); },
  };
}

describe('task card interaction state', () => {
  it('does not emit actions while its task update is in flight', () => {
    const card = context(true);
    card.data.selectedDifficulty = 'hard';

    definition.methods.onStart.call(card);
    definition.methods.onComplete.call(card);

    expect(card.events).toEqual([]);
  });

  it('does not start a blocked pending task but keeps resize and move available', () => {
    const card = context();
    card.properties.task = { id: 'task-2', status: 'pending' };
    card.properties.canStart = false;

    definition.methods.onStart.call(card);
    definition.methods.onResize.call(card);
    definition.methods.onMoveToEnd.call(card);

    expect(card.events).toEqual([
      { name: 'resizetask', detail: { taskId: 'task-2' } },
      { name: 'movetasktoend', detail: { taskId: 'task-2' } },
    ]);
  });

  it('clears selected difficulty when the displayed task identity or status changes', () => {
    const card = context();
    card.data.selectedDifficulty = 'hard';
    card.properties.task = { id: 'task-2', status: 'in_progress' };

    definition.observers['task.id, task.status'].call(card);
    expect(card.data.selectedDifficulty).toBe('');

    card.data.selectedDifficulty = 'easy';
    card.properties.task = { id: 'task-2', status: 'completed' };
    definition.observers['task.id, task.status'].call(card);
    expect(card.data.selectedDifficulty).toBe('');
  });

  it('explains blocked starts and lets a running task shrink before completion', async () => {
    const card = await readFile('miniprogram/components/task-card/index.wxml', 'utf8');
    const styles = await readFile('miniprogram/components/task-card/index.wxss', 'utf8');

    expect(card).toContain('canStart');
    expect(card).toContain('先完成这个目标正在进行的一步');
    expect(card).toContain('disabled="{{updating || !canStart}}"');
    expect(card).toContain("primary && task.status === 'in_progress'");
    expect(card).toContain('bindtap="onResize"');
    expect(card).toContain('完成这一小步');
    expect(card).toContain('class="task-card__choice"');
    expect(styles).toContain('.task-card__choice');
    expect(styles).not.toContain('.task-card__choices button');

    const secondaryButtonRule = styles.match(
      /\.task-card__choice,\s*\.task-card__secondary\s*\{([^}]*)\}/s,
    )?.[1];
    expect(secondaryButtonRule).toBeDefined();
    expect(secondaryButtonRule).toContain('display: flex');
    expect(secondaryButtonRule).toContain('box-sizing: border-box');
    expect(secondaryButtonRule).toContain('align-items: center');
    expect(secondaryButtonRule).toContain('justify-content: center');
  });
});
