// Timeline Helper — BUG-022: Canonical Candidate Timeline & Chronological Consistency Enforcement
// Enforces single source of truth and strict chronological order:
// roomJoinedAt <= testStartedAt <= testEndedAt

/**
 * Parses any date/timestamp input into a valid Date object or null.
 * @param {Date|string|number} val
 * @returns {Date|null}
 */
function parseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Resolves the canonical timeline timestamps for a candidate.
 * Guarantees that:
 * 1. roomJoinedAt is the primary room-specific join timestamp (room.joinedCandidates[].joinedAt).
 * 2. roomJoinedAt <= testStartedAt <= testEndedAt.
 * 3. Never falls back to multi-day-old candidate account creation timestamps for modern test attempts.
 *
 * @param {Object} params
 * @param {Date|string|number} [params.roomJoinedAtRaw] - Timestamp from room.joinedCandidates[].joinedAt
 * @param {Date|string|number} [params.candidateCreatedAt] - Candidate account creation / registration timestamp
 * @param {Date|string|number} [params.candidateLastLoginAt] - Candidate login timestamp
 * @param {Date|string|number} [params.candidateRoomJoinedAt] - Candidate room joined timestamp
 * @param {Date|string|number} [params.testStartedAtRaw] - Timestamp of candidate clicking Start Test / Enter Fullscreen (candidateStartTime)
 * @param {Date|string|number} [params.testEndedAtRaw] - Timestamp of submission / auto-submission / disqualification (submittedAt)
 * @param {string} [params.candidateId] - Identifier for diagnostic logging
 * @param {string} [params.testId] - Identifier for diagnostic logging
 * @param {string} [params.roomId] - Identifier for diagnostic logging
 * @returns {{ roomJoinedAt: Date|null, testStartedAt: Date|null, testEndedAt: Date|null }}
 */
function resolveCandidateTimelines({
  roomJoinedAtRaw,
  candidateCreatedAt,
  candidateLastLoginAt,
  candidateRoomJoinedAt,
  testStartedAtRaw,
  testEndedAtRaw,
  candidateId,
  testId,
  roomId,
}) {
  const rawJoin = parseDate(roomJoinedAtRaw);
  const rawStart = parseDate(testStartedAtRaw);
  const rawEnd = parseDate(testEndedAtRaw);
  const rawRoomJoinCand = parseDate(candidateRoomJoinedAt);
  const rawLastLogin = parseDate(candidateLastLoginAt);
  const rawCreated = parseDate(candidateCreatedAt);

  // 1. Establish canonical roomJoinedAt:
  // Primary preference is the authoritative room join timestamp (room.joinedCandidates[].joinedAt)
  let canonicalRoomJoin = rawJoin;

  // If no room-specific joinedAt recorded, resolve from session login/registration timestamps
  if (!canonicalRoomJoin) {
    if (rawStart) {
      // Pick the closest login/roomJoin timestamp that is before or equal to testStartedAt (within 12h session window)
      const twelveHoursMs = 12 * 60 * 60 * 1000;
      const sessionCandidates = [rawRoomJoinCand, rawLastLogin, rawCreated].filter(
        (d) => d && d.getTime() <= rawStart.getTime() && (rawStart.getTime() - d.getTime()) <= twelveHoursMs
      );
      if (sessionCandidates.length > 0) {
        // Pick the earliest within this session window
        canonicalRoomJoin = sessionCandidates.reduce((earliest, d) => (d.getTime() < earliest.getTime() ? d : earliest), sessionCandidates[0]);
      }
    } else {
      // Unstarted candidate
      canonicalRoomJoin = rawRoomJoinCand || rawLastLogin || rawCreated || null;
    }
  }

  // 2. Validate chronological order: roomJoinedAt must NOT be after testStartedAt
  if (canonicalRoomJoin && rawStart && canonicalRoomJoin.getTime() > rawStart.getTime()) {
    console.warn(
      `[BUG-022 Data Inconsistency] Candidate ${candidateId || 'unknown'} in Test ${testId || 'unknown'} (Room: ${roomId || 'unknown'}) has roomJoinedAt (${canonicalRoomJoin.toISOString()}) > testStartedAt (${rawStart.toISOString()}). Correcting to earliest valid session timestamp.`
    );
    const twelveHoursMs = 12 * 60 * 60 * 1000;
    const sessionCandidates = [rawRoomJoinCand, rawLastLogin, rawCreated].filter(
      (d) => d && d.getTime() <= rawStart.getTime() && (rawStart.getTime() - d.getTime()) <= twelveHoursMs
    );
    if (sessionCandidates.length > 0) {
      canonicalRoomJoin = sessionCandidates.reduce((earliest, d) => (d.getTime() < earliest.getTime() ? d : earliest), sessionCandidates[0]);
    } else {
      canonicalRoomJoin = rawStart;
    }
  }

  // If candidate has started test but had no roomJoinedAt recorded at all, fallback to testStartedAt
  if (!canonicalRoomJoin) {
    canonicalRoomJoin = rawStart || null;
  }

  // 3. Validate chronological order: testStartedAt must NOT be after testEndedAt
  let canonicalTestStart = rawStart;
  let canonicalTestEnd = rawEnd;

  if (canonicalTestStart && canonicalTestEnd && canonicalTestStart.getTime() > canonicalTestEnd.getTime()) {
    console.warn(
      `[BUG-022 Data Inconsistency] Candidate ${candidateId || 'unknown'} in Test ${testId || 'unknown'} has testStartedAt (${canonicalTestStart.toISOString()}) > testEndedAt (${canonicalTestEnd.toISOString()}). Correcting to match testEndedAt.`
    );
    canonicalTestStart = canonicalTestEnd;
  }

  return {
    roomJoinedAt: canonicalRoomJoin,
    testStartedAt: canonicalTestStart,
    testEndedAt: canonicalTestEnd,
  };
}

module.exports = {
  parseDate,
  resolveCandidateTimelines,
};
