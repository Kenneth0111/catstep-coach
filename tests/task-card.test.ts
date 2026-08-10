import { beforeEach, describe, expect, it, vi } from 'vitest';

type ComponentDefinition = {
  methods: Record<string, (this: ComponentContext, event?: any) => void>;
  observers: Record<string, (this: ComponentContext) => void>;
};

type ComponentContext = {
  properties: { task: { id: string; status: string }; updating: boolean };
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
    properties: { task: { id: 'task-1', status: 'in_progress' }, updating },
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
});
