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

	/**
	 * Cập nhật bài đăng đã có.
	 * PUT /api/posts/{postId}
	 * @param {string} postId - ID bài đăng cần cập nhật.
	 * @param {FormData} formData - Dữ liệu cập nhật (multipart/form-data).
	 *   Các trường bắt buộc:
	 *   - isMediaChanged (string "true"|"false")
	 *   - oldUrls (string[]) — các URL media cũ được giữ lại
	 *   - newFiles (File[])  — các file media mới
	 *   - visibility, content, address
	 * @returns {Promise<{code: number, message: string}>}
	 */
	async updatePost(postId, formData) {
		const resolvedPostId = normalizePostId(postId);

		if (!(formData instanceof FormData)) {
			throw new Error("Dữ liệu cập nhật bài không hợp lệ.");
		}

		return apiClient.put(`/api/posts/${encodeURIComponent(resolvedPostId)}`, formData);
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

	/**
	 * Lấy danh sách lý do báo cáo.
	 * GET /api/reports/reasons
	 * @returns {Promise<{data: {reportReasons: Array<{code: string, reason: string}>}}>}
	 */
	async getReportReasons() {
		return apiClient.get("/api/reports/reasons");
	},

	/**
	 * Báo cáo một bài đăng.
	 * POST /api/posts/{postId}/reports
	 * @param {string} postId - ID bài đăng cần báo cáo.
	 * @param {string} reasonCode - Mã lý do báo cáo (lấy từ getReportReasons).
	 * @returns {Promise<{message: string}>}
	 */
	async reportPost(postId, reasonCode) {
		const resolvedPostId = normalizePostId(postId);
		const resolvedReasonCode = toSafeId(reasonCode, "OTHER");

		return apiClient.post(`/api/posts/${encodeURIComponent(resolvedPostId)}/reports`, {
			reasonCode: resolvedReasonCode
		});
	},

	/**
	 * Lấy danh sách bài viết của người dùng đang đăng nhập (cursor-based pagination).
	 * GET /api/users/me/posts?last_id={lastId}
	 * @param {string|null} lastId - ID bài cuối đã tải. Null = lần đầu tiên.
	 * @returns {Promise<{
	 *   data: {
	 *     postList: Array<{
	 *       id: string,
	 *       authorId: string,
	 *       authorName: string,
	 *       avtUrl: string,
	 *       createAt: string,
	 *       visibility: string,
	 *       province: string,
	 *       topic: string,
	 *       content: string,
	 *       address: string,
	 *       mediaList: Array<{mediaType: string, mediaUrl: string, thumbnailUrl: string|null}>,
	 *       likeCount: number,
	 *       commentCount: number,
	 *       isOwner: boolean
	 *     }>,
	 *     respLastPostId: string,
	 *     hasMore: boolean
	 *   }
	 * }>}
	 */
	async getMyPosts(lastId = null) {
		const params = new URLSearchParams();

		const resolvedLastId = toSafeId(lastId, "");
		if (resolvedLastId.length > 0) {
			params.set("last_id", resolvedLastId);
		}

		const queryString = params.toString();
		const endpoint = queryString.length > 0
			? `/api/users/me/posts?${queryString}`
			: "/api/users/me/posts";

		return apiClient.get(endpoint);
	},

	/**
	 * Lấy danh sách bình luận của một bài đăng (cursor-based pagination).
	 * GET /api/posts/{postId}/comments?lastCommentId={lastId}
	 * @param {string} postId - ID bài đăng cần lấy bình luận.
	 * @param {string|null} lastId - ID bình luận cuối đã tải. Null = lần đầu tiên.
	 * @returns {Promise<{data: {commentList: object[], respLastCommentId: string, hasMore: boolean}}>}
	 */
	async getComments(postId, lastId = null) {
		const resolvedPostId = normalizePostId(postId);
		const params = new URLSearchParams();

		const resolvedLastId = toSafeId(lastId, "");
		if (resolvedLastId.length > 0) {
			params.set("lastCommentId", resolvedLastId);
		}

		const queryString = params.toString();
		const endpoint = queryString.length > 0
			? `/api/posts/${encodeURIComponent(resolvedPostId)}/comments?${queryString}`
			: `/api/posts/${encodeURIComponent(resolvedPostId)}/comments`;

		return apiClient.get(endpoint);
	},

	/**
	 * Tạo bình luận mới cho một bài đăng.
	 * POST /api/posts/{postId}/comments
	 */
	async createComment(postId, content) {
		const resolvedPostId = normalizePostId(postId);
		const resolvedContent = typeof content === "string" ? content.trim() : "";

		if (resolvedContent.length === 0) {
			throw new Error("Nội dung bình luận không được để trống.");
		}

		return apiClient.post(`/api/posts/${encodeURIComponent(resolvedPostId)}/comments`, {
			content: resolvedContent
		});
	}
};
