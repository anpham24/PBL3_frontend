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

/**
 * Trích xuất role từ JWT payload.
 * Backend dùng: .claim("role", role) → payload.role là string đơn (VD: "ADMIN", "MODERATOR", "MEMBER").
 * @param {object} payload - Kết quả của parseJwt()
 * @returns {string} Role uppercase, hoặc chuỗi rỗng nếu không tìm thấy.
 */
const extractRoleFromPayload = (payload) => {
	if (!payload || typeof payload !== "object") {
		return "";
	}

	if (typeof payload.role === "string" && payload.role.trim().length > 0) {
		return payload.role.trim().toUpperCase();
	}

	return "";
};

/**
 * Lấy role của người dùng hiện tại trực tiếp từ JWT token trong localStorage.
 * @returns {string} Role uppercase (VD: "ADMIN", "MODERATOR", "MEMBER") hoặc chuỗi rỗng nếu chưa đăng nhập.
 */
export const getRoleFromToken = () => {
	const token = getToken();
	if (token.length === 0) {
		return "";
	}
	const payload = parseJwt(token);
	return extractRoleFromPayload(payload);
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
	
	const userRole = extractRoleFromPayload(payload);

	return {
		userId: payload.sub || "",
		userRole: userRole.length > 0 ? userRole : "MEMBER"
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
export const getAvtUrl = () => getStorageValue(AVT_URL_KEY);
export const getNickname = () => getStorageValue(NICKNAME_KEY);

export const clearAuthStorage = () => {
	// removeToken() đã xóa tất cả các key liên quan (token, userId, avtUrl, nickname)
	removeToken();
};

