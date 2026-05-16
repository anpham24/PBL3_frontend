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
	 * PATCH /api/users/me/profile
	 * Headers: Authorization: Bearer {token} (inject tự động bởi apiClient)
	 * Body (FormData): file (nullable), nickname (string), bio (string)
	 * @param {FormData} formData
	 * @returns {Promise<{code: number, message: string, data: {avtUrl: string, nickname: string, bio: string}}>}
	 */
	async updateMyProfile(formData) {
		if (!(formData instanceof FormData)) {
			throw new Error("Profile form data is invalid.");
		}

		return apiClient.patch("/api/users/me/profile", formData);
	},

	async searchUsers(keyword = "", lastUserId = "") {
		const resolvedKeyword = normalizeKeyword(keyword);

		if (resolvedKeyword.length === 0) {
			throw new Error("Vui lòng nhập từ khóa tìm kiếm");
		}

		const params = new URLSearchParams();
		params.set("keyword", resolvedKeyword);

		const resolvedLastUserId = normalizeKeyword(lastUserId);
		if (resolvedLastUserId.length > 0) {
			params.set("lastUserId", resolvedLastUserId);
		}

		return apiClient.get(`/api/users?${params.toString()}`);
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

	/**
	 * Lấy hồ sơ của một người dùng bất kỳ theo userId.
	 * GET /api/users/{userId}/profile
	 * Trả về thông tin user + trường isFollowing (true/false).
	 * @param {string|number} userId
	 * @returns {Promise<{code: number, data: {user: object, isFollowing: boolean}}>}
	 */
	async getProfileById(userId) {
		const resolvedUserId = normalizeUserId(userId);

		if (resolvedUserId.length === 0) {
			throw new Error("Missing user id.");
		}

		return apiClient.get(`/api/users/${encodeURIComponent(resolvedUserId)}/profile`);
	},

	/**
	 * Lấy danh sách bài viết của một người dùng bất kỳ theo userId (cursor-based pagination).
	 * GET /api/users/{userId}/posts?lastPostId={lastPostId}
	 * Cấu trúc response giống hoàn toàn /api/users/me/posts.
	 * @param {string|number} userId
	 * @param {string|null} lastPostId - ID bài cuối đã tải. Null = lần đầu tiên.
	 * @returns {Promise<{data: {postList: object[], respLastPostId: string, hasMore: boolean}}>}
	 */
	async getPostsByUserId(userId, lastPostId = null) {
		const resolvedUserId = normalizeUserId(userId);

		if (resolvedUserId.length === 0) {
			throw new Error("Missing user id.");
		}

		const params = new URLSearchParams();
		const resolvedLastPostId = normalizeUserId(lastPostId); // reuse normalizer (handles string/number/null)
		if (resolvedLastPostId.length > 0) {
			params.set("lastPostId", resolvedLastPostId);
		}

		const queryString = params.toString();
		const endpoint = queryString.length > 0
			? `/api/users/${encodeURIComponent(resolvedUserId)}/posts?${queryString}`
			: `/api/users/${encodeURIComponent(resolvedUserId)}/posts`;

		return apiClient.get(endpoint);
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
