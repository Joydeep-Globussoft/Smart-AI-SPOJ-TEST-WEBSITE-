import React, { createContext, useContext, useState, useCallback } from 'react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

// Configure axios defaults
axios.defaults.baseURL = API_BASE;

// Request interceptor — attach JWT token
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    if (config.headers && typeof config.headers.set === 'function') {
      config.headers.set('Authorization', `Bearer ${token}`);
    } else {
      config.headers = config.headers || {};
      config.headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return config;
});

// Response interceptor — handle token expiry
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && !original.url?.includes('/auth/')) {
      original._retry = true;
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const { data } = await axios.post('/auth/refresh', { refreshToken });
          localStorage.setItem('token', data.token);
          if (original.headers && typeof original.headers.set === 'function') {
            original.headers.set('Authorization', `Bearer ${data.token}`);
          } else {
            original.headers = original.headers || {};
            original.headers['Authorization'] = `Bearer ${data.token}`;
          }
          return axios(original);
        } catch {
          localStorage.clear();
          window.location.href = '/';
        }
      }
    }
    return Promise.reject(error);
  }
);

// ── API client functions ───────────────────────────────────────────────────────
export const api = {
  // Auth
  adminLogin: (data) => axios.post('/auth/admin/login', data),
  adminCreate: (data) => axios.post('/auth/admin/create', data),
  candidateRegister: (data) => axios.post('/auth/candidate/register', data),
  candidateLogin: (data) => axios.post('/auth/candidate/login', data),
  logout: () => axios.post('/auth/logout'),

  // Profile (Any Admin - BUG-04)
  getMyProfile: () => axios.get('/admins/me'),
  updateMyProfile: (data) => axios.patch('/admins/me', data),
  updateMyPassword: (data) => axios.patch('/admins/me/password', data),

  // Admin Management (Super Admin only - BUG-01)
  getAdmins: (params) => axios.get('/admins', { params }),
  getAdmin: (id) => axios.get(`/admins/${id}`),
  updateAdmin: (id, data) => axios.patch(`/admins/${id}`, data),
  deactivateAdmin: (id) => axios.patch(`/admins/${id}/deactivate`),
  activateAdmin: (id) => axios.patch(`/admins/${id}/activate`),
  deleteAdmin: (id) => axios.delete(`/admins/${id}`),

  // Tests
  createTest: (data) => axios.post('/tests', data),
  getTests: () => axios.get('/tests'),
  getTest: (id) => axios.get(`/tests/${id}`),
  updateTest: (id, data) => axios.patch(`/tests/${id}`, data),
  updatePassingCriteria: (id, data) => axios.patch(`/tests/${id}/passing-criteria`, data),
  updateMalpracticeThreshold: (id, data) => axios.patch(`/tests/${id}/malpractice-threshold`, data),
  deleteTest: (id) => axios.delete(`/tests/${id}`),
  startTest: (id) => axios.post(`/tests/${id}/start`),
  endTest: (id) => axios.post(`/tests/${id}/end`),

  // Rooms
  createRoom: (testId, data) => axios.post(`/tests/${testId}/rooms`, data),
  getRooms: (testId) => axios.get(`/tests/${testId}/rooms`),
  getLiveCandidates: (testId) => axios.get(`/tests/${testId}/live-candidates`),
  deleteRoom: (roomId) => axios.delete(`/rooms/${roomId}`),
  getRoomCandidates: (roomId) => axios.get(`/rooms/${roomId}/candidates`),
  requestLateJoin: (roomId, candidateId) => axios.post(`/rooms/${roomId}/candidates/${candidateId}/late-join-request`),
  allowLateJoin: (roomId, candidateId) => axios.post(`/rooms/${roomId}/candidates/${candidateId}/allow-late-entry`),
  dismissLateJoin: (roomId, candidateId) => axios.post(`/rooms/${roomId}/candidates/${candidateId}/dismiss-late-join`),
  getLateJoinStatus: (candidateId) => axios.get(`/candidates/${candidateId}/late-join-status`),
  getPendingLateJoins: (testId) => axios.get(`/tests/${testId}/pending-late-joins`),

  // Question Sets
  createQuestionSet: (data) => axios.post('/question-sets', data),
  getQuestionSets: () => axios.get('/question-sets'),
  updateQuestionSet: (setId, data) => axios.patch(`/question-sets/${setId}`, data),
  deleteQuestionSet: (setId) => axios.delete(`/question-sets/${setId}`),
  createQuestion: (setId, data) => axios.post(`/question-sets/${setId}/questions`, data),
  getQuestions: (setId) => axios.get(`/question-sets/${setId}/questions`),
  updateQuestion: (qId, data) => axios.patch(`/questions/${qId}`, data),
  deleteQuestion: (qId) => axios.delete(`/questions/${qId}`),

  // Candidate Test-Taking
  joinRoom: (data) => axios.post('/rooms/join', data),
  startAttempt: (testId, data) => axios.post(`/tests/${testId}/start-attempt`, data),
  getQuestion: (testId, qId) => axios.get(`/tests/${testId}/questions/${qId}`),
  runCode: (qId, data) => axios.post(`/submissions/${qId}/run`, data),
  saveCode: (qId, data) => axios.post(`/submissions/${qId}/save`, data),
  submitCode: (qId, data) => axios.post(`/submissions/${qId}/submit`, data),
  submitAll: (testId) => axios.post(`/tests/${testId}/submit-all`),

  // AI Test
  aiChat: (qId, data) => axios.post(`/ai-test/${qId}/chat`, data),
  saveFiles: (qId, data) => axios.post(`/ai-test/${qId}/save-files`, data),
  submitAiTest: (qId, data) => axios.post(`/ai-test/${qId}/submit`, data),
  getPreview: (qId) => axios.get(`/ai-test/${qId}/preview`),

  // Proctoring
  submitFrame: (testId, formData) =>
    axios.post(`/proctoring/${testId}/frame`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  reportViolation: (data) => axios.post('/proctoring/violation', data),
  reportCameraDisconnected: (data) => axios.post('/proctoring/camera-disconnected', data),
  reportCameraReconnected: (data) => axios.post('/proctoring/camera-reconnected', data),
  getViolationCount: (testId) => axios.get(`/proctoring/${testId}/violation-count`),
  reviewMalpractice: (logId, data) => axios.patch(`/malpractice-logs/${logId}/review`, data),
  getCandidateMalpracticeLogs: (testId, candidateId) =>
    axios.get(`/tests/${testId}/candidates/${candidateId}/malpractice-logs`),
  getTestMalpracticeLogs: (testId, params) =>
    axios.get(`/tests/${testId}/malpractice-logs`, { params }),

  // Evaluation / Reports
  getResults: (testId) => axios.get(`/tests/${testId}/results`),
  getShortlist: (testId) => axios.get(`/tests/${testId}/shortlist`),
  regenerateShortlist: (testId) => axios.post(`/tests/${testId}/shortlist/regenerate`),
  exportShortlistPdf: (testId) =>
    axios.get(`/tests/${testId}/shortlist/export-pdf`, { responseType: 'blob' }),
  getCopyPasteLog: (submissionId) =>
    axios.get(`/submissions/${submissionId}/copy-paste-log`),
};

export default api;
