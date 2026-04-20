"use strict";

const TOKEN_KEY = "authToken";
const USER_ID_KEY = "authUserId";
const USER_ROLE_KEY = "authRole";

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

export const saveAuthSession = ({ token, userId, role } = {}) => {
	setToken(token);
	setUserId(userId);
	setUserRole(role);
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
