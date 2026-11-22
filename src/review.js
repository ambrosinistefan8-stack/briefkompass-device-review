// Review checks are strict booleans; AI and deadline gates remain in force.
import { adoptAiSuggestion } from './ai.js';
import { adoptRuleDeadline } from './rules.js';

export function canAdoptReviewedSuggestion({evidenceChecked, limitationChecked, reviewItem = null, deadline = false}) {
  if (evidenceChecked !== true || limitationChecked !== true) return false;
  if (reviewItem && !adoptAiSuggestion(reviewItem, () => true, () => {})) return false;
  if (deadline && !adoptRuleDeadline(() => true, () => {})) return false;
  return true;
}
