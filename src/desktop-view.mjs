// Desktop controls share the planner's existing actions and preference model.
export function desktopView({state, displays, heading, toggle, appearance, esc}) {
  const p = state.preferences;
  return heading('Desktop', 'Your day stays in sight, even when the planner is closed.', null) + `
    <div class="settings desktop-settings">
      <section aria-labelledby="overlay-heading">
        <div class="section-head"><h2 id="overlay-heading">Interactive overlays</h2><span role="status">${p.widget || p.widgetProjects ? 'Enabled' : 'Hidden'}</span></div>
        <p class="muted small">Your tasks sit directly on your wallpaper, with no surrounding window or separate taskbar icon. Completed tasks keep a green check until their due date has passed. Tasks without a due date stay visible.</p>
        ${toggle('widget', 'Daily tasks overlay', 'Keep tasks and reminders on your desktop.')}
        ${toggle('widgetProjects', 'Projects overlay', 'Show project work in its own space.')}
        <div class="setting"><div><h3>Placement</h3><p>Choose whether overlays sit behind your apps or above them.</p></div>
          <select id="widget-layer" aria-label="Overlay placement"><option value="desktop" ${(p.widgetLayer || (p.alwaysOnTop ? 'topmost' : 'desktop')) === 'desktop' ? 'selected' : ''}>On desktop</option><option value="topmost" ${(p.widgetLayer || (p.alwaysOnTop ? 'topmost' : 'desktop')) === 'topmost' ? 'selected' : ''}>Above other apps</option></select></div>
        ${toggle('widgetClickThrough', 'Click through overlays', 'Clicks pass to the desktop. Turn this off here or from the Munka tray menu to interact again.')}
        ${toggle('launchAtLogin', 'Start with Windows', 'Keep Munka ready after you sign in. You can turn this off anytime.')}
        ${p.overlayError ? `<p class="inline-error" role="status">${esc(p.overlayError)}</p>` : ''}
        <div class="desktop-actions"><button data-action="widget-recover">Find my widgets</button><span class="muted small">Restores clicks and brings enabled widgets back onto your screen.</span></div>
        ${appearance()}
        <p class="desktop-tip small">Drag the monkey header to move a widget. <strong>Appearance & position</strong> offers a display picker and keyboard controls. Close the planner to keep widgets available; use its tray menu to quit completely.</p>
      </section>
      <section class="section-block" aria-labelledby="wallpaper-heading">
        <h2 id="wallpaper-heading">Wallpaper reminders</h2>
        <p class="muted small">A still image of your tasks over a background you choose. Use the interactive overlays for task actions.</p>
        <button data-action="wallpaper-preview">Preview wallpaper</button>
        ${toggle('wallpaper', 'Wallpaper reminders', 'Preview first, then choose whether to replace your background.')}
        <div class="setting"><h3>Placement</h3><select id="wallpaper-position" aria-label="Wallpaper placement"><option value="right" ${p.wallpaperPosition === 'right' ? 'selected' : ''}>Right</option><option value="left" ${p.wallpaperPosition === 'left' ? 'selected' : ''}>Left</option></select></div>
        <div class="setting"><h3>Display</h3><select id="wallpaper-display" aria-label="Wallpaper display">${displays.length ? displays.map(d => `<option value="${d.id}" ${p.wallpaperDisplay === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('') : '<option>Primary display</option>'}</select></div>
        <div class="setting"><h3>Visible reminders</h3><select id="wallpaper-count" aria-label="Visible reminders">${[3,5,8].map(n => `<option ${Number(p.wallpaperCount) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        ${p.wallpaperError ? `<p class="inline-error" role="status">${esc(p.wallpaperError)}</p>` : ''}
      </section>
      <section class="section-block" aria-labelledby="privacy-heading"><h2 id="privacy-heading">Privacy and background activity</h2>
        ${toggle('privacy', 'Hide task details on desktop', 'Use generic labels on overlays and wallpaper.')}
        ${toggle('background', 'Keep running in the tray', 'Closing the planner keeps reminders active. Quit Munka from the tray to stop background activity.')}
      </section>
    </div>`;
}
