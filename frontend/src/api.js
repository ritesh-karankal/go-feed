import axios from 'axios';

const API_BASE = '/v1';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Request interceptor: attach JWT ────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gofeed_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response interceptor ────────────────────────────────────────────────────
// The backend wraps every success response in { "data": <payload> }.
// Unwrap it here so callers get res.data = the actual payload directly.
api.interceptors.response.use(
  (response) => {
    // Only unwrap if the body has a "data" key (the backend's envelope)
    if (response.data && Object.prototype.hasOwnProperty.call(response.data, 'data')) {
      response.data = response.data.data;
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('gofeed_token');
      localStorage.removeItem('gofeed_user');
      const path = window.location.pathname;
      if (path !== '/login' && path !== '/register' && !path.startsWith('/confirm')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth ────────────────────────────────────────────────────────────────────
export const register = (data) => api.post('/authentication/user', data);
// res.data → { id, username, email, ... , token: "activation-plain-token" }

export const login = (data) => api.post('/authentication/token', data);
// res.data → "jwt-token-string"  (after envelope unwrap)

export const activateUser = (token) => api.put(`/users/activate/${token}`);

// ─── Users ───────────────────────────────────────────────────────────────────
export const getUser = (userID) => api.get(`/users/${userID}`);
export const getUserPosts = (userID) => api.get(`/users/${userID}/posts`);
// res.data → { id, username, email, role, ... }

export const followUser = (userID) => api.put(`/users/${userID}/follow`);
export const unfollowUser = (userID) => api.put(`/users/${userID}/unfollow`);
export const getUserFollowers = (userID) => api.get(`/users/${userID}/followers`);
export const getUserFollowing = (userID) => api.get(`/users/${userID}/following`);
export const getUserFollowCounts = (userID) => api.get(`/users/${userID}/follow-counts`);
export const getFollowStatus = (userID) => api.get(`/users/${userID}/follow-status`);
export const getSuggestedUsers = (limit = 5) => api.get(`/users/suggested?limit=${limit}`);

// ─── Feed ─────────────────────────────────────────────────────────────────────
export const getFeed = (params = {}) => {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);
  if (params.tags && params.tags.length) searchParams.set('tags', params.tags.join(','));
  if (params.sort) searchParams.set('sort', params.sort);
  if (params.filter) searchParams.set('filter', params.filter);
  if (params.limit) searchParams.set('limit', params.limit);
  if (params.offset) searchParams.set('offset', params.offset);
  const qs = searchParams.toString();
  return api.get(`/users/feed${qs ? '?' + qs : ''}`);
};
// res.data → [] | PostWithMetadata[]  (null from Go becomes null here)

// ─── Posts ───────────────────────────────────────────────────────────────────
export const getPost = (id) => api.get(`/posts/${id}`);
export const createPost = (data) => api.post('/posts', data);
export const updatePost = (id, data) => api.patch(`/posts/${id}`, data);
export const deletePost = (id) => api.delete(`/posts/${id}`);
export const createComment = (postID, data) => api.post(`/posts/${postID}/comments`, data);

export default api;
