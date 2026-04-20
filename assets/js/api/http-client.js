"use strict";

import { apiClient } from "./api-client.js";

const transformLegacyRequestOptions = (options = {}) => {
	const {
		headers,
		body,
		method = "GET",
		requiresAuth,
		skipAuthRedirect,
		...restOptions
	} = options;

	let data = body;
	if (typeof body === "string") {
		try {
			data = JSON.parse(body);
		} catch {
			data = body;
		}
	}

	return {
		headers,
		method,
		data,
		requiresAuth,
		skipAuthRedirect,
		...restOptions
	};
};

export const httpClient = {
	async request(endpoint, options = {}) {
		return apiClient.request(endpoint, transformLegacyRequestOptions(options));
	},

	async get(endpoint, options = {}) {
		return apiClient.get(endpoint, options);
	},

	async post(endpoint, data, options = {}) {
		return apiClient.post(endpoint, data, options);
	}
};
