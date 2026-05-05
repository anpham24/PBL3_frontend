"use strict";

import { apiClient } from "./api-client.js";
import { toBoolean, toSafeId } from "../utils/helpers.js";

const normalizePostId = (postId) => {
	const resolvedPostId = toSafeId(postId, "");

	if (resolvedPostId.length === 0) {
		throw new Error("Thiếu postId hợp lệ.");
	}

	return resolvedPostId;
};

const normalizeKeyword = (value) => {
	if (typeof value !== "string") {
		return "";
	}

	return value.trim();
};

export const postApi = {
	async createPost(formData) {
		if (!(formData instanceof FormData)) {
			throw new Error("Dữ liệu đăng bài không hợp lệ.");
		}

		return apiClient.post("/api/posts", formData);
	},

	async toggleLike(postId) {
		const resolvedPostId = normalizePostId(postId);

		return apiClient.post(`/api/posts/${encodeURIComponent(resolvedPostId)}/like`);
	},

	async likeComment(commentId, liked) {
		const resolvedCommentId = toSafeId(commentId, "comment-1");

		return apiClient.post(`/api/comments/${encodeURIComponent(resolvedCommentId)}/like`, {
			liked: toBoolean(liked)
		});
	},

	async getReportedPosts(keyword = "") {
		const resolvedKeyword = normalizeKeyword(keyword);
		const params = new URLSearchParams();

		if (resolvedKeyword.length > 0) {
			params.set("keyword", resolvedKeyword);
		}

		const queryString = params.toString();
		const endpoint = queryString.length > 0 ? `/api/reports/posts?${queryString}` : "/api/reports/posts";

		try {
			return await apiClient.get(endpoint);
		} catch (error) {
			if (Number(error?.status) !== 404) {
				throw error;
			}

			const fallbackEndpoint = queryString.length > 0 ? `/api/posts/reported?${queryString}` : "/api/posts/reported";
			return apiClient.get(fallbackEndpoint);
		}
	},

	async deletePost(postId) {
		const resolvedPostId = normalizePostId(postId);
		return apiClient.delete(`/api/posts/${encodeURIComponent(resolvedPostId)}`);
	},

	async reportPost(postId, reasonCode, details = "") {
		const resolvedPostId = normalizePostId(postId);
		const payload = {
			reason: toSafeId(reasonCode, "OTHER"),
			details: typeof details === "string" ? details.trim() : ""
		};

		try {
			return await apiClient.post(`/api/posts/${encodeURIComponent(resolvedPostId)}/report`, payload);
		} catch (error) {
			if (Number(error?.status) !== 404) {
				throw error;
			}

			return apiClient.post(`/api/reports/posts/${encodeURIComponent(resolvedPostId)}`, payload);
		}
	}
};
