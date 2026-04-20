"use strict";

import { clearAuthStorage, getToken } from "../utils/auth.js";

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

const createRequestHeaders = ({ headers = {}, requiresAuth = true, data }) => {
	const requestHeaders = new Headers(headers);

	if (!isFormData(data) && data !== undefined && !requestHeaders.has("Content-Type")) {
		requestHeaders.set("Content-Type", "application/json");
	}

	if (requiresAuth && !requestHeaders.has("Authorization")) {
		const token = getToken();
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

export const apiClient = {
	async request(endpoint, options = {}) {
		const {
			method = "GET",
			data,
			headers,
			requiresAuth = true,
			skipAuthRedirect = false,
			...restOptions
		} = options;

		const response = await fetch(endpoint, {
			...restOptions,
			method,
			headers: createRequestHeaders({ headers, requiresAuth, data }),
			body: createBody(data)
		});

		const responseData = await parseJsonSafely(response);

		if (response.status === 401 && !skipAuthRedirect) {
			handleUnauthorized();
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
