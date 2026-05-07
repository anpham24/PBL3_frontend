"use strict";

const TOKEN_KEY = "token";
const USER_ID_KEY = "userId";
const AVT_URL_KEY = "avtUrl";
const NICKNAME_KEY = "nickname";

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
};

export const getUserId = () => getStorageValue(USER_ID_KEY);

export const setUserId = (userId) => {
	setStorageValue(USER_ID_KEY, userId);
};

export const getAvtUrl = () => getStorageValue(AVT_URL_KEY);

export const setAvtUrl = (avtUrl) => {
	setStorageValue(AVT_URL_KEY, avtUrl);
};

export const getNickname = () => getStorageValue(NICKNAME_KEY);

export const setNickname = (nickname) => {
	setStorageValue(NICKNAME_KEY, nickname);
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

	const currentTime = Math.floor(Date.now() / 1000);
	if (payload.exp && payload.exp < currentTime) {
		clearAuthStorage();
		return null;
	}

	return {
		userId: payload.sub || "",
		userRole: payload.role || "MEMBER"
	};
};

export const saveAuthSession = (token) => {
	setToken(token);
};

export const saveAuthData = ({ token, userId, avtUrl, nickname }) => {
	if (token) {
		setToken(token);
	}
	if (userId) {
		setUserId(userId);
	}
	if (avtUrl) {
		setAvtUrl(avtUrl);
	}
	if (nickname) {
		setNickname(nickname);
	}
};

export const clearAuthStorage = () => {
	removeToken();
	localStorage.removeItem(USER_ID_KEY);
	localStorage.removeItem(AVT_URL_KEY);
	localStorage.removeItem(NICKNAME_KEY);
};

export const getAccessToken = () => getToken();

export const setAccessToken = (token) => {
	setToken(token);
};

export const clearAccessToken = () => {
	removeToken();
};
