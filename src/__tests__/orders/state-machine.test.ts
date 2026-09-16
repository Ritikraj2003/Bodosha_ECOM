
import { canTransition, getOrderTimelineEvent, ORDER_TRANSITIONS } from '@/features/orders/types';

describe('Order State Machine', () => {
  it('allows pending → accepted', () => {
    expect(canTransition('pending', 'accepted')).toBe(true);
  });

  it('allows pending → declined', () => {
    expect(canTransition('pending', 'declined')).toBe(true);
  });

  it('allows accepted → preparing', () => {
    expect(canTransition('accepted', 'preparing')).toBe(true);
  });

  it('allows accepted → cancelled', () => {
    expect(canTransition('accepted', 'cancelled')).toBe(true);
  });

  it('allows preparing → ready', () => {
    expect(canTransition('preparing', 'ready')).toBe(true);
  });

  it('allows ready → completed', () => {
    expect(canTransition('ready', 'completed')).toBe(true);
  });

  it('allows ready → assigned', () => {
    expect(canTransition('ready', 'assigned')).toBe(true);
  });

  it('allows out_for_delivery → delivered', () => {
    expect(canTransition('out_for_delivery', 'delivered')).toBe(true);
  });

  it('disallows pending → completed directly', () => {
    expect(canTransition('pending', 'completed')).toBe(false);
  });

  it('disallows pending → ready directly', () => {
    expect(canTransition('pending', 'ready')).toBe(false);
  });

  it('disallows pending → cancelled', () => {
    expect(canTransition('pending', 'cancelled')).toBe(false);
  });

  it('disallows completed → any', () => {
    expect(canTransition('completed', 'accepted')).toBe(false);
    expect(canTransition('completed', 'preparing')).toBe(false);
    expect(canTransition('completed', 'cancelled')).toBe(false);
  });

  it('disallows cancelled → any', () => {
    expect(canTransition('cancelled', 'accepted')).toBe(false);
    expect(canTransition('cancelled', 'pending')).toBe(false);
  });

  it('disallows declined → any', () => {
    expect(canTransition('declined', 'accepted')).toBe(false);
    expect(canTransition('declined', 'pending')).toBe(false);
  });

  it('provides timeline event labels', () => {
    expect(getOrderTimelineEvent('pending')).toBe('Order placed');
    expect(getOrderTimelineEvent('accepted')).toBe('Order accepted');
    expect(getOrderTimelineEvent('preparing')).toBe('Preparing your food');
    expect(getOrderTimelineEvent('ready')).toBe('Order ready');
    expect(getOrderTimelineEvent('out_for_delivery')).toBe('Out for delivery');
    expect(getOrderTimelineEvent('delivered')).toBe('Delivered');
    expect(getOrderTimelineEvent('completed')).toBe('Completed');
    expect(getOrderTimelineEvent('cancelled')).toBe('Cancelled');
  });

  it('every non-terminal status has at least one transition', () => {
    const terminal: string[] = ['completed', 'cancelled', 'declined'];
    for (const [status, transitions] of Object.entries(ORDER_TRANSITIONS)) {
      if (!terminal.includes(status)) {
        expect(transitions.length).toBeGreaterThan(0);
      }
    }
  });
});
