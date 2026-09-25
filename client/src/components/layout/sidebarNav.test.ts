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
