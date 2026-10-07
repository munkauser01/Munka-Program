// Figma e4BORKHMCBpCP5yiLUMRS9, guide frames 8:54 / 8:80 / 8:106.
// Preview illustrations contain example data only, never a user's planner.
export const guideSteps = [
  { title: 'Your day, in sight', detail: 'Turn a busy day into a clear next step.', image: 'tasks', alt: 'Example task list: reading, a project outline and a walk.', caption: 'Tasks, projects and courses in one place.', node: '8:63' },
  { title: 'Make room for what matters', detail: 'See your tasks beside appointments.', image: 'calendar', alt: 'Example calendar showing study time, a project deadline and a meeting.', caption: 'Day, week, month and agenda views.', node: '8:89' },
  { title: 'Plan together, on your terms', detail: 'Choose who can view or edit a calendar.', image: 'sharing', alt: 'Example shared calendar with owner, editor and viewer roles.', caption: 'Sign in for sync and shared calendars. You choose when to enable personal sync.', node: '8:115' },
];
export function openProductGuide({ drawer, closeDrawer, onComplete = closeDrawer, onSkip = onComplete }) {
  let index = 0;
  function show(direction = 'next') {
    const step = guideSteps[index];
    const el = drawer(step.title, `<section class="guide-step" aria-label="Feature preview">
      <p class="guide-lead">${step.detail}</p>
      <figure class="guide-preview" data-node-id="${step.node}"><img src="../assets/guide/${step.image}.svg" width="416" height="250" alt="${step.alt}"><figcaption>Example preview</figcaption></figure>
      <p class="guide-caption">${step.caption}</p>
      <p class="guide-progress" role="status" aria-live="polite">${index + 1} of ${guideSteps.length}</p>
      <div class="guide-controls"><button type="button" id="guide-back" ${index ? '' : 'disabled'}>Back</button><button type="button" id="welcome-skip" class="quiet">Skip tour</button><button type="submit" class="primary" id="guide-next">${index === guideSteps.length - 1 ? 'Finish tour' : 'Next'}</button></div>
      </section>`, () => {
        if (index === guideSteps.length - 1) return onComplete();
        index++; show();
      });
    el.classList.add('guide-drawer');
    el.dataset.direction = direction;
    const title = el.querySelector('.drawer-head h2'); title.tabIndex = -1; title.focus();
    el.querySelector('#guide-back').onclick = () => { if (index) { index--; show('back'); } };
    el.querySelector('#welcome-skip').onclick = onSkip;
  }
  show();
}
