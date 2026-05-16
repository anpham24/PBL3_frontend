"use strict";

const TOKEN_KEY = "authToken";
const USER_ID_KEY = "authUserId";
const USER_ROLE_KEY = "authRole";
const AVT_URL_KEY = "authAvtUrl";
const NICKNAME_KEY = "authNickname";

const normalizeStoredValue = (value) => {
	if (typeof value !== "string") {
		return "";
	}

	const trimmedValue = value.trim();
	return trimmedValue.length > 0 ? trimmedValue : "";
};

const getStorageValue = (key) => normalizeStoredValue(localStorage.getItem(key));

const setStorageValue = (key, value) => {
	const normalizedValue = normalizeStoredValue(value);

	if (normalizedValue.length === 0) {
		localStorage.removeItem(key);
		return;
	}

	localStorage.setItem(key, normalizedValue);
};

export const getToken = () => getStorageValue(TOKEN_KEY);

export const setToken = (token) => {
	setStorageValue(TOKEN_KEY, token);
};

export const removeToken = () => {
	localStorage.removeItem(TOKEN_KEY);
	localStorage.removeItem(USER_ID_KEY);
	localStorage.removeItem(AVT_URL_KEY);
	localStorage.removeItem(NICKNAME_KEY);
};

export const parseJwt = (token) => {
	if (!token || typeof token !== "string") {
		return null;
	}

	try {
		const base64Url = token.split(".")[1];
		if (!base64Url) {
			return null;
		}

		const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
		const jsonPayload = decodeURIComponent(
			atob(base64)
				.split("")
				.map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
				.join("")
		);
		return JSON.parse(jsonPayload);
	} catch (error) {
		return null;
	}
};

export const getCurrentUser = () => {
	const token = getToken();
	if (token.length === 0) {
		return null;
	}

	const payload = parseJwt(token);
	if (!payload) {
		return null;
	}

	// Bỏ qua check exp để dễ dàng test với token có sẵn (mock data)
	// const currentTime = Math.floor(Date.now() / 1000);
	// if (payload.exp && payload.exp < currentTime) {
	// 	clearAuthStorage();
	// 	return null;
	// }

	return {
		userId: payload.sub || "",
		userRole: payload.role || "MEMBER"
	};
};

/**
 * Lưu toàn bộ thông tin phiên đăng nhập vào localStorage.
 * @param {string} token - JWT access token.
 * @param {{ userId?: string, avtUrl?: string, nickname?: string }} [userDetails={}] - Thông tin bổ sung từ API.
 */
export const saveAuthSession = (token, userDetails = {}) => {
	setToken(token);
	setStorageValue(USER_ID_KEY, userDetails.userId ?? "");
	setStorageValue(AVT_URL_KEY, userDetails.avtUrl ?? "");
	setStorageValue(NICKNAME_KEY, userDetails.nickname ?? "");
};

export const getUserId = () => getStorageValue(USER_ID_KEY);

export const setUserId = (userId) => {
	setStorageValue(USER_ID_KEY, userId);
};

export const removeUserId = () => {
	localStorage.removeItem(USER_ID_KEY);
};

export const getUserRole = () => getStorageValue(USER_ROLE_KEY).toUpperCase();

export const setUserRole = (role) => {
	setStorageValue(USER_ROLE_KEY, role);
};

export const removeUserRole = () => {
	localStorage.removeItem(USER_ROLE_KEY);
};

export const clearAuthStorage = () => {
	removeToken();
	removeUserId();
	removeUserRole();
};

export const getAccessToken = () => getToken();

export const setAccessToken = (token) => {
	setToken(token);
};

export const clearAccessToken = () => {
	removeToken();
};

export const updateAvatarSession = (newAvtUrl) => {
	if (newAvtUrl) {
		setStorageValue(AVT_URL_KEY, newAvtUrl);
	}
};