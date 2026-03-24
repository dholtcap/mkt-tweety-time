const { DateTime } = luxon;

const OPEN_HOUR = 9;
const OPEN_MIN = 30;
const CLOSE_HOUR = 16;
const CLOSE_MIN = 0;

function isTradingDay(dt) {
  const weekday = dt.weekday; // 1=Mon … 7=Sun
  if (weekday === 6 || weekday === 7) return false;

  const ymd = `${dt.year}-${String(dt.month).padStart(2, '0')}-${String(dt.day).padStart(2, '0')}`;
  const holidays = new Set([
    // 2025
    '2025-01-01','2025-01-20','2025-02-17','2025-04-18','2025-05-26','2025-06-19',
    '2025-07-04','2025-09-01','2025-11-27','2025-12-25',
    // 2026
    '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19',
    '2026-07-03','2026-09-07','2026-11-26','2026-12-25',
    // 2027
    '2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31','2027-06-18',
    '2027-07-04','2027-09-06','2027-11-25','2027-12-25'
  ]);
  return !holidays.has(ymd);
}

function getLastAndNextMarketEvent(tweetISO) {
  let t = DateTime.fromISO(tweetISO, { zone: 'utc' }).setZone('America/New_York');

  let lastEvent, nextEvent, lastLabel, nextLabel;

  const findPrevTradingDay = (d) => {
    let prev = d.minus({ days: 1 });
    while (!isTradingDay(prev)) prev = prev.minus({ days: 1 });
    return prev;
  };
  const findNextTradingDay = (d) => {
    let nxt = d.plus({ days: 1 });
    while (!isTradingDay(nxt)) nxt = nxt.plus({ days: 1 });
    return nxt;
  };

  const todayOpen = t.startOf('day').set({ hour: OPEN_HOUR, minute: OPEN_MIN });
  const todayClose = t.startOf('day').set({ hour: CLOSE_HOUR, minute: CLOSE_MIN });

  if (!isTradingDay(t)) {
    lastEvent = findPrevTradingDay(t).set({ hour: CLOSE_HOUR, minute: CLOSE_MIN });
    lastLabel = 'Close';
    nextEvent = findNextTradingDay(t).set({ hour: OPEN_HOUR, minute: OPEN_MIN });
    nextLabel = 'Open';
  } else if (t < todayOpen) {
    lastEvent = findPrevTradingDay(t).set({ hour: CLOSE_HOUR, minute: CLOSE_MIN });
    lastLabel = 'Close';
    nextEvent = todayOpen;
    nextLabel = 'Open';
  } else if (t < todayClose) {
    lastEvent = todayOpen;
    lastLabel = 'Open';
    nextEvent = todayClose;
    nextLabel = 'Close';
  } else {
    lastEvent = todayClose;
    lastLabel = 'Close';
    nextEvent = findNextTradingDay(t).set({ hour: OPEN_HOUR, minute: OPEN_MIN });
    nextLabel = 'Open';
  }

  const deltaLast = t.diff(lastEvent, ['hours', 'minutes']).toObject();
  const deltaNext = nextEvent.diff(t, ['hours', 'minutes']).toObject();

  const formatDelta = (delta) => {
    const h = Math.floor(delta.hours || 0);
    const m = Math.round(delta.minutes || 0);
    return `${h > 0 ? h + 'h ' : ''}${m}m`;
  };

  return {
    last: { 
      label: lastLabel, 
      time: lastEvent.toFormat('MMM d HH:mm'), 
      delta: formatDelta(deltaLast) + ' ago' 
    },
    next: { 
      label: nextLabel, 
      time: nextEvent.toFormat('MMM d HH:mm'), 
      delta: 'in ' + formatDelta(deltaNext) 
    }
  };
}

function createModal(info) {
  // Remove any existing modal first
  const existing = document.getElementById('nyse-delta-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'nyse-delta-modal';
  modal.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: #ffffff; color: #0f1419; padding: 24px; border-radius: 16px;
    box-shadow: 0 10px 30px -5px rgba(0,0,0,0.3); z-index: 2147483647; max-width: 380px;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    border: 1px solid #e5e5e5; line-height: 1.4;
  `;

  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h3 style="margin:0;font-size:18px;">NYSE Market Timing</h3>
      <button id="nyse-close-btn" style="background:none;border:none;font-size:24px;cursor:pointer;color:#666;padding:0;width:30px;height:30px;display:flex;align-items:center;justify-content:center;">×</button>
    </div>
    <div style="margin-bottom:16px;">
      <strong>Last ${info.last.label}:</strong> ${info.last.time}<br>
      <span style="color:#10b981;font-weight:600;">${info.last.delta}</span>
    </div>
    <div>
      <strong>Next ${info.next.label}:</strong> ${info.next.time}<br>
      <span style="color:#f59e0b;font-weight:600;">${info.next.delta}</span>
    </div>
    <div style="margin-top:20px;font-size:12px;color:#666;text-align:center;">
      Powered by NYSE hours (9:30–16:00 ET)
    </div>
  `;

  document.body.appendChild(modal);

  // Fix: Proper event listener for the X button
  const closeBtn = document.getElementById('nyse-close-btn');
  closeBtn.addEventListener('click', () => {
    modal.remove();
  });

  // Close when clicking outside the modal
  const closeOnOutsideClick = (e) => {
    if (e.target === modal) {
      modal.remove();
      document.removeEventListener('click', closeOnOutsideClick);
    }
  };
  document.addEventListener('click', closeOnOutsideClick);

  // Close with Escape key
  const closeOnEsc = (e) => {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', closeOnEsc);
    }
  };
  document.addEventListener('keydown', closeOnEsc);
}

function injectButtons() {
  document.querySelectorAll('article[data-testid="tweet"]:not(.nyse-delta-done)').forEach(tweet => {
    tweet.classList.add('nyse-delta-done');

    const timeEl = tweet.querySelector('time');
    if (!timeEl) return;

    const datetime = timeEl.getAttribute('datetime');
    if (!datetime) return;

    const btn = document.createElement('button');
    btn.textContent = '📈';
    btn.title = 'Show NYSE time deltas';
    btn.style.cssText = `
      margin-left: 8px; background: #1d9bf0; color: white; border: none;
      border-radius: 9999px; padding: 2px 9px; font-size: 13px; cursor: pointer;
      font-weight: 600; line-height: 1;
    `;

    btn.addEventListener('click', (e) => {
      e.stopImmediatePropagation();
      e.preventDefault();
      const info = getLastAndNextMarketEvent(datetime);
      createModal(info);
    });

    const container = timeEl.parentElement;
    if (container) {
      container.style.display = 'flex';
      container.style.alignItems = 'center';
      container.appendChild(btn);
    }
  });
}

// Observer for dynamically loaded tweets
const observer = new MutationObserver(injectButtons);
observer.observe(document.documentElement, { childList: true, subtree: true });

// Initial injection
window.addEventListener('load', () => {
  setTimeout(injectButtons, 800);
  setTimeout(injectButtons, 2500);
});

console.log('%c✅ NYSE Tweet Delta loaded – click the 📈 button on any tweet', 'color:#1d9bf0;font-weight:bold');
