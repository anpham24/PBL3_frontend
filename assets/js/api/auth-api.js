"use strict";

import { apiClient } from "./api-client.js";

export const authApi = {
	async register(payload) {
		return apiClient.post("/api/auth/register", payload, {
			requiresAuth: false,
			skipAuthRedirect: true
		});
	},

	async login(payload) {
		return apiClient.post("/api/auth/login", payload, {
			requiresAuth: false,
			skipAuthRedirect: true
		});
	},

	async logout() {
		return apiClient.post("/api/auth/logout", {});
	},

	async getProfile() {
		return apiClient.get("/api/users/profile/me");
	}
};
