"use strict";

import { apiClient } from "./api-client.js";

const normalizeValue = (value) => {
	if (typeof value !== "string") {
		return "";
	}

	const trimmedValue = value.trim();
	return trimmedValue.length > 0 ? trimmedValue : "";
};

const buildFeedQueryString = (lastId, provinceCode, topicCode, feedType) => {
	const params = new URLSearchParams();

	const safeLastId = normalizeValue(lastId);
	const safeProvinceCode = normalizeValue(provinceCode);
	const safeTopicCode = normalizeValue(topicCode);

	if (safeLastId.length > 0) {
		params.set("lastPostId", safeLastId);
	}

	if (safeProvinceCode.length > 0) {
		params.set("provinceCode", safeProvinceCode);
	}

	if (safeTopicCode.length > 0) {
		params.set("topicCode", safeTopicCode);
	}

	if (typeof feedType === "string" && feedType.trim().length > 0) {
		params.set("feedType", feedType.trim());
	}

	return params.toString();
};

const buildFeedUrl = (lastId, provinceCode, topicCode, feedType) => {
	const queryString = buildFeedQueryString(lastId, provinceCode, topicCode, feedType);
	return queryString.length > 0 ? `/api/posts?${queryString}` : "/api/posts";
};

export const feedApi = {
	async getDropdownData() {
		return apiClient.get("/api/master-data", {
			requiresAuth: false,
			skipAuthRedirect: true
		});
	},

	/**
	 * Lấy Newsfeed (Explore hoặc Following), hỗ trợ cursor-based pagination.
	 * GET /api/posts?lastPostId=...&provinceCode=...&topicCode=...&feedType=...
	 * @param {string} lastId - ID bài viết cuối cùng đã tải (cursor).
	 * @param {string} provinceCode - Mã tỉnh/thành phố ("") = tất cả.
	 * @param {string} topicCode - Mã chủ đề ("") = tất cả.
	 * @param {"EXPLORE"|"FOLLOWING"|""} feedType - Loại feed.
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
	 *       isLiked: boolean
	 *     }>,
	 *     respLastPostId: string,
	 *     hasMore: boolean
	 *   }
	 * }>}
	 */
	async getFeed(lastId, provinceCode, topicCode, feedType = "") {
		return apiClient.get(buildFeedUrl(lastId, provinceCode, topicCode, feedType));
	},

	async getExploreFeed(lastId, provinceCode, topicCode) {
		return apiClient.get(buildFeedUrl(lastId, provinceCode, topicCode, "EXPLORE"));
	},

	async getFollowingFeed(lastId, provinceCode, topicCode) {
		return apiClient.get(buildFeedUrl(lastId, provinceCode, topicCode, "FOLLOWING"));
	},

	/**
	 * Tìm kiếm bài viết theo keyword, hỗ trợ cursor-based pagination và bộ lọc.
	 * GET /api/posts?keyword=...&lastPostId=...&provinceCode=...&topicCode=...
	 * @param {string} keyword - Từ khóa tìm kiếm.
	 * @param {string} lastPostId - Cursor phân trang.
	 * @param {string} provinceCode - Mã tỉnh ("" = tất cả).
	 * @param {string} topicCode - Mã chủ đề ("" = tất cả).
	 * @returns {Promise<{data: {postList: object[], respLastPostId: string, hasMore: boolean}}>}
	 */
	async searchPosts(keyword = "", lastPostId = "", provinceCode = "", topicCode = "") {
		const params = new URLSearchParams();

		const safeKeyword = normalizeValue(keyword);
		if (safeKeyword.length > 0) {
			params.set("keyword", safeKeyword);
		}

		const safeLastPostId = normalizeValue(lastPostId);
		if (safeLastPostId.length > 0) {
			params.set("lastPostId", safeLastPostId);
		}

		const safeProvinceCode = normalizeValue(provinceCode);
		if (safeProvinceCode.length > 0 && safeProvinceCode !== "ALL") {
			params.set("provinceCode", safeProvinceCode);
		}

		const safeTopicCode = normalizeValue(topicCode);
		if (safeTopicCode.length > 0 && safeTopicCode !== "ALL") {
			params.set("topicCode", safeTopicCode);
		}

		const queryString = params.toString();
		return apiClient.get(queryString.length > 0 ? `/api/posts?${queryString}` : "/api/posts");
	}
};
