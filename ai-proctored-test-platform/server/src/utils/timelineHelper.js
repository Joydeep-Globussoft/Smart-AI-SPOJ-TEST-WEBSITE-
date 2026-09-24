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
 * 1. roomJoinedAt is the earliest valid room-entry / registration / login event.
 * 2. roomJoinedAt <= testStartedAt <= testEndedAt.
 * 3. Any timeline violation is logged with candidateId, testId, and roomId.
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
  const dates = [
    parseDate(roomJoinedAtRaw),
    parseDate(candidateRoomJoinedAt),
    parseDate(candidateLastLoginAt),
    parseDate(candidateCreatedAt),
  ].filter(Boolean);

  const rawStart = parseDate(testStartedAtRaw);
  const rawEnd = parseDate(testEndedAtRaw);

  // 1. Establish canonical roomJoinedAt from earliest recorded entry/registration/login event
  let canonicalRoomJoin = null;
  if (dates.length > 0) {
    canonicalRoomJoin = dates.reduce((earliest, d) => (d.getTime() < earliest.getTime() ? d : earliest), dates[0]);
  }

  // 2. Validate chronological order: roomJoinedAt must NOT be after testStartedAt
  if (canonicalRoomJoin && rawStart && canonicalRoomJoin.getTime() > rawStart.getTime()) {
    console.warn(
      `[BUG-022 Data Inconsistency] Candidate ${candidateId || 'unknown'} in Test ${testId || 'unknown'} (Room: ${roomId || 'unknown'}) has roomJoinedAt (${canonicalRoomJoin.toISOString()}) > testStartedAt (${rawStart.toISOString()}). Correcting to earliest valid timestamp.`
    );
    const validEarlier = dates.filter((d) => d.getTime() <= rawStart.getTime());
    if (validEarlier.length > 0) {
      canonicalRoomJoin = validEarlier.reduce((earliest, d) => (d.getTime() < earliest.getTime() ? d : earliest), validEarlier[0]);
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
