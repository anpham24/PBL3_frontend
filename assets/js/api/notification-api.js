/**
 * @file notification-api.js
 * @module api/notification
 *
 * Tập hợp các API call liên quan đến thông báo (Notifications).
 * Tuân thủ pattern của project: dùng apiClient từ api-client.js.
 */

"use strict";

import { apiClient } from "./api-client.js";

export const notificationApi = {
	/**
	 * Lấy số thông báo chưa đọc của người dùng hiện tại.
	 * GET /api/notifications/unread-count
	 * @returns {Promise<{ data: { unreadCount: number } }>}
	 */
	async getUnreadCount() {
		return apiClient.get("/api/notifications/unread-count");
	},

	/**
	 * Lấy danh sách thông báo (cursor-based pagination).
	 * GET /api/notifications?lastNotiId={lastNotiId}
	 * @param {string|null} lastNotiId - ID thông báo cuối cùng đã tải (trang đầu để trống/null).
	 * @returns {Promise<{
	 *   data: {
	 *     notifications: Array<{
	 *       id: string,
	 *       targetId: string,
	 *       avtUrl: string,
	 *       content: string,
	 *       isRead: boolean,
	 *       createAt: string,
	 *       type: "LIKE_POST" | "COMMENT" | "NEW_POST" | "FOLLOW"
	 *     }>,
	 *     respLastNotiId: string,
	 *     hasMore: boolean
	 *   }
	 * }>}
	 */
	async getNotifications(lastNotiId = null) {
		const params = new URLSearchParams();

		if (typeof lastNotiId === "string" && lastNotiId.trim().length > 0) {
			params.set("lastNotiId", lastNotiId.trim());
		}

		const queryString = params.toString();
		const endpoint = queryString.length > 0
			? `/api/notifications?${queryString}`
			: "/api/notifications";

		return apiClient.get(endpoint);
	},

	/**
	 * Lấy chi tiết một bài đăng (dùng khi click vào thông báo).
	 * GET /api/posts/{postId}
	 * @param {string} postId - ID bài đăng cần lấy.
	 * @returns {Promise<{ data: object }>}
	 */
	async getPostById(postId) {
		if (typeof postId !== "string" || postId.trim().length === 0) {
			throw new Error("Thiếu postId hợp lệ.");
		}
		return apiClient.get(`/api/posts/${encodeURIComponent(postId.trim())}`);
	},

	/**
	 * Đánh dấu tất cả thông báo là đã đọc.
	 * PATCH /api/notifications
	 * Body: { "isRead": true }
	 * @returns {Promise<{ message: string }>}
	 */
	async markAllAsRead() {
		return apiClient.patch("/api/notifications", { isRead: true });
	}
};
