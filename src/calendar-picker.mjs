// The picker selects a display scope and an explicit creation destination.
export function calendarChoices(calendars = []) {
  return [
    { value: 'all', name: 'All calendars', detail: 'Everything together · add to My planner', group: 'Your planner' },
    { value: 'personal', name: 'My planner', detail: 'Your private tasks and events', group: 'Your planner' },
    ...calendars.map(calendar => ({ value: 'shared:' + calendar.id, name: calendar.name, group: 'Shared calendars', calendar,
      detail: calendar.role === 'owner' ? 'Owner · manage events and sharing' : calendar.role === 'viewer' ? 'Viewer · read only' : 'Editor · ' + (calendar.permissions?.create ? 'can add events' : 'cannot add events') })),
    { value: 'google', name: 'Google', detail: 'Connected events and local copies', group: 'Connections & imports' },
    { value: 'outlook', name: 'Outlook', detail: 'Connected events and local copies', group: 'Connections & imports' },
    { value: 'ics', name: 'Calendar imports', detail: 'Local copies from calendar files', group: 'Connections & imports' },
  ];
}

export function calendarScope(source, calendars = []) {
  const selected = calendarChoices(calendars).find(choice => choice.value === source);
  if (!selected) return { value: source, name: 'Unavailable calendar', personal: false, canCreate: false, missing: true };
  const shared = !!selected.calendar;
  const external = ['google', 'outlook', 'ics'].includes(source);
  return { ...selected, shared, personal: !shared && !external, external,
    canCreate: shared ? selected.calendar.role === 'owner' || selected.calendar.role === 'editor' && !!selected.calendar.permissions?.create : !external,
    access: shared ? selected.calendar.role === 'owner' ? 'Owner' : selected.calendar.role === 'viewer' ? 'View only' : 'Editor' : external ? 'Imported view' : 'Private planner' };
}

export function calendarPicker({ source, calendars, esc, icon }) {
  const choices = calendarChoices(calendars), selected = calendarScope(source, calendars);
  const groups = [...new Set(choices.map(choice => choice.group))];
  return `<div class="calendar-picker" id="calendar-picker">
    <button type="button" id="calendar-picker-trigger" class="calendar-picker-trigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="calendar-picker-list" aria-label="Choose calendar: ${esc(selected.name)}">${icon('calendar')}<span>${esc(selected.name)}</span><span class="picker-chevron" aria-hidden="true">${icon('arrow')}</span></button>
    <div class="calendar-picker-popup" hidden>
      <label class="picker-search">${icon('search')}<input id="calendar-picker-search" type="search" placeholder="Find a calendar" aria-label="Find a calendar" autocomplete="off"></label>
      <div id="calendar-picker-list" role="listbox" aria-label="Choose a calendar" tabindex="-1">${groups.map((group, groupIndex) => `<div class="picker-group" role="group" aria-labelledby="calendar-group-${groupIndex}"><p id="calendar-group-${groupIndex}" class="picker-group-label">${esc(group)}</p>${choices.filter(choice => choice.group === group).map(choice => `<button type="button" class="picker-option" role="option" aria-selected="${choice.value === selected.value}" data-calendar-choice="${esc(choice.value)}" tabindex="-1"><span class="picker-option-copy"><strong>${esc(choice.name)}</strong><small>${esc(choice.detail)}</small></span><span class="picker-check" aria-hidden="true">${choice.value === selected.value ? icon('check') : ''}</span></button>`).join('')}</div>`).join('')}</div>
      <p class="picker-empty" hidden>No matching calendars.</p>
      <button type="button" class="picker-manage" data-cal-action="shared">${icon('person')}Calendars & invitations</button>
    </div>
  </div>`;
}

export function bindCalendarPicker(root, onSelect) {
  const picker = root.querySelector('#calendar-picker');
  if (!picker) return;
  const trigger = picker.querySelector('#calendar-picker-trigger'), popup = picker.querySelector('.calendar-picker-popup');
  const search = picker.querySelector('input'), options = [...picker.querySelectorAll('[role=option]')];
  const visible = () => options.filter(option => !option.hidden);
  const setFocus = option => {options.forEach(item => item.tabIndex = item === option ? 0 : -1); option?.focus();};
  const close = (restore = false) => {popup.hidden = true; trigger.setAttribute('aria-expanded', 'false'); if (restore) trigger.focus();};
  const open = () => {popup.hidden = false; trigger.setAttribute('aria-expanded', 'true'); search.value = ''; filter(); setFocus(options.find(option => option.getAttribute('aria-selected') === 'true') || options[0]);};
  function filter() {
    const query = search.value.trim().toLocaleLowerCase();
    options.forEach(option => option.hidden = !option.textContent.toLocaleLowerCase().includes(query));
    picker.querySelectorAll('.picker-group').forEach(group => group.hidden = !group.querySelector('.picker-option:not([hidden])'));
    picker.querySelector('.picker-empty').hidden = visible().length > 0;
  }
  trigger.onclick = () => popup.hidden ? open() : close();
  trigger.onkeydown = event => {if (['ArrowDown','ArrowUp'].includes(event.key)) {event.preventDefault(); event.stopPropagation(); open(); if (event.key === 'ArrowUp') setFocus(visible().at(-1));}};
  search.oninput = filter;
  picker.onkeydown = event => {
    if (popup.hidden) return;
    if (event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); close(true); return;}
    const list = visible(), index = list.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {event.preventDefault(); if(!list.length)return; setFocus(index<0 ? event.key==='ArrowDown' ? list[0] : list.at(-1) : list[(index + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]);}
    else if (index >= 0 && ['Home','End'].includes(event.key)) {event.preventDefault(); setFocus(event.key === 'Home' ? list[0] : list.at(-1));}
  };
  options.forEach(option => option.onclick = () => {close(true); onSelect(option.dataset.calendarChoice);});
  picker.onfocusout = event => {if (event.relatedTarget && !picker.contains(event.relatedTarget)) close();};
  // One document listener survives re-renders; resolve the current picker each time.
  if (!document.documentElement.dataset.calendarPickerDismiss) {
    document.documentElement.dataset.calendarPickerDismiss = 'true';
    document.addEventListener('pointerdown', event => {
      const current = document.querySelector('#calendar-picker');
      if (current && !current.contains(event.target)) {current.querySelector('.calendar-picker-popup').hidden = true; current.querySelector('#calendar-picker-trigger').setAttribute('aria-expanded','false');}
    });
  }
}
