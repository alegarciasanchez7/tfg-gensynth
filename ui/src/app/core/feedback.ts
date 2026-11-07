/**
 * Temporary feedback form shown during the student demo (Google Form in Spanish).
 * To remove the feature, set SHOW_FEEDBACK to false (or delete this module and the Header button).
 */
export const SHOW_FEEDBACK = true;

export const FEEDBACK_FORM_URL = 'https://forms.gle/sd1aud5HegdEXbBc6';

/** Whether the feedback button is shown. */
export const isFeedbackAvailable = (url: string = FEEDBACK_FORM_URL): boolean => SHOW_FEEDBACK && url.trim() !== '';
