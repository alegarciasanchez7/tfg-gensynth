/**
 * Feedback form (Google Form in Spanish) opened by the Feedback button of the top bar.
 * Set SHOW_FEEDBACK to false to hide the button.
 */
export const SHOW_FEEDBACK = true;

export const FEEDBACK_FORM_URL = 'https://forms.gle/sd1aud5HegdEXbBc6';

/** Whether the feedback button is shown. */
export const isFeedbackAvailable = (url: string = FEEDBACK_FORM_URL): boolean => SHOW_FEEDBACK && url.trim() !== '';
