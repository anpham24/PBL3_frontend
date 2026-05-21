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
	},

	/**
	 * Xóa một bình luận.
	 * DELETE /api/comments/{commentId}
	 * @param {string} commentId - ID bình luận cần xóa.
	 * @returns {Promise<{message: string}>}
	 */
	async deleteComment(commentId) {
		const resolvedCommentId = toSafeId(commentId, "");
		if (resolvedCommentId.length === 0) {
			throw new Error("Thiếu commentId hợp lệ.");
		}
		return apiClient.delete(`/api/comments/${encodeURIComponent(resolvedCommentId)}`);
	},

	/**
	 * Lấy danh sách phiếu báo cáo bài đăng cho Admin/Moderator (cursor-based pagination).
	 * GET /api/admin/reports?lastReportId={lastReportId}&keyword={keyword}
	 *
	 * @param {object} [params]
	 * @param {string|null} [params.lastReportId] - ID phiếu báo cáo cuối để phân trang. Null = trang đầu.
	 * @param {string}      [params.keyword]      - Từ khóa tìm kiếm theo tên hoặc nội dung.
	 * @returns {Promise<{
	 *   data: {
	 *     reportList: Array<{
	 *       reportId: string,
	 *       post: {
	 *         id: string,
	 *         authorId: string,
	 *         authorName: string,
	 *         avtUrl: string,
	 *         createAt: string,
	 *         visibility: string,
	 *         province: string,
	 *         topic: string,
	 *         content: string,
	 *         address: string,
	 *         mediaList: Array<{mediaType: string, mediaUrl: string, thumbnailUrl: string|null}>
	 *       },
	 *       reasonList: Array<{reasonCode: string, count: number}>
	 *     }>,
	 *     respLastReportId: string,
	 *     hasMore: boolean
	 *   }
	 * }>}
	 */
	async getAdminReports({ lastReportId = null, keyword = "" } = {}) {
		const params = new URLSearchParams();

		const resolvedLastId = toSafeId(lastReportId, "");
		if (resolvedLastId.length > 0) {
			params.set("lastReportId", resolvedLastId);
		}

		const resolvedKeyword = normalizeKeyword(keyword);
		if (resolvedKeyword.length > 0) {
			params.set("keyword", resolvedKeyword);
		}

		const queryString = params.toString();
		const endpoint = queryString.length > 0
			? `/api/admin/reports?${queryString}`
			: "/api/admin/reports";

		return apiClient.get(endpoint);
	},

	/**
	 * Xử lý phiếu báo cáo (Admin/Moderator).
	 * POST /api/admin/reports/{reportId}/resolve
	 *
	 * @param {string} reportId   - ID phiếu báo cáo cần xử lý.
	 * @param {object} payload
	 * @param {'APPROVED'|'REJECTED'} payload.action - Hành động xử lý.
	 * @param {string} [payload.reasonCode]           - Mã lý do vi phạm (bắt buộc khi APPROVED).
	 * @param {string} [payload.note]                 - Ghi chú của moderator.
	 * @returns {Promise<{message: string}>}
	 */
	async resolveReport(reportId, { action, reasonCode = "", note = "" } = {}) {
		const resolvedReportId = toSafeId(reportId, "");
		if (resolvedReportId.length === 0) {
			throw new Error("Thiếu reportId hợp lệ.");
		}

		const body = { action };
		const resolvedReasonCode = normalizeKeyword(reasonCode);
		if (resolvedReasonCode.length > 0) {
			body.reasonCode = resolvedReasonCode;
		}
		const resolvedNote = normalizeKeyword(note);
		if (resolvedNote.length > 0) {
			body.note = resolvedNote;
		}

		return apiClient.post(
			`/api/admin/reports/${encodeURIComponent(resolvedReportId)}/resolve`,
			body
		);
	}
};
