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

	async likeCurrentPostFromCommentModal(liked) {
		return apiClient.post("/api/posts/current/like", {
			liked: toBoolean(liked),
			source: "comment-modal"
		});
	},

	async saveCurrentPostFromCommentModal(saved) {
		return apiClient.post("/api/posts/current/save", {
			saved: toBoolean(saved),
			source: "comment-modal"
		});
	},

	async likePost(postId, liked) {
		return this.toggleLike(postId, liked);
	},

	async savePost(postId, saved) {
		const resolvedPostId = toSafeId(postId, "post-1");

		return apiClient.post(`/api/posts/${encodeURIComponent(resolvedPostId)}/save`, {
			saved: toBoolean(saved)
		});
	},

	async likeComment(commentId, liked) {
		const resolvedCommentId = toSafeId(commentId, "comment-1");

		return apiClient.post(`/api/comments/${encodeURIComponent(resolvedCommentId)}/like`, {
			liked: toBoolean(liked)
		});
	}
};
