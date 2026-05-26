import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NudgeStrategy, NudgeMode, NudgeConfig } from '../NudgeStrategy';

describe('NudgeStrategy', () => {
  describe('nudge mode', () => {
    let strategy: NudgeStrategy;

    beforeEach(() => {
      strategy = new NudgeStrategy({ mode: 'nudge', nudgeInterval: 3 });
    });

    it('should nudge when interval is reached', () => {
      const result = strategy.shouldNudgeOnTurn(3, true);
      expect(result.shouldNudge).toBe(true);
    });

    it('should not nudge before interval is reached', () => {
      const result = strategy.shouldNudgeOnTurn(1, true);
      expect(result.shouldNudge).toBe(false);
    });

    it('should not nudge when no incomplete todos exist', () => {
      const result = strategy.shouldNudgeOnTurn(3, false);
      expect(result.shouldNudge).toBe(false);
    });

    it('should provide reason when nudging', () => {
      const result = strategy.shouldNudgeOnTurn(3, true);
      expect(result.reason).toBeDefined();
      expect(result.reason).toContain('nudge');
    });
  });

  describe('should not nudge if recently nudged (cooldown)', () => {
    it('should respect cooldown after a nudge', () => {
      const strategy = new NudgeStrategy({ mode: 'nudge', nudgeInterval: 3 });
      // First nudge at turn 3
      strategy.shouldNudgeOnTurn(3, true);
      // Should not nudge again at turn 4 (cooldown not met)
      const result = strategy.shouldNudgeOnTurn(4, true);
      expect(result.shouldNudge).toBe(false);
    });
  });

  describe('configurable nudge frequency', () => {
    it('should respect custom interval of 5', () => {
      const strategy = new NudgeStrategy({ mode: 'nudge', nudgeInterval: 5 });
      expect(strategy.shouldNudgeOnTurn(4, true).shouldNudge).toBe(false);
      expect(strategy.shouldNudgeOnTurn(5, true).shouldNudge).toBe(true);
    });

    it('should respect custom interval of 1 (every turn)', () => {
      const strategy = new NudgeStrategy({ mode: 'nudge', nudgeInterval: 1 });
      expect(strategy.shouldNudgeOnTurn(1, true).shouldNudge).toBe(true);
      expect(strategy.shouldNudgeOnTurn(2, true).shouldNudge).toBe(true);
    });
  });

  describe('escalation after multiple missed nudges', () => {
    it('should escalate after multiple missed nudges', () => {
      const strategy = new NudgeStrategy({ mode: 'nudge', nudgeInterval: 3 });
      // Expected: after several nudges with no progress, escalation happens
      // This feature is not yet implemented - RED phase
      const result = (strategy as any).shouldEscalate?.(10, 0);
      expect(result).toBe(true);
    });

    it('should not escalate when progress is being made', () => {
      const strategy = new NudgeStrategy({ mode: 'nudge', nudgeInterval: 3 });
      const result = (strategy as any).shouldEscalate?.(10, 5);
      expect(result).toBe(false);
    });
  });

  describe('suppression when agent is making progress', () => {
    it('should suppress nudge when agent completed a task since last nudge', () => {
      const strategy = new NudgeStrategy({ mode: 'nudge', nudgeInterval: 3 });
      // Expected: suppressIfProgress(context) method
      // This feature is not yet implemented - RED phase
      const result = (strategy as any).suppressIfProgress?.({ recentlyCompleted: true });
      expect(result).toBe(true);
    });
  });

  describe('forced mode', () => {
    it('should always nudge in forced mode when incomplete todos exist', () => {
      const strategy = new NudgeStrategy({ mode: 'forced' });
      const result = strategy.shouldNudgeOnTurn(1, true);
      expect(result.shouldNudge).toBe(true);
    });

    it('should not nudge in forced mode when no incomplete todos', () => {
      const strategy = new NudgeStrategy({ mode: 'forced' });
      const result = strategy.shouldNudgeOnTurn(1, false);
      expect(result.shouldNudge).toBe(false);
    });
  });

  describe('scheduled mode', () => {
    it('should nudge at scheduled intervals', () => {
      const strategy = new NudgeStrategy({ mode: 'scheduled', scheduleInterval: 5 });
      expect(strategy.shouldNudgeOnTurn(5, true).shouldNudge).toBe(true);
    });

    it('should not nudge between scheduled intervals', () => {
      const strategy = new NudgeStrategy({ mode: 'scheduled', scheduleInterval: 5 });
      expect(strategy.shouldNudgeOnTurn(3, true).shouldNudge).toBe(false);
    });
  });

  describe('disabled mode', () => {
    it('should never nudge in disabled mode', () => {
      const strategy = new NudgeStrategy({ mode: 'disabled' });
      expect(strategy.shouldNudgeOnTurn(100, true).shouldNudge).toBe(false);
    });
  });

  describe('custom nudge conditions', () => {
    it('should support custom condition function', () => {
      // Expected: NudgeStrategy should support custom conditions
      // This is not yet implemented - RED phase
      const customCondition = vi.fn().mockReturnValue(true);
      const strategy = new NudgeStrategy({
        mode: 'nudge',
        nudgeInterval: 3,
      } as any);
      // Expected: (strategy as any).addCondition(customCondition)
      // const result = strategy.shouldNudgeOnTurn(3, true);
      // expect(customCondition).toHaveBeenCalled();
      expect((strategy as any).addCondition).toBeDefined();
    });
  });

  describe('Untested Methods', () => {
    it('generateNudgeMessage(context) should generate the actual nudge message text', () => {
      const strategy = new NudgeStrategy({ mode: 'nudge', nudgeInterval: 3 });
      const todos = [
        { id: '1', title: 'Write tests', completed: false, createdAt: Date.now() },
        { id: '2', title: 'Fix bugs', completed: true, createdAt: Date.now() },
      ];
      const currentTodo = todos[0];
      const message = (strategy as any).generateNudgeMessage(todos, currentTodo);
      // Should return a string containing relevant nudge information
      expect(message).toBeDefined();
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    });
  });

  describe('detectCheckoff', () => {
    it('should detect checkmark pattern', () => {
      const strategy = new NudgeStrategy({ mode: 'forced', requireCheckoff: true });
      const result = strategy.detectCheckoff('Done: Implement feature');
      expect(result.detected).toBe(true);
      expect(result.todoTitle).toBe('Implement feature');
    });

    it('should detect [x] pattern', () => {
      const strategy = new NudgeStrategy({ mode: 'forced', requireCheckoff: true });
      const result = strategy.detectCheckoff('[x] Write tests');
      expect(result.detected).toBe(true);
      expect(result.todoTitle).toBe('Write tests');
    });

    it('should return detected:false when requireCheckoff is disabled', () => {
      const strategy = new NudgeStrategy({ mode: 'nudge', requireCheckoff: false });
      const result = strategy.detectCheckoff('Completed: task');
      expect(result.detected).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset internal state', () => {
      const strategy = new NudgeStrategy({ mode: 'nudge', nudgeInterval: 3 });
      strategy.shouldNudgeOnTurn(6, true);
      strategy.reset();
      // After reset, turn 3 should trigger nudge again
      const result = strategy.shouldNudgeOnTurn(3, true);
      expect(result.shouldNudge).toBe(true);
    });
  });
});
