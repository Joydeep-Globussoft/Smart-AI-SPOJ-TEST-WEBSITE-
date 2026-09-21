/**
 * Helper to prepare a candidate session for live browser verification on test 'hiring'
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');

dotenv.config({ path: require('path').join(__dirname, '../../../.env') });

const BASE_URL = 'http://localhost:5000/api/v1';
const TEST_ID = '6ab0e5fc8d0b25980be66ed0';
const ROOM_CODE = 'LBQGPQ';
const ROOM_PASS = '7FDE0F22E2';

async function setup() {
  const timestamp = Date.now();
  const email = `live_candidate_${timestamp}@example.com`;
  const name = `Live Candidate ${timestamp.toString().slice(-4)}`;

  // 1. Register candidate
  const regRes = await fetch(`${BASE_URL}/auth/candidate/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      email,
      password: 'Password123!',
    }),
  });
  const regData = await regRes.json();
  const token = regData.token;
  const candidateId = regData.candidate?._id || regData.candidate?.id;

  // 2. Join room
  const joinRes = await fetch(`${BASE_URL}/rooms/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      roomCode: ROOM_CODE,
      roomPassword: ROOM_PASS,
    }),
  });
  const joinData = await joinRes.json();

  // 3. Start attempt
  const startRes = await fetch(`${BASE_URL}/tests/${TEST_ID}/start-attempt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      roomId: joinData.room._id,
    }),
  });
  const startData = await startRes.json();

  const testSession = {
    test: joinData.test,
    room: joinData.room,
    questions: startData.questions,
    submissions: startData.submissions || [],
    candidateStartTime: startData.candidateStartTime,
    candidateEndTime: startData.candidateEndTime,
    submissionSessionId: startData.submissionSessionId,
    candidateId,
  };

  const user = {
    id: candidateId,
    _id: candidateId,
    name,
    email,
    type: 'candidate',
    role: 'CANDIDATE',
  };

  console.log('SETUP_SUCCESS');
  console.log(JSON.stringify({
    token,
    user,
    testSession,
    candidateId,
    name,
    email,
  }));
}

setup().catch(console.error);
