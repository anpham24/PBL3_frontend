"use strict";

import { clearAuthStorage, getToken } from "../utils/auth.js";

// Đặt link server Backend Java của bạn ở đây
const BASE_URL = "http://localhost:8080/mxh";

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
	failedQueue.forEach((prom) => {
		if (error) prom.reject(error);
		else prom.resolve(token);
	});
	failedQueue = [];
};

const isFormData = (value) => typeof FormData !== "undefined" && value instanceof FormData;

const parseJsonSafely = async (response) => {
	try {
		return await response.json();
	} catch {
		return null;
	}
};

const buildApiError = (response, responseData) => {
	const fallbackMessage = `Yeu cau that bai (${response.status}).`;
	const message =
		typeof responseData?.message === "string" && responseData.message.trim().length > 0
			? responseData.message.trim()
			: fallbackMessage;

	const error = new Error(message);
	error.status = response.status;
	error.data = responseData;
	return error;
};

const isAuthPage = () => {
	const currentPath = window.location.pathname.toLowerCase();
	return currentPath.endsWith("/login.html") || currentPath.endsWith("/register.html");
};

const resolveLoginPath = () => {
	const currentPath = window.location.pathname.toLowerCase();
	return currentPath.includes("/pages/") ? "login.html" : "./pages/login.html";
};

const handleUnauthorized = () => {
	clearAuthStorage();

	if (!isAuthPage()) {
		window.location.href = resolveLoginPath();
	}
};

const createRequestHeaders = ({ headers = {}, requiresAuth = true, data, forcedToken }) => {
	const requestHeaders = new Headers(headers);

	if (!isFormData(data) && data !== undefined && !requestHeaders.has("Content-Type")) {
		requestHeaders.set("Content-Type", "application/json");
	}

	if (requiresAuth && !requestHeaders.has("Authorization")) {
		// SỬA ĐOẠN NÀY: Ưu tiên dùng forcedToken nếu có
		const token = forcedToken || getToken();
		if (token.length > 0) {
			requestHeaders.set("Authorization", `Bearer ${token}`);
		}
	}

	if (isFormData(data) && requestHeaders.has("Content-Type")) {
		requestHeaders.delete("Content-Type");
	}

	return requestHeaders;
};

const createBody = (data) => {
	if (data === undefined) {
		return undefined;
	}

	if (isFormData(data)) {
		return data;
	}

	if (typeof data === "string") {
		return data;
	}

	return JSON.stringify(data);
};

const resolveApiUrl = (endpoint) => {
	if (typeof endpoint !== "string") {
		return endpoint;
	}

	if (/^https?:\/\//i.test(endpoint)) {
		return endpoint;
	}

	const baseUrl = typeof API_BASE_URL === "string" ? API_BASE_URL.trim().replace(/\/+$/, "") : "";
	if (baseUrl.length === 0) {
		return endpoint;
	}

	const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
	return `${baseUrl}${normalizedEndpoint}`;
};

export const apiClient = {
	async request(endpoint, options = {}) {
		const {
			method = "GET",
			data,
			headers,
			requiresAuth = true,
			skipAuthRedirect = false,
			forcedToken, // THÊM DÒNG NÀY
			...restOptions
		} = options;

		const fullUrl = endpoint.startsWith("http") ? endpoint : `${BASE_URL}${endpoint}`;

		const response = await fetch(fullUrl, {
			...restOptions,
			method,
			headers: createRequestHeaders({ headers, requiresAuth, data, forcedToken }),
			body: createBody(data),
			credentials: "include"
		});

		const responseData = await parseJsonSafely(response);

		// Nếu lỗi 401 (Hết hạn Token), văng luôn về trang Login
		if (response.status === 401 && !skipAuthRedirect) {
			handleUnauthorized();
			throw buildApiError(response, responseData);
		}

		if (!response.ok) {
			throw buildApiError(response, responseData);
		}

		return responseData;
	},

	async get(endpoint, options = {}) {
		return this.request(endpoint, {
			...options,
			method: "GET"
		});
	},

	async post(endpoint, data, options = {}) {
		return this.request(endpoint, {
			...options,
			method: "POST",
			data
		});
	}
};