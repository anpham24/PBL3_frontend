"use strict";

import { apiClient } from "./api-client.js";

const normalizeUserId = (userId) => {
	if (typeof userId === "number" && Number.isFinite(userId)) {
		return String(userId);
	}

	if (typeof userId !== "string") {
		return "";
	}

	return userId.trim();
};

const normalizeKeyword = (keyword) => {
	if (typeof keyword !== "string") {
		return "";
	}

	return keyword.trim();
};

export const userApi = {
	/**
	 * Đổi mật khẩu của người dùng đang đăng nhập.
	 * PUT /api/users/me/password
	 * @param {string} oldPassword - Mật khẩu hiện tại.
	 * @param {string} newPassword - Mật khẩu mới muốn đặt.
	 * @returns {Promise<{code: number, message: string}>}
	 */
	async changePassword(oldPassword, newPassword) {
		return apiClient.put("/api/users/me/password", { oldPassword, newPassword });
	},


	/**
	 * Cập nhật hồ sơ cá nhân của người dùng đang đăng nhập.
	 * PUT /api/users/me/profile
	 * Body (FormData): file (nullable), nickname, bio
	 * @param {FormData} formData
	 * @returns {Promise<{code: number, message: string}>}
	 */
	async updateMyProfile(formData) {
		if (!(formData instanceof FormData)) {
			throw new Error("Profile form data is invalid.");
		}

		return apiClient.put("/api/users/me/profile", formData);
	},

	// Alias giữ tương thích ngược — đều gọi đúng endpoint mới
	async updateProfile(payload) {
		if (payload instanceof FormData) {
			return apiClient.put("/api/users/me/profile", payload);
		}

		const formData = new FormData();
		if (typeof payload?.nickname === "string") {
			formData.append("nickname", payload.nickname);
		}

		if (typeof payload?.bio === "string") {
			formData.append("bio", payload.bio);
		}

		if (payload?.file instanceof File) {
			formData.append("file", payload.file);
		}

		return apiClient.put("/api/users/me/profile", formData);
	},

	async updateProfileWithAvatar(formData) {
		if (!(formData instanceof FormData)) {
			throw new Error("Profile form data is invalid.");
		}

		return apiClient.put("/api/users/me/profile", formData);
	},

	async getUsers(keyword = "") {
		const resolvedKeyword = normalizeKeyword(keyword);
		const params = new URLSearchParams();

		if (resolvedKeyword.length > 0) {
			params.set("keyword", resolvedKeyword);
		}

		const queryString = params.toString();
		const endpoint = queryString.length > 0 ? `/api/users?${queryString}` : "/api/users";

		try {
			return await apiClient.get(endpoint);
		} catch (error) {
			if (Number(error?.status) !== 404) {
				throw error;
			}

			const fallbackEndpoint = queryString.length > 0 ? `/api/admin/users?${queryString}` : "/api/admin/users";
			return apiClient.get(fallbackEndpoint);
		}
	},

	async blockUser(userId) {
		const resolvedUserId = normalizeUserId(userId);

		if (resolvedUserId.length === 0) {
			throw new Error("Missing user id.");
		}

		try {
			return await apiClient.put(`/api/users/${encodeURIComponent(resolvedUserId)}/block`, {});
		} catch (error) {
			if (Number(error?.status) !== 404) {
				throw error;
			}

			return apiClient.put(`/api/admin/users/${encodeURIComponent(resolvedUserId)}/block`, {});
		}
	},

	async deleteUser(userId) {
		const resolvedUserId = normalizeUserId(userId);

		if (resolvedUserId.length === 0) {
			throw new Error("Missing user id.");
		}

		try {
			return await apiClient.delete(`/api/users/${encodeURIComponent(resolvedUserId)}`);
		} catch (error) {
			if (Number(error?.status) !== 404) {
				throw error;
			}

			return apiClient.delete(`/api/admin/users/${encodeURIComponent(resolvedUserId)}`);
		}
	},

	async getProfileById(userId) {
		const resolvedUserId = normalizeUserId(userId);

		if (resolvedUserId.length === 0) {
			throw new Error("Missing user id.");
		}

		const query = new URLSearchParams({ id: resolvedUserId });
		return apiClient.get(`/api/users/profile?${query.toString()}`);
	},

	/**
	 * Lấy hồ sơ cá nhân của người dùng đang đăng nhập.
	 * GET /api/users/me/profile
	 * Yêu cầu Authorization header (được inject tự động bởi apiClient).
	 * @returns {Promise<{code: number, data: {user: object}}>}
	 */
	async getMyProfile() {
		return apiClient.get("/api/users/me/profile");
	},
};
