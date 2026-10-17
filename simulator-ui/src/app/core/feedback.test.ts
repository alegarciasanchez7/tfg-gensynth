import { describe, expect, it } from 'vitest';
import { FEEDBACK_FORM_URL, isFeedbackAvailable } from './feedback';

describe('feedback', () => {
  it('points to an https Google Form that the desktop app is allowed to open', () => {
    expect(FEEDBACK_FORM_URL).toMatch(/^https:\/\/(forms\.gle\/|docs\.google\.com\/forms\/)/);
  });

  it('is shown only when there is a form URL', () => {
    expect(isFeedbackAvailable()).toBe(true);
    expect(isFeedbackAvailable(' ')).toBe(false);
  });
});
