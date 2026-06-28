(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UsagePace = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MINUTE_MS = 60 * 1000;
  const HOUR_MS = 60 * MINUTE_MS;
  const DAY_MS = 24 * HOUR_MS;
  const SESSION_MS = 5 * HOUR_MS;
  const WEEK_MS = 7 * DAY_MS;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function parseRelativeReset(text, referenceMs) {
    const japanese = text.match(/(?:(\d+)\s*時間)?\s*(?:(\d+)\s*分)?\s*後にリセット/);
    if (japanese && (japanese[1] || japanese[2])) {
      const hours = Number(japanese[1] || 0);
      const minutes = Number(japanese[2] || 0);
      return referenceMs + (hours * HOUR_MS) + (minutes * MINUTE_MS);
    }

    const english = text.match(
      /resets?\s+in\s+(?:(\d+)\s*(?:h|hr|hrs|hour|hours))?\s*(?:(\d+)\s*(?:m|min|mins|minute|minutes))?/i
    );
    if (english && (english[1] || english[2])) {
      const hours = Number(english[1] || 0);
      const minutes = Number(english[2] || 0);
      return referenceMs + (hours * HOUR_MS) + (minutes * MINUTE_MS);
    }
    return null;
  }

  function parseClockReset(text, referenceMs) {
    const match = text
      .replace(/：/g, ':')
      .match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!match) return null;

    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    const meridiem = (match[3] || '').toUpperCase();
    if (minutes > 59 || hours > 23) return null;
    if (meridiem) {
      if (hours < 1 || hours > 12) return null;
      if (meridiem === 'AM') hours = hours === 12 ? 0 : hours;
      if (meridiem === 'PM') hours = hours === 12 ? 12 : hours + 12;
    }

    const reference = new Date(referenceMs);
    const reset = new Date(referenceMs);
    reset.setHours(hours, minutes, 0, 0);
    if (reset.getTime() <= reference.getTime()) reset.setDate(reset.getDate() + 1);
    return reset.getTime();
  }

  function parseDatedReset(text, referenceMs) {
    const normalized = text.replace(/：/g, ':');
    const numeric = normalized.match(
      /(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})(?:\D+(\d{1,2}):(\d{2}))?/
    );
    if (numeric) {
      const reset = new Date(
        Number(numeric[1]),
        Number(numeric[2]) - 1,
        Number(numeric[3]),
        Number(numeric[4] || 0),
        Number(numeric[5] || 0),
        0,
        0
      );
      return reset.getTime();
    }

    const weekday = normalized.match(
      /(\d{1,2}):(\d{2})\s*[（(]?\s*([日月火水木金土])(?:曜日)?\s*[）)]?/
    );
    if (weekday) {
      const dayIndex = '日月火水木金土'.indexOf(weekday[3]);
      const reference = new Date(referenceMs);
      const reset = new Date(referenceMs);
      reset.setHours(Number(weekday[1]), Number(weekday[2]), 0, 0);
      let daysAhead = (dayIndex - reference.getDay() + 7) % 7;
      if (daysAhead === 0 && reset.getTime() <= referenceMs) daysAhead = 7;
      reset.setDate(reset.getDate() + daysAhead);
      return reset.getTime();
    }
    return null;
  }

  function parseResetAt(resetText, referenceMs, options) {
    if (!resetText || !Number.isFinite(referenceMs)) return null;
    const text = String(resetText).replace(/\s+/g, ' ').trim();
    const dated = parseDatedReset(text, referenceMs);
    if (dated) return dated;
    const relative = parseRelativeReset(text, referenceMs);
    if (relative) return relative;
    if (options && options.allowClock === false) return null;
    return parseClockReset(text, referenceMs);
  }

  function formatClock(ms) {
    return new Intl.DateTimeFormat('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(new Date(ms));
  }

  function formatRemaining(ms) {
    if (ms <= 0) return '';
    const totalMinutes = Math.max(1, Math.ceil(ms / MINUTE_MS));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes}分`;
    if (minutes === 0) return `${hours}時間`;
    return `${hours}時間${minutes}分`;
  }

  function classifyPeriodPace(used, elapsedMs, durationMs, pendingMs, pendingUsed) {
    if (!Number.isFinite(used) || elapsedMs < 0) {
      return { kind: 'unknown', label: '判定できません', projected: null };
    }

    if (used >= 100) {
      return { kind: 'exhausted', label: '上限到達', projected: 100 };
    }

    if (elapsedMs < pendingMs && used < pendingUsed) {
      return { kind: 'pending', label: '判定中', projected: null };
    }

    const elapsedRatio = clamp(elapsedMs / durationMs, 0.01, 1);
    const projected = Math.round(used / elapsedRatio);
    if (projected >= 140) return { kind: 'very-fast', label: '非常に速い', projected };
    if (projected >= 100) return { kind: 'fast', label: '速い', projected };
    if (projected >= 85) return { kind: 'slightly-fast', label: 'やや速い', projected };
    if (projected >= 60) return { kind: 'steady', label: '標準', projected };
    return { kind: 'relaxed', label: '余裕', projected };
  }

  function classifyPace(used, elapsedMs) {
    return classifyPeriodPace(used, elapsedMs, SESSION_MS, 20 * MINUTE_MS, 5);
  }

  function weekdayDurationBetween(startMs, endMs) {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
    let cursor = startMs;
    let total = 0;
    while (cursor < endMs) {
      const current = new Date(cursor);
      const nextDay = new Date(cursor);
      nextDay.setHours(24, 0, 0, 0);
      const segmentEnd = Math.min(endMs, nextDay.getTime());
      const day = current.getDay();
      if (day !== 0 && day !== 6) total += segmentEnd - cursor;
      cursor = segmentEnd;
    }
    return total;
  }

  function getPeriodInfo(section, capturedAt, nowMs, options) {
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    const reference = Number.isFinite(capturedAt) ? capturedAt : now;
    const durationMs = options.durationMs;
    const resetAt = parseResetAt(section && section.resetText, reference, {
      allowClock: options.allowClock !== false
    });
    if (!Number.isFinite(resetAt)) {
      return {
        resetAt: null,
        resetLabel: 'リセット時刻を取得できません',
        expectedUsed: null,
        pace: { kind: 'unknown', label: '判定できません', projected: null }
      };
    }

    const remainingAtCapture = resetAt - reference;
    if (remainingAtCapture < 0 || remainingAtCapture > durationMs + options.toleranceMs) {
      return {
        resetAt,
        resetLabel: `${formatClock(resetAt)}にリセット`,
        expectedUsed: null,
        pace: { kind: 'unknown', label: '判定できません', projected: null }
      };
    }

    const remainingNow = resetAt - now;
    const resetLabel = remainingNow > 0
      ? `${formatClock(resetAt)}にリセット（あと${formatRemaining(remainingNow)}）`
      : `${formatClock(resetAt)}にリセット済み`;

    let paceDurationMs = durationMs;
    let elapsedMs = clamp(durationMs - remainingAtCapture, 0, durationMs);
    if (options.weekdaysOnly) {
      const cycleStart = resetAt - durationMs;
      paceDurationMs = weekdayDurationBetween(cycleStart, resetAt);
      elapsedMs = weekdayDurationBetween(cycleStart, reference);
    }
    const expectedUsed = paceDurationMs > 0
      ? Math.round((elapsedMs / paceDurationMs) * 100)
      : null;
    const used = section && Number.isFinite(section.percentUsed)
      ? clamp(section.percentUsed, 0, 100)
      : null;

    return {
      resetAt,
      resetLabel,
      expectedUsed,
      pace: expectedUsed == null
        ? { kind: 'unknown', label: '判定できません', projected: null }
        : classifyPeriodPace(
            used,
            elapsedMs,
            paceDurationMs,
            options.pendingMs,
            options.pendingUsed
          )
    };
  }

  function getSessionInfo(section, capturedAt, nowMs) {
    return getPeriodInfo(section, capturedAt, nowMs, {
      durationMs: SESSION_MS,
      pendingMs: 20 * MINUTE_MS,
      pendingUsed: 5,
      toleranceMs: 10 * MINUTE_MS,
      allowClock: true
    });
  }

  function getWeeklyInfo(section, capturedAt, nowMs, mode) {
    return getPeriodInfo(section, capturedAt, nowMs, {
      durationMs: WEEK_MS,
      pendingMs: 12 * HOUR_MS,
      pendingUsed: 10,
      toleranceMs: HOUR_MS,
      allowClock: false,
      weekdaysOnly: mode === 'weekdays'
    });
  }

  return {
    SESSION_MS,
    WEEK_MS,
    parseResetAt,
    formatRemaining,
    classifyPace,
    weekdayDurationBetween,
    getSessionInfo,
    getWeeklyInfo
  };
});
