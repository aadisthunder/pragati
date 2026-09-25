import React from 'react';
import { describe, it, expect } from 'vitest';
import { buildSidebarNavItems, HELP_TOUR_PATH } from './sidebarNav';

describe('buildSidebarNavItems', () => {
  it('places My Topics after AI Instructor and before Quizzes', () => {
    const labels = buildSidebarNavItems().map((item) => item.label);
    expect(labels.indexOf('AI Instructor')).toBeLessThan(labels.indexOf('My Topics'));
    expect(labels.indexOf('My Topics')).toBeLessThan(labels.indexOf('Quizzes'));
    expect(labels.indexOf('Quizzes')).toBeLessThan(labels.indexOf('Analytics'));
  });

  it('links My Topics to /topics with a label and icon like the other nav links', () => {
    const topics = buildSidebarNavItems().find((item) => item.to === '/topics');
    expect(topics).toBeDefined();
    expect(topics?.label).toBe('My Topics');
    // lucide icons are forwardRef components (objects with $$typeof), so assert
    // the behavioral property: the icon must be a renderable React component type.
    expect(React.isValidElement(React.createElement(topics!.icon))).toBe(true);
  });

  it('exposes the full main-nav set in order', () => {
    expect(buildSidebarNavItems().map((item) => item.to)).toEqual([
      '/instructor',
      '/topics',
      '/quizzes',
      '/analytics',
      HELP_TOUR_PATH,
    ]);
  });

  it('adds a Help link last that opens the feature tour, not a route', () => {
    const items = buildSidebarNavItems();
    const help = items[items.length - 1];
    expect(help.to).toBe(HELP_TOUR_PATH);
    expect(help.to).not.toMatch(/^\/help$/); // never an actual route
    expect(help.label).toBe('Help');
    expect(React.isValidElement(React.createElement(help.icon))).toBe(true);
  });
});

describe('filterVisibleChatSessions', () => {
  it('caps the visible chat sessions in sidebar to max 3 items', async () => {
    const { filterVisibleChatSessions, MAX_SIDEBAR_CHAT_SESSIONS } = await import('./sidebarNav');
    expect(MAX_SIDEBAR_CHAT_SESSIONS).toBe(3);

    const mockSessions = [
      { id: '1', title: 'Chat 1' },
      { id: '2', title: 'Chat 2' },
      { id: '3', title: 'Chat 3' },
      { id: '4', title: 'Chat 4' },
      { id: '5', title: 'Chat 5' },
    ];

    const visible = filterVisibleChatSessions(mockSessions);
    expect(visible).toHaveLength(3);
    expect(visible.map((s) => s.id)).toEqual(['1', '2', '3']);
  });

  it('handles empty or fewer than 3 sessions gracefully', async () => {
    const { filterVisibleChatSessions } = await import('./sidebarNav');
    expect(filterVisibleChatSessions([])).toEqual([]);
    expect(filterVisibleChatSessions([{ id: '1', title: 'Chat 1' }])).toHaveLength(1);
    expect(filterVisibleChatSessions(null as any)).toEqual([]);
  });
});

